import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json({ limit: "2mb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "postgres",
});

let queue = Promise.resolve();
function runExclusive(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

function isSingleStatement(sql) {
  const s = sql.trim();
  const idx = s.indexOf(";");
  if (idx === -1) return true;
  return idx === s.length - 1;
}
function looksLikeSelect(sql) {
  const s = sql.trim().toLowerCase();
  return s.startsWith("select") || s.startsWith("with");
}

function normalizeCell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function toTable(result, limit = 200) {
  const columns = result.fields.map(f => f.name);
  const rowsAll = result.rows || [];
  const rows = rowsAll.slice(0, limit).map(r => columns.map(c => normalizeCell(r[c])));
  return { columns, rows, truncated: rowsAll.length > limit };
}

function multisetDiff(actualRows, expectedRows) {
  const key = (row) => JSON.stringify(row);
  const count = new Map();
  for (const r of actualRows) count.set(key(r), (count.get(key(r)) || 0) + 1);

  const missing = [];
  for (const r of expectedRows) {
    const k = key(r);
    const n = count.get(k) || 0;
    if (n <= 0) missing.push(r);
    else count.set(k, n - 1);
  }

  const extra = [];
  for (const [k, n] of count.entries()) {
    for (let i = 0; i < n; i++) extra.push(JSON.parse(k));
  }
  return { missing, extra };
}

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function compare(actualTable, expected) {
  const orderSensitive = !!expected.order_sensitive;
  const expCols = expected.columns || [];
  const expRows = (expected.rows || []).map(r => r.map(normalizeCell));

  const actColsLower = actualTable.columns.map(c => String(c).toLowerCase());
  const expColsLower = expCols.map(c => String(c).toLowerCase());
  const columnsMatch =
    actColsLower.length === expColsLower.length &&
    actColsLower.every((c, i) => c === expColsLower[i]);

  let rowsMatch = false;
  let diff = { missing: [], extra: [] };

  if (columnsMatch) {
    const actRows = actualTable.rows.map(r => r.map(normalizeCell));
    if (orderSensitive) {
      rowsMatch =
        actRows.length === expRows.length &&
        actRows.every((r, i) => JSON.stringify(r) === JSON.stringify(expRows[i]));
      if (!rowsMatch) diff = multisetDiff(actRows, expRows);
    } else {
      diff = multisetDiff(actRows, expRows);
      rowsMatch = diff.missing.length === 0 && diff.extra.length === 0;
    }
  }

  const status = columnsMatch && rowsMatch ? "AC" : "WA";
  return {
    status,
    expected: { columns: expCols, rows: expRows, order_sensitive: orderSensitive },
    diff: { missing: diff.missing.slice(0, 20), extra: diff.extra.slice(0, 20) }
  };
}

async function runOneCase(client, sql, oneCase) {
  const schema = `sandbox_${crypto.randomBytes(6).toString("hex")}`;
  const started = Date.now();
  const name = oneCase?.name || schema;

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 2000");

    await client.query(`CREATE SCHEMA ${quoteIdent(schema)}`);
    await client.query(`SET LOCAL search_path TO ${quoteIdent(schema)}`);

    const tlist = Array.isArray(oneCase?.tables) ? oneCase.tables : [];
    for (const t of tlist) {
      if (!t?.name || !Array.isArray(t.columns)) {
        throw new Error("case.tables 格式不对：每个表需要 name + columns");
      }
      const colDefs = t.columns.map(([n, ty]) => `${quoteIdent(n)} ${ty}`).join(", ");
      await client.query(`CREATE TABLE ${quoteIdent(t.name)} (${colDefs})`);

      const rows = Array.isArray(t.rows) ? t.rows : [];
      if (rows.length) {
        const colNames = t.columns.map(([n]) => quoteIdent(n)).join(", ");
        const placeholders = t.columns.map((_, i) => `$${i + 1}`).join(", ");
        const insertSql = `INSERT INTO ${quoteIdent(t.name)} (${colNames}) VALUES (${placeholders})`;
        for (const r of rows) await client.query(insertSql, r);
      }
    }

    const cleanedSql = sql.trim().endsWith(";") ? sql.trim().slice(0, -1) : sql.trim();
    const result = await client.query(cleanedSql);
    const actual = toTable(result, 200);

    await client.query(`DROP SCHEMA ${quoteIdent(schema)} CASCADE`);
    await client.query("COMMIT");

    const runtimeMs = Date.now() - started;
    const expected = oneCase?.expected || null;

    if (!expected) {
      return { name, status: "OK", runtimeMs, actual };
    }

    const cmp = compare(actual, expected);
    return { name, runtimeMs, actual, ...cmp };

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    const runtimeMs = Date.now() - started;
    return { name, status: "ERROR", runtimeMs, error: String(err?.message || err) };
  }
}

app.post("/api/run", async (req, res) => {
  const { problemText, tablesJson, sql } = req.body || {};

  if (!sql || typeof sql !== "string") return res.status(400).json({ ok: false, error: "sql 不能为空" });
  if (!isSingleStatement(sql)) return res.status(400).json({ ok: false, error: "只允许单条 SQL（最多末尾一个分号）" });
  if (!looksLikeSelect(sql)) return res.status(400).json({ ok: false, error: "只允许 SELECT / WITH 查询" });

  let payload;
  try {
    payload = JSON.parse(tablesJson || "{}");
  } catch {
    return res.status(400).json({ ok: false, error: "样例 JSON 不是合法 JSON" });
  }

  // 兼容：如果用户仍旧输入旧格式 {tables:[...]}，自动包成一个 case
  let cases = [];
  if (Array.isArray(payload?.cases)) cases = payload.cases;
  else if (Array.isArray(payload?.tables)) cases = [{ name: "case1", tables: payload.tables }];
  else cases = [];

  if (cases.length === 0) {
    return res.status(400).json({ ok: false, error: "没有找到 cases（或 tables）" });
  }

  return runExclusive(async () => {
    const client = await pool.connect();
    try {
      const results = [];
      for (const c of cases) {
        results.push(await runOneCase(client, sql, c));
      }

      // 汇总状态：只要有 ERROR 就 ERROR；否则只要有 WA 就 WA；否则 AC/OK
      let overall = "OK";
      if (results.some(r => r.status === "ERROR")) overall = "ERROR";
      else if (results.some(r => r.status === "WA")) overall = "WA";
      else if (results.some(r => r.status === "AC")) overall = "AC";

      return res.json({
        ok: true,
        overall,
        problemText: problemText || "",
        cases: results
      });
    } finally {
      client.release();
    }
  });
});

app.listen(3000, () => console.log("Open http://localhost:3000"));

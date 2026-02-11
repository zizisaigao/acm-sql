const $ = (id) => document.getElementById(id);

function renderTable(container, table) {
  const wrap = document.createElement("div");
  if (!table || !table.columns) return wrap;

  const info = document.createElement("div");
  info.className = "small";
  info.textContent = table.truncated ? "结果已截断（最多显示 200 行）" : "";
  wrap.appendChild(info);

  const tbl = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const c of table.columns) {
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of table.rows) {
    const tr = document.createElement("tr");
    for (const v of r) {
      const td = document.createElement("td");
      td.textContent = v === null ? "NULL" : String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);

  return wrap;
}

function presetMulti() {
  $("tablesJson").value = JSON.stringify({
    cases: [
      {
        name: "case1",
        tables: [
          {
            name: "employees",
            columns: [["id","INT"],["name","TEXT"],["salary","INT"]],
            rows: [[1,"Alice",100],[2,"Bob",80],[3,"Cindy",120]]
          }
        ],
        expected: { columns: ["name"], rows: [["Cindy"]], order_sensitive: false }
      },
      {
        name: "case2",
        tables: [
          {
            name: "employees",
            columns: [["id","INT"],["name","TEXT"],["salary","INT"]],
            rows: [[1,"Dan",50],[2,"Eva",60]]
          }
        ],
        expected: { columns: ["name"], rows: [["Eva"]], order_sensitive: false }
      }
    ]
  }, null, 2);

  $("sql").value = "SELECT name FROM employees ORDER BY salary DESC LIMIT 1;";
}
presetMulti();

$("runBtn").addEventListener("click", async () => {
  $("status").textContent = "运行中...";
  $("raw").textContent = "";
  $("result").innerHTML = "";

  const body = {
    problemText: $("problemText").value,
    tablesJson: $("tablesJson").value,
    sql: $("sql").value
  };

  const resp = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await resp.json();

  if (!data.ok) {
    $("status").textContent = "ERROR";
    $("raw").textContent = data.error || "未知错误";
    return;
  }

  $("status").textContent = `总体：${data.overall}`;
  $("result").innerHTML = "";

  for (const c of data.cases || []) {
    const box = document.createElement("div");
    box.style.border = "1px solid #ddd";
    box.style.borderRadius = "6px";
    box.style.padding = "10px";
    box.style.marginTop = "10px";

    const head = document.createElement("div");
    head.style.fontWeight = "700";
    head.textContent = `${c.name}  -  ${c.status}  (${c.runtimeMs}ms)`;
    box.appendChild(head);

    if (c.status === "ERROR") {
      const pre = document.createElement("pre");
      pre.textContent = c.error || "未知错误";
      box.appendChild(pre);
    } else if (c.actual) {
      box.appendChild(renderTable(document.createElement("div"), c.actual));
      if (c.status === "WA") {
        const pre = document.createElement("pre");
        pre.textContent =
          "缺少（expected 里有但你没输出）:\n" + JSON.stringify(c.diff?.missing || [], null, 2) + "\n\n" +
          "多余（你输出了但 expected 没有）:\n" + JSON.stringify(c.diff?.extra || [], null, 2);
        box.appendChild(pre);
      }
    }

    $("result").appendChild(box);
  }

  $("raw").textContent = JSON.stringify(data, null, 2);
});

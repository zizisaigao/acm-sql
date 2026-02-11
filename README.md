
# SQL Single-Problem Workspace (PostgreSQL)

A minimal web tool for practicing SQL interview questions without a problem bank.  
You paste the problem text + define sample tables/data (JSON), write a single SQL query, then run and check results. Supports multiple sample cases; shows `AC/WA/ERROR` and database error messages.

## Requirements

- Windows / macOS / Linux
- **Node.js** (recommended 18+)
- **PostgreSQL** running locally (default `127.0.0.1:5432`)

You should be able to connect with:

```bash
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres


## Install

1. Clone the repository:

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd sql-acm-pg
```

2. Install dependencies:

```bash
npm install
```

## Configure PostgreSQL Connection

The server reads standard PostgreSQL environment variables:

* `PGHOST` (default `127.0.0.1`)
* `PGPORT` (default `5432`)
* `PGUSER` (default `postgres`)
* `PGPASSWORD` (default empty)
* `PGDATABASE` (default `postgres`)

### Windows (CMD)

```bat
set PGHOST=127.0.0.1
set PGPORT=5432
set PGUSER=postgres
set PGPASSWORD=YOUR_PASSWORD
set PGDATABASE=postgres
```

### Windows (PowerShell)

```powershell
$env:PGHOST="127.0.0.1"
$env:PGPORT="5432"
$env:PGUSER="postgres"
$env:PGPASSWORD="YOUR_PASSWORD"
$env:PGDATABASE="postgres"
```

### macOS / Linux

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=YOUR_PASSWORD
export PGDATABASE=postgres
```

## Run

Start the server:

```bash
node server.js
```

Open in browser:

* [http://localhost:3000](http://localhost:3000)

## How to Use

### 1) Paste Problem Text

Use the left “Problem” textarea for your interview question description.
(This is only for your reference and does not affect execution.)

### 2) Provide Sample Cases JSON

Paste JSON into “Sample Tables (JSON)”.
You can provide **multiple cases**. Each case can contain one or more tables and an optional expected output for `AC/WA`.

**Format:**

```json
{
  "cases": [
    {
      "name": "case1",
      "tables": [
        {
          "name": "employees",
          "columns": [["id","INT"],["name","TEXT"],["salary","INT"]],
          "rows": [[1,"Alice",100],[2,"Bob",80]]
        }
      ],
      "expected": {
        "columns": ["name"],
        "rows": [["Alice"]],
        "order_sensitive": false
      }
    }
  ]
}
```

Notes:

* `columns` use PostgreSQL types: `INT`, `BIGINT`, `TEXT`, `VARCHAR(n)`, `DATE`, `TIMESTAMP`, `NUMERIC(p,s)`, `BOOLEAN`, etc.
* `rows` must match the `columns` order.
* `expected` is optional. If omitted, the tool will run and show results but will not judge `AC/WA`.
* If `order_sensitive` is `false`, row order does not matter (multiset comparison).

### 3) Write SQL

In the right SQL box, write **one** query only:

* Only `SELECT` or `WITH ... SELECT ...`
* A single statement (at most one trailing `;`)

### 4) Run

Click **Run / Compare**:

* Each case runs in an isolated temporary schema
* Output shows each case result and status:

  * `AC`: output matches expected
  * `WA`: output differs from expected (diff shown)
  * `ERROR`: SQL error (database error message shown)

## Troubleshooting

### `npm` not working in PowerShell (script disabled)

Use CMD, or in PowerShell set:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Cannot connect to PostgreSQL

Verify you can connect via `psql` with the same host/port/user/db, then set the environment variables accordingly.

### Port 3000 already in use

Edit `server.js` and change `app.listen(3000, ...)` to another port (e.g. 3001), then reopen the URL.

## License

MIT (or choose your preferred license).

```
::contentReference[oaicite:0]{index=0}
```

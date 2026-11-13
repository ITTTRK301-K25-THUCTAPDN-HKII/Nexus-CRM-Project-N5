# Nexus CRM

Nexus CRM uses Flask (Python) for the API and web server, with plain HTML, CSS
and JavaScript for the interface. MySQL stores application data.

## Requirements

- Python 3.11 or newer
- MySQL Server 8.0 or newer
- Windows PowerShell (commands below use Windows paths)

Node.js and npm are not required to run this version of the project. The Deal board's React and DnD Kit code is already bundled in `apps/web/static/deal-board.js`. Node.js and npm are needed only when rebuilding that bundle after editing its source.

## 1. Prepare MySQL

1. Start MySQL Server and connect to it with MySQL Workbench or another MySQL
   client.
2. Open `packages/api/sql/schema.mysql.sql` and execute the whole script. It
   creates the `nexus_crm` database and the tables used by the application.
3. If you already have a database created from an older version of the schema,
   check whether `leads.deleted_at` and the `idx_leads_active_created` index
   exist. If either is missing, run
   `packages/api/sql/migrations/003_lead_soft_delete.sql` once. Do not run that
   migration again after it has already been applied.
4. For an existing database, check that `deals.version` exists. If it does not,
   run `packages/api/sql/migrations/004_deal_version.sql` once to enable version
   conflict checks when moving Deal cards. New databases get this column from
   `schema.mysql.sql` automatically.
5. For an existing database, check that `deals.closed_amount`, `deals.closed_date`
   and `deals.lost_reason` exist. If missing, run
   `packages/api/sql/migrations/005_deal_close_fields.sql` once. New databases
   receive these fields from `schema.mysql.sql`.
6. For an existing database, run
   `packages/api/sql/migrations/006_task_telegram_notifications.sql` once to add
   Telegram Chat IDs and retry tracking. New databases already have these fields.

## 2. Configure the database connection

From the repository root, copy `.env.example` to `.env` and set the database
host, port, username, password and database name to match your local MySQL
configuration:

```powershell
Copy-Item .env.example .env
```

The default database name is `nexus_crm`. Keep `.env` on your computer; do not
commit it or share its credentials.

## Telegram task reminders

Set `TELEGRAM_BOT_TOKEN` in `.env` and set each Sale user's
`users.telegram_chat_id` in MySQL. The Sale user must start a chat with the bot.
The app scans every five minutes for open tasks due in 15–30 minutes. It tries
each alert at most three times and records successful sends in
`tasks.telegram_notified_at`.

## 3. Install Python dependencies

Run these commands from the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If `py -3` is not available, replace it with `python`:

```powershell
python -m venv .venv
```

## 4. Start the application

From the repository root, run:

```powershell
.\.venv\Scripts\python.exe packages\api\app.py
```

Keep the terminal open while using the app. Open
<http://127.0.0.1:3001> in your browser. Press `Ctrl+C` in the terminal to stop
the server.

In development mode, the server creates these demo accounts if they do not
already exist:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@nexus.local` | `Admin123!` |
| Manager | `manager@nexus.local` | `Manager123!` |
| Sale | `sale@nexus.local` | `Sale123!` |

Password reset links are written to the development mailbox table. Real email
delivery is not configured.

## Rebuild the Deal board after changing its React source

From the repository root, run these commands after editing `apps/web/src/deal-board.jsx`:

```powershell
Set-Location apps\web
npm install
npm run build
Set-Location ..\..
```

Vite writes the browser-ready bundle to `apps/web/static/deal-board.js`, which Flask serves with the rest of the static files.

## Tests

Run the Python unit tests from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s packages\api -p "test_*.py"
```

These tests use mocks for database-backed behavior and do not clear application
data.

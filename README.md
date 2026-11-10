# Nexus CRM

Nexus CRM uses Flask (Python) for the API and web server, with plain HTML, CSS
and JavaScript for the interface. MySQL stores application data.

## Requirements

- Python 3.11 or newer
- MySQL Server 8.0 or newer
- Windows PowerShell (commands below use Windows paths)

Node.js and npm are not required to run this version of the project.

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

## 2. Configure the database connection

From the repository root, copy `.env.example` to `.env` and set the database
host, port, username, password and database name to match your local MySQL
configuration:

```powershell
Copy-Item .env.example .env
```

The default database name is `nexus_crm`. Keep `.env` on your computer; do not
commit it or share its credentials.

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

## Tests

Run the Python unit tests from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s packages\api -p "test_*.py"
```

These tests use mocks for database-backed behavior and do not clear application
data.

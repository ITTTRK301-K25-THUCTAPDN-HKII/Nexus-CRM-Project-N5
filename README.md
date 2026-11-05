# Nexus CRM Auth Demo

## Requirements

- Node.js 20.19+ (or 22.12+) and npm
- MySQL Server 8.0+; MySQL Workbench is used to manage the server/database

## MySQL setup

1. Start MySQL Server and connect to it in Workbench.
2. Open `packages/api/sql/schema.mysql.sql` in Workbench and execute the whole script. It creates `nexus_crm`, the 16 CRM tables, and the auth-support tables used by reset-password and development mailbox endpoints.
3. Copy `.env.example` to `.env` in the repository root and set the MySQL account/password.
4. Run `npm install`, then `npm run dev` from the repository root.
5. Open `http://localhost:5173`; the API listens on `http://localhost:3001`.

Development seed accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@nexus.local` | `Admin123!` |
| Manager | `manager@nexus.local` | `Manager123!` |
| Sale | `sale@nexus.local` | `Sale123!` |

The database name, host, port, user and password are configured by `DB_NAME`, `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD`. The server checks connectivity and seeds these accounts on startup in development mode.

The API routes and response shapes remain the existing ones. The database adapter and all route/auth data access now use MySQL; password-reset links are written to the development mailbox table, while real email delivery still requires an email provider.

## Commands

```powershell
npm run dev
npm run build
npm test
```

Tests use a separate database named `nexus_crm_test` to avoid clearing development data. Before running tests, create that database and execute the schema script with its `CREATE DATABASE` and `USE` statements changed to `nexus_crm_test`.

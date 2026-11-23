# Nexus CRM

Nexus CRM uses Flask (Python) for the API and web server, with plain HTML, CSS
and JavaScript for the interface. MySQL stores application data.

## Requirements

- Python 3.11 or newer
- MySQL Server 8.0 or newer
- Windows PowerShell (commands below use Windows paths)

Node.js and npm are not required to run this version of the project. The Deal board's React and DnD Kit code is already bundled in `apps/web/static/deal-board.js`, and the browser loads that bundle only when the Deal page is opened. Node.js and npm are needed only when rebuilding that bundle after editing its source.

## 1. Prepare MySQL

The database entity relationship diagram is available in
[`docs/ERD.md`](docs/ERD.md).

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
7. For an existing database created before recurring appointments, check that
   `appointment_series` and `appointments.recurrence_series_id` exist. If both
   are missing, run `packages/api/sql/migrations/007_appointment_recurrence.sql`
   once. New databases already include recurring appointment support.
8. For an existing database created before quote approvals, check whether
   `quotes.approval_status` and the other approval columns exist. If they are
   missing, run `packages/api/sql/migrations/008_quote_approval.sql` once. This
   migration also creates `quote_history`.
9. For an existing database created before quote decimal totals, run
   `packages/api/sql/migrations/009_quote_decimal_totals.sql` once after migration
   008. New databases already include approval and total fields.
10. For an existing database created before quote versioning, run
    `packages/api/sql/migrations/010_quote_versioning.sql` once after migrations
    008 and 009. New databases already include quote version fields.
11. For an existing database, apply
    `packages/api/sql/migrations/011_customer_deal_task_indexes.sql` once to add
    the customer ownership/phone, active Lead filter, Deal owner/stage, and Task
    assignee/due-date indexes. New databases receive these indexes from
    `schema.mysql.sql`. Lead phone, Lead status, Deal stage, and Task reminder
    indexes already exist and are not duplicated.

## 2. Configure the database connection

From the repository root, copy `.env.example` to `.env` and set the database
host, port, username, password and database name to match your local MySQL
configuration:

```powershell
Copy-Item .env.example .env
```

The default database name is `nexus_crm`. Keep `.env` on your computer; do not
commit it or share its credentials.

## Sales analytics APIs

Authenticated users can request sales KPIs with `GET /api/analytics/kpis` or
lead/deal funnel breakdowns with `GET /api/analytics/funnel`. Both endpoints
accept optional inclusive `from` and `to` query parameters in `YYYY-MM-DD`
format to filter records by creation date and apply the caller's existing
ownership scope. KPI and funnel values are reported separately per currency;
deal win rate is won deals divided by closed (won or lost) deals, while lead
conversion rate is converted leads divided by active leads.

Managers and Admins can request per-Sale performance with
`GET /api/analytics/sales-performance?period=month&date=2026-11-20`. Supported
periods are `day`, `week` (Monday through Sunday), `month`, and `quarter`; `date`
selects the day inside the requested period and defaults to today. The response
returns deals created/opened in the period, deals won/lost by `closed_date`,
won revenue grouped by currency, and leads created/converted in the period for
each Sale. Revenue is not combined across currencies.

## Telegram task reminders

Set `TELEGRAM_BOT_TOKEN` in `.env` and set each Sale user's
`users.telegram_chat_id` in MySQL. The Sale user must start a chat with the bot.
The app scans every five minutes for open tasks due in 15–30 minutes. It tries
each alert at most three times and records successful sends in
`tasks.telegram_notified_at`.

## Customer 360° Gemini AI Copilot

Nexus CRM tích hợp Google Gemini API (`google-genai` SDK) để cung cấp trợ lý chiến lược thông minh trên màn hình chi tiết khách hàng (**Customer 360°**):
- **Đánh giá sức khỏe quan hệ khách hàng**: Tính toán điểm số (0-100) và trạng thái (Xuất sắc, Tích cực, Cần chú ý, Nguy cơ) dựa trên hồ sơ, liên hệ, cơ hội Deal và lịch sử tương tác.
- **Tóm tắt điều hành & Điểm nhấn**: Tóm lược nhanh hiện trạng và các thông tin then chốt trước khi gặp khách hàng.
- **Phân tích Rủi ro & Cơ hội phát triển**: Nhận diện nguy cơ đình trệ và tiềm năng mở rộng doanh thu (upsell/cross-sell).
- **Đề xuất hành động (Next Best Actions) với 1-click tạo Task**: Cho phép nhân viên kinh doanh chuyển trực tiếp các hành động gợi ý thành công việc (Tasks) trong CRM.
- **Soạn thảo Email cá nhân hóa**: Tạo sẵn mẫu email tiếp cận/chăm sóc khách hàng tự nhiên kèm nút sao chép nhanh 1 chạm.

### Cấu hình Gemini API:
1. Nhận khóa API miễn phí từ [Google AI Studio](https://aistudio.google.com/).
2. Thêm vào file `.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.8-flash
   ```
   *(Model mặc định là `gemini-3.8-flash`; có thể thay bằng model Gemini đang được tài khoản của bạn hỗ trợ.)*
3. Service `packages/api/gemini_service.py` có helper `generate_text(prompt)` trả chuỗi và `generate_json(prompt)` trả object/list Python đã parse từ JSON. Hai luồng Copilot và tóm tắt tương tác hiện dùng helper chuyên biệt có schema để kiểm tra kết quả.

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

## Container deployment

Docker Compose can run the app with MySQL 8.0. Copy `.env.example` to `.env`,
then set `DEPLOY_DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and a unique
`DEPLOY_JWT_SECRET` of at least 32 characters before starting the stack. The
containerized app runs in production mode as a non-root user behind Waitress;
the database is only reachable on the Compose network, and its data persists in
the `nexus_mysql_data` volume.

```powershell
docker compose up --build -d
docker compose logs -f api
```

Open <http://127.0.0.1:3001>. On the first start, MySQL loads
`schema.mysql.sql` into the new database volume. Existing databases are not
automatically migrated; apply any required SQL migrations manually before
deploying. To stop the app while preserving database data, run
`docker compose down`. To intentionally remove the database volume as well,
run `docker compose down --volumes`.

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

Or run the automated test and frontend syntax checks using PowerShell:

```powershell
.\scripts\run_tests.ps1
```

The suite includes unit tests and Flask API integration tests; database-backed
tests use mocks and do not clear application data. GitHub Actions runs the same
suite on pushes and pull requests.

# Nexus CRM

Nexus CRM là ứng dụng quản lý quan hệ khách hàng. Backend và máy chủ web dùng Flask (Python), giao diện dùng HTML, CSS và JavaScript thuần, dữ liệu được lưu trong MySQL.

## Yêu cầu

- Python 3.11 trở lên.
- MySQL Server 8.0 trở lên.
- Windows PowerShell (các lệnh trong hướng dẫn dùng đường dẫn Windows).

Không cần Node.js hoặc npm để chạy phiên bản hiện tại. Mã React và DnD Kit của bảng Deal đã được đóng gói sẵn tại `apps/web/static/deal-board.js`; trình duyệt chỉ tải tệp này khi mở trang Deal. Chỉ cần Node.js/npm khi sửa mã nguồn bảng Deal và cần đóng gói lại.

## 1. Chuẩn bị MySQL

Sơ đồ quan hệ dữ liệu có tại [`docs/ERD.md`](docs/ERD.md).

1. Khởi động MySQL Server và kết nối bằng MySQL Workbench hoặc công cụ MySQL khác.
2. Mở `packages/api/sql/schema.mysql.sql` và chạy toàn bộ nội dung. Tệp này tạo database `nexus_crm` cùng các bảng ứng dụng sử dụng.
3. Nếu database được tạo từ schema cũ, kiểm tra `leads.deleted_at` và chỉ mục `idx_leads_active_created`. Nếu thiếu một trong hai, chạy một lần `packages/api/sql/migrations/003_lead_soft_delete.sql`. Không chạy lại migration này sau khi đã áp dụng.
4. Với database có sẵn, kiểm tra cột `deals.version`. Nếu chưa có, chạy một lần `packages/api/sql/migrations/004_deal_version.sql` để phát hiện xung đột phiên bản khi di chuyển thẻ Deal. Database mới đã có cột này trong schema chính.
5. Kiểm tra các cột `deals.closed_amount`, `deals.closed_date` và `deals.lost_reason`. Nếu thiếu, chạy một lần `packages/api/sql/migrations/005_deal_close_fields.sql`. Database mới đã có các cột này.
6. Với database có sẵn, chạy một lần `packages/api/sql/migrations/006_task_telegram_notifications.sql` để bổ sung Telegram Chat ID và thông tin theo dõi gửi lại thông báo. Database mới đã có các trường này.
7. Nếu database được tạo trước khi có lịch hẹn định kỳ, kiểm tra bảng `appointment_series` và cột `appointments.recurrence_series_id`. Nếu cả hai đều chưa có, chạy một lần `packages/api/sql/migrations/007_appointment_recurrence.sql`. Database mới đã hỗ trợ lịch định kỳ.
8. Nếu database được tạo trước quy trình duyệt báo giá, kiểm tra `quotes.approval_status` và các cột duyệt liên quan. Nếu thiếu, chạy một lần `packages/api/sql/migrations/008_quote_approval.sql`. Migration này cũng tạo bảng `quote_history`.
9. Nếu database được tạo trước khi báo giá hỗ trợ số tiền dạng decimal, chạy `packages/api/sql/migrations/009_quote_decimal_totals.sql` sau migration 008. Database mới đã có các trường tổng tiền cần thiết.
10. Nếu database được tạo trước khi hỗ trợ phiên bản báo giá, chạy `packages/api/sql/migrations/010_quote_versioning.sql` sau migration 008 và 009. Database mới đã có các trường phiên bản.
11. Với database có sẵn, chạy một lần `packages/api/sql/migrations/011_customer_deal_task_indexes.sql` để thêm các chỉ mục cho quyền sở hữu/thông tin điện thoại khách hàng, bộ lọc Lead còn hoạt động, người phụ trách/giai đoạn Deal và người được giao/hạn Task. Database mới đã có các chỉ mục này trong schema chính. Các chỉ mục Lead phone/status, Deal stage và Task reminder đã tồn tại nên không bị tạo trùng.

Migration là các script cập nhật cấu trúc database cũ. Chỉ chạy migration còn thiếu và chưa áp dụng; không chạy lặp lại tùy tiện.

## 2. Cấu hình kết nối database

Tại thư mục gốc dự án, sao chép `.env.example` thành `.env`, sau đó chỉnh máy chủ, cổng, tài khoản, mật khẩu và tên database khớp với cấu hình MySQL trên máy:

```powershell
Copy-Item .env.example .env
```

Tên database mặc định là `nexus_crm`. Giữ `.env` trên máy của bạn, không commit lên Git hoặc chia sẻ thông tin đăng nhập trong tệp.

## API phân tích bán hàng

Người dùng đã đăng nhập có thể lấy KPI bằng `GET /api/analytics/kpis` và phân tích phễu Lead/Deal bằng `GET /api/analytics/funnel`. Hai API nhận tham số tùy chọn `from` và `to` theo định dạng `YYYY-MM-DD` (bao gồm cả ngày bắt đầu và kết thúc), lọc theo ngày tạo và áp dụng phạm vi dữ liệu của người gọi. KPI/phễu được tính riêng theo từng loại tiền tệ; tỷ lệ thắng Deal là số Deal WON chia cho số Deal đã đóng (WON hoặc LOST), còn tỷ lệ chuyển đổi Lead là số Lead đã chuyển đổi chia cho số Lead đang hoạt động.

Manager và Admin có thể xem hiệu quả theo từng Sale bằng API mẫu:

```text
GET /api/analytics/sales-performance?period=month&date=2026-11-20
```

Các kỳ được hỗ trợ: `day` (ngày), `week` (tuần từ thứ Hai đến Chủ nhật), `month` (tháng), `quarter` (quý). `date` chọn một ngày nằm trong kỳ và mặc định là hôm nay. Kết quả gồm Deal được tạo/mở trong kỳ, Deal WON/LOST theo `closed_date`, doanh thu WON tách theo tiền tệ và Lead được tạo/chuyển đổi trong kỳ cho từng Sale. Hệ thống không cộng gộp doanh thu khác loại tiền tệ.

## Nhắc việc Task qua Telegram

Cấu hình `TELEGRAM_BOT_TOKEN` trong `.env` và lưu Chat ID của từng Sale vào cột `users.telegram_chat_id` trong MySQL. Sale cần bắt đầu cuộc trò chuyện với bot trước. Ứng dụng quét mỗi 5 phút để tìm Task chưa hoàn thành sắp đến hạn trong 15–30 phút. Mỗi cảnh báo được thử gửi tối đa 3 lần; lần gửi thành công được ghi tại `tasks.telegram_notified_at`.

## Gemini AI Copilot trên hồ sơ khách hàng Customer 360°

Nexus CRM tích hợp Google Gemini API thông qua SDK `google-genai`, cung cấp trợ lý trên trang chi tiết khách hàng:

- Đánh giá sức khỏe quan hệ khách hàng bằng điểm 0–100 và trạng thái từ hồ sơ, liên hệ, Deal và lịch sử tương tác.
- Tóm tắt hiện trạng khách hàng và các điểm đáng chú ý trước cuộc gặp.
- Nhận diện rủi ro, cơ hội phát triển, bán thêm hoặc bán chéo.
- Đề xuất việc tiếp theo; người dùng có thể tạo Task từ đề xuất.
- Soạn email cá nhân hóa và sao chép nội dung.

### Cấu hình Gemini API

1. Tạo API key trong [Google AI Studio](https://aistudio.google.com/).
2. Điền cấu hình trong `.env`:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.8-flash
   ```

   Model mặc định là `gemini-3.8-flash`; có thể đổi sang model được tài khoản Google AI Studio hỗ trợ.
3. Service `packages/api/gemini_service.py` có `generate_text(prompt)` để nhận văn bản và `generate_json(prompt)` để nhận dữ liệu JSON đã phân tích thành object/list Python. Các luồng Copilot và tóm tắt tương tác sử dụng helper có schema để kiểm tra kết quả.

## 3. Cài các thư viện Python

Chạy tại thư mục gốc dự án:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Nếu lệnh `py -3` không khả dụng, dùng `python` để tạo môi trường ảo:

```powershell
python -m venv .venv
```

## 4. Khởi động ứng dụng

Tại thư mục gốc dự án, chạy:

```powershell
.\.venv\Scripts\python.exe packages\api\app.py
```

Giữ cửa sổ terminal mở trong khi sử dụng ứng dụng. Mở <http://127.0.0.1:3001> trong trình duyệt. Nhấn `Ctrl+C` trong terminal để dừng máy chủ.

Ở chế độ development, máy chủ tự tạo các tài khoản demo bên dưới nếu chúng chưa tồn tại:

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Admin | `admin@nexus.local` | `Admin123!` |
| Manager | `manager@nexus.local` | `Manager123!` |
| Sale | `sale@nexus.local` | `Sale123!` |

Liên kết đặt lại mật khẩu được ghi vào bảng hộp thư development. Dự án chưa cấu hình gửi email thật.

## Chạy bằng Docker Compose

Docker Compose có thể chạy ứng dụng cùng MySQL 8.0. Sao chép `.env.example` thành `.env`, rồi đặt `DEPLOY_DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` và một giá trị riêng cho `DEPLOY_JWT_SECRET` dài tối thiểu 32 ký tự trước khi khởi động. Ứng dụng trong container chạy chế độ production dưới tài khoản không phải root, sử dụng Waitress; database chỉ truy cập được trong mạng Compose và dữ liệu được lưu trong volume `nexus_mysql_data`.

```powershell
docker compose up --build -d
docker compose logs -f api
```

Mở <http://127.0.0.1:3001>. Ở lần chạy đầu, MySQL nạp `schema.mysql.sql` vào volume database mới. Database có sẵn không được migration tự động; hãy áp dụng thủ công các migration cần thiết trước khi triển khai. Dừng ứng dụng nhưng giữ dữ liệu bằng `docker compose down`. Chỉ dùng `docker compose down --volumes` khi chủ động muốn xóa cả volume database.

## Đóng gói lại bảng Deal sau khi sửa mã React

Tại thư mục gốc, chạy các lệnh sau sau khi chỉnh `apps/web/src/deal-board.jsx`:

```powershell
Set-Location apps\web
npm install
npm run build
Set-Location ..\..
```

Vite tạo bundle trình duyệt tại `apps/web/static/deal-board.js`; Flask phục vụ tệp này cùng các tài nguyên web còn lại.

## Kiểm thử

Chạy các kiểm thử Python tại thư mục gốc:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s packages\api -p "test_*.py"
```

Hoặc chạy kiểm thử tự động và kiểm tra cú pháp frontend bằng PowerShell:

```powershell
.\scripts\run_tests.ps1
```

Bộ kiểm thử gồm unit test và kiểm thử tích hợp Flask API. Các kiểm thử cần database sử dụng mock, không xóa dữ liệu ứng dụng. GitHub Actions chạy cùng bộ kiểm thử khi có push hoặc pull request.

# Nexus CRM

Nexus CRM sử dụng Flask (Python) cho API và máy chủ web; giao diện được xây dựng
bằng HTML, CSS và JavaScript thuần. Dữ liệu ứng dụng được lưu trong MySQL.

## Yêu cầu

- Python 3.11 trở lên
- MySQL Server 8.0 trở lên
- Windows PowerShell (các lệnh bên dưới sử dụng đường dẫn Windows)

Phiên bản dự án này không cần Node.js hoặc npm để chạy.

## 1. Chuẩn bị MySQL

1. Khởi động MySQL Server và kết nối bằng MySQL Workbench hoặc một công cụ
   MySQL khác.
2. Mở `packages/api/sql/schema.mysql.sql` và chạy toàn bộ tập lệnh. Tập lệnh
   tạo cơ sở dữ liệu `nexus_crm` và các bảng ứng dụng sử dụng.
3. Nếu bạn đã có cơ sở dữ liệu từ phiên bản schema cũ, hãy kiểm tra cột
   `leads.deleted_at` và chỉ mục `idx_leads_active_created`. Nếu thiếu một trong
   hai, chạy một lần migration
   `packages/api/sql/migrations/003_lead_soft_delete.sql`. Không chạy lại
   migration sau khi đã áp dụng.

## 2. Cấu hình kết nối cơ sở dữ liệu

Tại thư mục gốc của repository, sao chép `.env.example` thành `.env` và thiết
lập máy chủ, cổng, tên người dùng, mật khẩu và tên cơ sở dữ liệu cho phù hợp với
cấu hình MySQL trên máy của bạn:

```powershell
Copy-Item .env.example .env
```

Tên cơ sở dữ liệu mặc định là `nexus_crm`. Giữ file `.env` trên máy của bạn;
không commit file này hoặc chia sẻ thông tin đăng nhập trong đó.

## 3. Cài đặt thư viện Python

Chạy các lệnh sau tại thư mục gốc của repository:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Nếu máy không có lệnh `py -3`, hãy thay bằng `python`:

```powershell
python -m venv .venv
```

## 4. Khởi chạy ứng dụng

Tại thư mục gốc của repository, chạy:

```powershell
.\.venv\Scripts\python.exe packages\api\app.py
```

Giữ cửa sổ terminal mở trong khi sử dụng ứng dụng. Truy cập
<http://127.0.0.1:3001> bằng trình duyệt. Nhấn `Ctrl+C` trong terminal để dừng
máy chủ.

Ở chế độ development, khi khởi động máy chủ sẽ tạo các tài khoản demo sau nếu
chúng chưa tồn tại:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@nexus.local` | `Admin123!` |
| Manager | `manager@nexus.local` | `Manager123!` |
| Sale | `sale@nexus.local` | `Sale123!` |

Liên kết đặt lại mật khẩu được lưu vào bảng hộp thư development. Chức năng gửi
email thật chưa được cấu hình.

## Kiểm thử

Chạy unit test Python tại thư mục gốc của repository:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s packages\api -p "test_*.py"
```

Các bài kiểm thử sử dụng mock cho những phần cần cơ sở dữ liệu và không xóa dữ
liệu ứng dụng.

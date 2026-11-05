# Nexus CRM Auth Demo

Demo local cho các task auth trong Sprint 1: API reset mật khẩu, Auth/RBAC middleware, rate limit đăng nhập, giao diện Login/Reset Password, trang Admin quản lý user và Refresh Token.

## Yêu cầu

- Node.js 20.19+ hoặc 22.12+ (đã kiểm tra với Node 24).
- npm.

## Chạy thử

```powershell
npm install
npm run dev
```

Mở `http://localhost:5173`. API chạy ở `http://localhost:3001`; Vite proxy `/api` sang API.

Tài khoản seed cho demo:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@nexus.local` | `Admin123!` |
| Manager | `manager@nexus.local` | `Manager123!` |
| Sale | `sale@nexus.local` | `Sale123!` |

Database SQLite được tạo tại `packages/api/data/nexus.sqlite`. Email khôi phục được ghi vào hộp thư phát triển trên trang **Quên mật khẩu?**; gửi email thật chưa được bật. Hộp thư chỉ khả dụng khi `NODE_ENV=development`.

## Các luồng kiểm thử

- Đăng nhập bằng từng vai trò; request sai thông tin lần thứ 6 trong 15 phút cho cùng IP/email nhận HTTP 429.
- Dùng Sale/Manager gọi `/api/admin/users` sẽ nhận HTTP 403; chưa đăng nhập hoặc phiên hết hạn nhận HTTP 401.
- Admin tạo user, đổi role, khóa/mở khóa và xóa user. Admin không thể tự khóa, tự hạ quyền hoặc tự xóa tài khoản đang đăng nhập.
- Đăng nhập và gọi `POST /api/auth/refresh`; refresh cookie cũ bị xoay vòng/thu hồi. Logout thu hồi refresh cookie hiện tại.
- Gửi yêu cầu quên mật khẩu, mở reset link trong hộp thư demo, đổi mật khẩu; token chỉ dùng một lần, hết hạn sau 15 phút và refresh session cũ bị thu hồi.

API sử dụng access JWT 15 phút và refresh token ngẫu nhiên 7 ngày; chỉ hash refresh/reset token được lưu trong SQLite. Cả hai token phía trình duyệt nằm trong cookie HttpOnly, SameSite=Lax; cookie Secure bật trong production.

## Kiểm tra

```powershell
npm test
npm run build
```

## Ghi chú triển khai

Demo dùng seed credential (chỉ tạo khi development), rate-limit memory store và dev mailbox nên không dùng nguyên trạng cho production. Endpoint yêu cầu đặt lại mật khẩu trả HTTP 503 khi `NODE_ENV=production` cho tới khi tích hợp SMTP. Trước khi triển khai thật, cấu hình `JWT_SECRET` riêng dài tối thiểu 32 ký tự (server từ chối secret mặc định), đặt `NODE_ENV=production`, tạo quy trình bootstrap Admin an toàn, tích hợp SMTP, dùng rate-limit store dùng chung giữa các instance và cấu hình HTTPS/domain cookie phù hợp.

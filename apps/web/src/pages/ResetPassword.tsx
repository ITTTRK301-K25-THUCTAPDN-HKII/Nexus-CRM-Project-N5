import { useState, type FormEvent } from 'react';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../api';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Mật khẩu xác nhận chưa khớp.');
      return;
    }
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      window.setTimeout(() => navigate('/login'), 1600);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <main className="simple-page">
      <section className="simple-card">
        <Link className="back-link" to="/login"><ArrowLeft size={16} /> Quay lại đăng nhập</Link>
        <div className="icon-tile"><LockKeyhole size={22} /></div>
        <span className="eyebrow">BẢO MẬT TÀI KHOẢN</span>
        <h1>Tạo mật khẩu mới</h1>
        <p className="muted">Mật khẩu cần có ít nhất 8 ký tự. Liên kết chỉ sử dụng được một lần.</p>
        {!token && <div className="alert error">Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</div>}
        {done ? <div className="alert success" role="status">Mật khẩu đã được cập nhật. Đang chuyển về trang đăng nhập...</div> : (
          <form className="form-stack" onSubmit={submit}>
            <label htmlFor="password">Mật khẩu mới</label>
            <div className="input-wrap"><LockKeyhole size={18} /><input id="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!token} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <label htmlFor="confirmation">Xác nhận mật khẩu</label>
            <div className="input-wrap"><LockKeyhole size={18} /><input id="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={!token} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="primary-button" type="submit" disabled={!token}>Cập nhật mật khẩu</button>
          </form>
        )}
      </section>
    </main>
  );
}

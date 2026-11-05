import { useState, type FormEvent } from 'react';
import { ArrowLeft, Mail, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../api';

interface MailItem {
  id: number;
  recipient: string;
  subject: string;
  resetUrl: string;
  createdAt: string;
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mailItems, setMailItems] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadMailbox() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<{ messages: MailItem[] }>('/dev/mailbox');
      setMailItems(data.messages);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email: email.trim() });
      setMessage(data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <main className="simple-page">
      <section className="simple-card">
        <Link className="back-link" to="/login"><ArrowLeft size={16} /> Quay lại đăng nhập</Link>
        <div className="icon-tile"><Mail size={22} /></div>
        <span className="eyebrow">KHÔI PHỤC TÀI KHOẢN</span>
        <h1>Quên mật khẩu?</h1>
        <p className="muted">Nhập email đã đăng ký. Nếu tài khoản tồn tại, hướng dẫn đặt lại sẽ được gửi đến hộp thư.</p>
        <form className="form-stack" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {message && <div className="alert success" role="status">{message}</div>}
          {error && <div className="alert error" role="alert">{error}</div>}
          <button className="primary-button" type="submit">Gửi liên kết đặt lại</button>
        </form>
        <div className="mailbox-panel">
          <div className="mailbox-heading"><strong>Hộp thư demo</strong><button className="icon-button" type="button" onClick={loadMailbox} aria-label="Tải hộp thư"><RotateCw size={16} /></button></div>
          <p className="muted small">Chỉ dùng khi chạy môi trường development.</p>
          {mailItems.length > 0 && <div className="mail-list">{mailItems.map((item) => (
            <article className="mail-item" key={item.id}>
              <span>{item.recipient} · {item.subject}</span>
              <a href={item.resetUrl}>Mở liên kết đặt lại mật khẩu</a>
            </article>
          ))}</div>}
          {loading && <p className="muted small">Đang tải...</p>}
        </div>
      </section>
    </main>
  );
}

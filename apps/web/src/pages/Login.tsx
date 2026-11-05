import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api';
import { useAuth } from '../auth';

export function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={user.role === 'Admin' ? '/admin/users' : '/workspace'} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      navigate(signedIn.role === 'Admin' ? '/admin/users' : '/workspace');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <div className="brand"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">CRM</span></span></div>
        <div className="aside-copy">
          <span className="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</span>
          <h1>Mọi mối quan hệ tốt đều bắt đầu từ một cuộc trò chuyện.</h1>
          <p>Quản lý khách hàng, kết nối đội ngũ và phát triển doanh nghiệp trên cùng một nền tảng.</p>
        </div>
        <div className="aside-footer"><ShieldCheck size={17} /> Bảo mật tài khoản bằng xác thực nhiều lớp</div>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <div className="mobile-brand brand"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">CRM</span></span></div>
          <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
          <h2>Đăng nhập</h2>
          <p className="muted">Nhập thông tin tài khoản để tiếp tục.</p>
          <form onSubmit={submit} className="form-stack">
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="username" required maxLength={254} placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div className="label-row"><label htmlFor="password">Mật khẩu</label><Link to="/forgot-password">Quên mật khẩu?</Link></div>
            <div className="input-wrap"><LockKeyhole size={18} /><input id="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} placeholder="Nhập mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? 'Đang đăng nhập...' : <>Đăng nhập <ArrowRight size={17} /></>}
            </button>
          </form>
          <div className="demo-box"><strong>Tài khoản demo</strong><span>admin@nexus.local</span><span>Mật khẩu: Admin123!</span></div>
          <p className="legal">Phiên đăng nhập được bảo vệ bằng cookie HttpOnly.</p>
        </div>
      </section>
    </main>
  );
}

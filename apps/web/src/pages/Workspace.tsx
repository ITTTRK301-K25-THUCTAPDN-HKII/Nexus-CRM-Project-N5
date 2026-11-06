import { LogOut, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  async function signOut() {
    await logout();
    navigate('/login');
  }
  return (
    <main className="simple-page">
      <section className="simple-card workspace-card">
        <div className="brand"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">CRM</span></span></div>
        <div className="icon-tile"><ShieldCheck size={22} /></div>
        <span className="eyebrow">ĐĂNG NHẬP THÀNH CÔNG</span>
        <h1>Xin chào, {user?.name}</h1>
        <p className="muted">Vai trò: <strong>{user?.role}</strong>. Trang quản lý người dùng chỉ dành cho Admin.</p>
        <Link className="primary-button full-width" to="/customers">Mở module khách hàng</Link>
        <button className="secondary-button full-width" onClick={signOut}><LogOut size={17} /> Đăng xuất</button>
      </section>
    </main>
  );
}

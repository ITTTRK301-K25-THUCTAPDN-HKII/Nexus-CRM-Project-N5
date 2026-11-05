import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LogOut, Plus, Search, Shield, UserRound, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../api';
import { useAuth, type User } from '../auth';

export function AdminUsers() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('Sale');

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get<{ users: User[] }>('/admin/users');
      setUsers(data.users);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/admin/users', { name, email: email.trim(), password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('Sale');
      setFormOpen(false);
      setNotice('Đã tạo tài khoản nhân viên.');
      await loadUsers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function updateUser(target: User, changes: Partial<Pick<User, 'role' | 'status'>>) {
    setError('');
    setNotice('');
    try {
      await api.patch(`/admin/users/${target.id}`, changes);
      setNotice(`Đã cập nhật ${target.email}.`);
      await loadUsers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function deleteUser(target: User) {
    if (!window.confirm(`Xóa tài khoản ${target.email}?`)) return;
    setError('');
    try {
      await api.delete(`/admin/users/${target.id}`);
      setNotice(`Đã xóa ${target.email}.`);
      await loadUsers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function signOut() {
    await logout();
    navigate('/login');
  }

  const visibleUsers = users.filter((item) =>
    `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">CRM</span></span></div>
        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="/admin/users"><Users size={18} /> Quản lý người dùng</a>
        <div className="sidebar-bottom">
          <div className="profile-chip"><div className="avatar">{user?.name.slice(0, 1).toUpperCase()}</div><div><strong>{user?.name}</strong><span>{user?.role}</span></div></div>
          <button className="logout-button" onClick={signOut}><LogOut size={17} /> Đăng xuất</button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="topbar"><div><span className="eyebrow">QUẢN TRỊ HỆ THỐNG</span><h1>Người dùng</h1></div><div className="admin-avatar"><Shield size={18} /> Admin</div></header>
        <section className="page-intro"><div><h2>Đội ngũ của bạn</h2><p className="muted">Tạo tài khoản, phân quyền và quản lý trạng thái truy cập.</p></div><button className="primary-button compact" onClick={() => setFormOpen((open) => !open)}><Plus size={17} /> Tạo người dùng</button></section>

        {error && <div className="alert error" role="alert">{error}</div>}
        {notice && <div className="alert success" role="status">{notice}</div>}
        {formOpen && <form className="create-user-form" onSubmit={createUser}>
          <div className="form-heading"><div><strong>Tài khoản nhân viên mới</strong><span className="muted small">Mật khẩu ban đầu tối thiểu 8 ký tự.</span></div></div>
          <label>Họ và tên<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Email<input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Mật khẩu tạm thời<input type="password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label>Vai trò<select value={role} onChange={(event) => setRole(event.target.value as User['role'])}><option>Sale</option><option>Manager</option><option>Admin</option></select></label>
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Hủy</button><button type="submit" className="primary-button compact">Tạo tài khoản</button></div>
        </form>}

        <section className="table-card">
          <div className="table-toolbar"><div className="table-title"><div className="icon-tile small-tile"><UserRound size={18} /></div><div><strong>Danh sách người dùng</strong><span>{users.length} tài khoản</span></div></div><div className="search-wrap"><Search size={16} /><input aria-label="Tìm kiếm người dùng" placeholder="Tìm tên, email, vai trò..." value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
          <div className="table-scroll"><table><thead><tr><th>NGƯỜI DÙNG</th><th>VAI TRÒ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>
            {visibleUsers.map((item) => <tr key={item.id}>
              <td><div className="user-cell"><div className="avatar">{item.name.slice(0, 1).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.email}</span></div></div></td>
              <td><select className="role-select" value={item.role} disabled={item.id === user?.id} onChange={(event) => void updateUser(item, { role: event.target.value as User['role'] })}><option>Admin</option><option>Manager</option><option>Sale</option></select></td>
              <td><span className={`status-pill ${item.status === 'ACTIVE' ? 'status-active' : 'status-locked'}`}>{item.status === 'ACTIVE' ? 'Đang hoạt động' : item.status === 'LOCKED' ? 'Đã khóa' : 'Ngừng hoạt động'}</span></td>
              <td><div className="row-actions"><button className="text-button" disabled={item.id === user?.id} onClick={() => void updateUser(item, { status: item.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE' })}>{item.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</button><button className="text-button danger-text" disabled={item.id === user?.id} onClick={() => void deleteUser(item)}>Xóa</button></div></td>
            </tr>)}
            {visibleUsers.length === 0 && <tr><td className="empty-row" colSpan={4}>Không tìm thấy người dùng phù hợp.</td></tr>}
          </tbody></table></div>
        </section>
        <p className="page-footnote">Quyền truy cập được kiểm tra lại ở API trên mỗi yêu cầu.</p>
      </main>
    </div>
  );
}

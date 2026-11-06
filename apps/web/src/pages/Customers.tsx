import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleAlert, ContactRound, LayoutDashboard, LogOut, Plus, Search, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getErrorMessage } from '../api';
import { useAuth } from '../auth';

type CustomerView = 'leads' | 'accounts' | 'contacts';

interface CustomerItem {
  id: number;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string;
  notes?: string | null;
  industry?: string | null;
  firstName?: string;
  lastName?: string;
  accountId?: number;
  accountName?: string;
  jobTitle?: string | null;
}

interface LeadForm {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED';
  notes: string;
}

const emptyLead: LeadForm = {
  name: '',
  company: '',
  email: '',
  phone: '',
  source: '',
  status: 'NEW',
  notes: '',
};

const views: Array<{ id: CustomerView; title: string; icon: typeof Users }> = [
  { id: 'leads', title: 'Leads', icon: Users },
  { id: 'accounts', title: 'Accounts', icon: Building2 },
  { id: 'contacts', title: 'Contacts', icon: ContactRound },
];

export function CustomerSidebar({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/customers"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">CRM</span></span></Link>
        <div className="nav-label">WORKSPACE</div>
        <Link className="nav-item active" to="/customers"><Users size={18} /> Khách hàng</Link>
        <Link className="nav-item" to="/workspace"><LayoutDashboard size={18} /> Tổng quan</Link>
        <div className="sidebar-bottom">
          <div className="profile-chip"><div className="avatar">{user?.name.slice(0, 1).toUpperCase()}</div><div><strong>{user?.name}</strong><span>{user?.role}</span></div></div>
          <button className="logout-button" onClick={signOut}><LogOut size={17} /> Đăng xuất</button>
        </div>
      </aside>
      {children}
    </div>
  );
}

export function Customers() {
  const [view, setView] = useState<CustomerView>('leads');
  const [items, setItems] = useState<CustomerItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<CustomerItem | null>(null);
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLead);
  const [convertingLead, setConvertingLead] = useState<CustomerItem | null>(null);
  const [accountName, setAccountName] = useState('');
  const pageSize = 10;
  const navigate = useNavigate();
  const requestId = useRef(0);

  const loadItems = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<{ items: CustomerItem[]; total: number }>(`/customers/${view}`, {
        params: { page, pageSize, search, ...(view === 'leads' && status ? { status } : {}) },
      });
      if (currentRequestId === requestId.current) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) setError(getErrorMessage(requestError));
    } finally {
      if (currentRequestId === requestId.current) setLoading(false);
    }
  }, [page, pageSize, search, status, view]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  function changeView(nextView: CustomerView) {
    setView(nextView);
    setPage(1);
    setStatus('');
    setError('');
  }

  function openCreateLead() {
    setEditingLead(null);
    setLeadForm(emptyLead);
    setError('');
    setFormOpen(true);
  }

  function openEditLead(item: CustomerItem) {
    setEditingLead(item);
    setLeadForm({
      name: item.name ?? '',
      company: item.company ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      source: item.source ?? '',
      status: (item.status as LeadForm['status']) ?? 'NEW',
      notes: item.notes ?? '',
    });
    setError('');
    setFormOpen(true);
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!leadForm.email.trim() && !leadForm.phone.trim()) {
      setError('Vui lòng nhập email hoặc số điện thoại để tạo Lead.');
      return;
    }
    try {
      if (editingLead) {
        await api.patch(`/customers/leads/${editingLead.id}`, leadForm);
      } else {
        await api.post('/customers/leads', leadForm);
      }
      setFormOpen(false);
      setLeadForm(emptyLead);
      await loadItems();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function convertLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!convertingLead) return;
    setError('');
    try {
      const { data } = await api.post<{ accountId: number }>(`/leads/${convertingLead.id}/convert`, {
        accountName: accountName.trim() || undefined,
      });
      setConvertingLead(null);
      navigate(`/customers/accounts/${data.accountId}`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CustomerSidebar>
      <main className="admin-content customer-content">
        <header className="topbar"><div><span className="eyebrow">CUSTOMER RELATIONSHIP</span><h1>Khách hàng</h1></div><div className="admin-avatar">{items.length} bản ghi</div></header>
        <section className="page-intro"><div><h2>Danh sách khách hàng</h2><p className="muted">Theo dõi lead, doanh nghiệp và người liên hệ trong một nơi.</p></div>{view === 'leads' && <button className="primary-button compact" onClick={openCreateLead}><Plus size={17} /> Thêm Lead</button>}</section>

        {error && <div className="alert error customer-alert" role="alert"><CircleAlert size={16} /> {error}</div>}

        <nav className="customer-tabs" aria-label="Loại khách hàng">
          {views.map(({ id, title, icon: Icon }) => <button key={id} className={`customer-tab ${view === id ? 'selected' : ''}`} onClick={() => changeView(id)}><Icon size={16} />{title}</button>)}
        </nav>

        <section className="table-card customer-table-card">
          <div className="table-toolbar">
            <div className="table-title"><div className="icon-tile small-tile"><Users size={18} /></div><div><strong>{views.find((item) => item.id === view)?.title}</strong><span>{total} kết quả</span></div></div>
            <div className="customer-filters">
              {view === 'leads' && <select aria-label="Lọc theo trạng thái" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả trạng thái</option><option value="NEW">Mới</option><option value="CONTACTED">Đã liên hệ</option><option value="QUALIFIED">Tiềm năng</option><option value="UNQUALIFIED">Không phù hợp</option><option value="CONVERTED">Đã chuyển đổi</option></select>}
              <label className="search-wrap"><Search size={16} /><input aria-label="Tìm khách hàng" placeholder="Tìm tên, email, công ty..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
            </div>
          </div>
          <div className="table-scroll"><table><thead><tr>
            {view === 'leads' ? <><th>KHÁCH HÀNG TIỀM NĂNG</th><th>CÔNG TY</th><th>LIÊN HỆ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></> :
              view === 'accounts' ? <><th>DOANH NGHIỆP</th><th>NGÀNH</th><th>LIÊN HỆ</th><th>THAO TÁC</th></> :
                <><th>NGƯỜI LIÊN HỆ</th><th>DOANH NGHIỆP</th><th>THÔNG TIN</th><th>CHỨC VỤ</th></>}
          </tr></thead><tbody>
            {items.map((item) => view === 'leads' ? (
              <tr key={item.id}>
                <td><div className="user-cell"><div className="avatar">{item.name?.slice(0, 1).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.source || 'Chưa rõ nguồn'}</span></div></div></td>
                <td>{item.company || '—'}</td><td><div className="contact-info"><span>{item.email || '—'}</span><span>{item.phone || '—'}</span></div></td>
                <td><span className={`status-pill status-${(item.status ?? 'NEW').toLowerCase()}`}>{item.status}</span></td>
                <td><div className="row-actions">{item.status === 'CONVERTED' ? <Link className="text-button" to={`/customers/accounts/${item.accountId}`}>Xem Account</Link> : <><button className="text-button" onClick={() => openEditLead(item)}>Sửa</button>{item.status === 'QUALIFIED' && <button className="text-button" onClick={() => { setConvertingLead(item); setAccountName(item.company || item.name || ''); setError(''); }}>Chuyển đổi</button>}</>}</div></td>
              </tr>
            ) : view === 'accounts' ? (
              <tr key={item.id}>
                <td><Link className="customer-primary-link" to={`/customers/accounts/${item.id}`}>{item.name}</Link></td>
                <td>{item.industry || '—'}</td><td><div className="contact-info"><span>{item.email || '—'}</span><span>{item.phone || '—'}</span></div></td>
                <td><Link className="text-button" to={`/customers/accounts/${item.id}`}>Xem chi tiết</Link></td>
              </tr>
            ) : (
              <tr key={item.id}>
                <td><strong>{item.firstName} {item.lastName}</strong></td>
                <td><Link className="customer-primary-link" to={`/customers/accounts/${item.accountId}`}>{item.accountName}</Link></td>
                <td><div className="contact-info"><span>{item.email || '—'}</span><span>{item.phone || '—'}</span></div></td><td>{item.jobTitle || '—'}</td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td className="empty-row" colSpan={5}>Không tìm thấy dữ liệu phù hợp.</td></tr>}
            {loading && <tr><td className="empty-row" colSpan={5}>Đang tải dữ liệu...</td></tr>}
          </tbody></table></div>
          <div className="customer-pagination"><span>Hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} trên {total}</span><div><button className="secondary-button pagination-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button><span>Trang {page} / {pageCount}</span><button className="secondary-button pagination-button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button></div></div>
        </section>
      </main>

      {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false); }}>
        <section className="customer-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
          <div className="modal-heading"><div><span className="eyebrow">LEAD MANAGEMENT</span><h2 id="lead-modal-title">{editingLead ? 'Chỉnh sửa Lead' : 'Thêm Lead mới'}</h2></div><button className="modal-close" onClick={() => setFormOpen(false)} aria-label="Đóng">×</button></div>
          <form className="customer-form" onSubmit={saveLead}>
            <label>Họ tên *<input required minLength={2} maxLength={160} value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} /></label>
            <label>Công ty<input maxLength={160} value={leadForm.company} onChange={(event) => setLeadForm({ ...leadForm, company: event.target.value })} /></label>
            <label>Email { !leadForm.phone.trim() && '*' }<input type="email" required={!leadForm.phone.trim()} maxLength={254} value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} /></label>
            <label>Số điện thoại { !leadForm.email.trim() && '*' }<input required={!leadForm.email.trim()} maxLength={40} value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} /></label>
            <label>Nguồn Lead<input maxLength={80} placeholder="Website, giới thiệu..." value={leadForm.source} onChange={(event) => setLeadForm({ ...leadForm, source: event.target.value })} /></label>
            <label>Trạng thái<select value={leadForm.status} onChange={(event) => setLeadForm({ ...leadForm, status: event.target.value as LeadForm['status'] })}><option value="NEW">Mới</option><option value="CONTACTED">Đã liên hệ</option><option value="QUALIFIED">Tiềm năng</option><option value="UNQUALIFIED">Không phù hợp</option></select></label>
            <label className="wide-field">Ghi chú<textarea rows={3} maxLength={5000} value={leadForm.notes} onChange={(event) => setLeadForm({ ...leadForm, notes: event.target.value })} /></label>
            {error.includes('trùng') && <div className="duplicate-warning wide-field"><CircleAlert size={17} /><span>{error}</span></div>}
            {error && !error.includes('trùng') && <div className="alert error wide-field">{error}</div>}
            <div className="form-actions wide-field"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Hủy</button><button type="submit" className="primary-button compact">{editingLead ? 'Lưu thay đổi' : 'Tạo Lead'}</button></div>
          </form>
        </section>
      </div>}

      {convertingLead && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConvertingLead(null); }}>
        <section className="customer-modal narrow-modal" role="dialog" aria-modal="true" aria-labelledby="convert-modal-title">
          <div className="modal-heading"><div><span className="eyebrow">LEAD CONVERSION</span><h2 id="convert-modal-title">Chuyển đổi Lead</h2></div><button className="modal-close" onClick={() => setConvertingLead(null)} aria-label="Đóng">×</button></div>
          <p className="muted">Chuyển <strong>{convertingLead.name}</strong> thành Account và tạo Contact liên quan.</p>
          <form className="customer-form single-column" onSubmit={convertLead}>
            <label>Tên Account<input required minLength={2} maxLength={160} value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label>
            {error && <div className="alert error wide-field">{error}</div>}
            <div className="form-actions wide-field"><button type="button" className="secondary-button" onClick={() => setConvertingLead(null)}>Hủy</button><button type="submit" className="primary-button compact">Chuyển đổi</button></div>
          </form>
        </section>
      </div>}
    </CustomerSidebar>
  );
}

const root = document.getElementById('app');
const state = {
  user: null,
  loading: true,
  error: '',
  notice: '',
  users: [],
  deals: [],
  dealsLoaded: false,
  dealFormOpen: false,
  dealAccounts: [],
  dealAssignees: [],
  dealOptionsLoaded: false,
  customerDeleteConfirm: null,
  tasks: [],
  tasksLoaded: false,
  taskStatusFilter: '',
  taskPriorityFilter: '',
  taskAssignees: [],
  taskAssigneesLoaded: false,
  taskFormOpen: false,
  taskEdit: null,
  appointments: [],
  appointmentsLoaded: false,
  calendarCursor: new Date(),
  calendarMode: 'month',
  appointmentFormOpen: false,
  appointmentFormDate: '',
  usersLoaded: false,
  adminRoleFilter: '',
  adminStatusFilter: '',
  customerItems: [],
  customerView: 'leads',
  customerSearch: '',
  customerStatus: '',
  customerPage: 1,
  customerTotal: 0,
  customerLoading: false,
  leadEdit: null,
  leadFormOpen: false,
  converting: null,
  accountName: '',
  detail: null,
  geminiSummary: null,
  geminiTaskNotice: '',
  emailCopied: false,
  mailbox: [],
  loginBusy: false,
  deletingUser: null,
};
let customerRequest = '';
let customerLoadedKey = '';
let customerDebounce;
let refreshRequest;
let unmountDealBoard = null;
let dealBoardLoadPromise = null;
let taskRequest = '';
let appointmentRequest = '';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const initials = (value) => escapeHtml((value || '?').slice(0, 1).toUpperCase());
const route = () => window.location.pathname;
const api = async (path, options = {}, retried = false) => {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (response.status === 401 && !retried && ![
    '/auth/login', '/auth/refresh', '/auth/logout',
    '/auth/forgot-password', '/auth/reset-password',
  ].includes(path)) {
    try {
      refreshRequest ||= fetch('/api/auth/refresh', {
        method: 'POST', credentials: 'same-origin',
      }).finally(() => { refreshRequest = null; });
      const refreshed = await refreshRequest;
      if (refreshed.ok) return api(path, options, true);
    } catch (error) {
      console.error('Session refresh failed', error);
    }
    state.user = null;
    if (route() !== '/login') navigate('/login', true);
  }
  if (response.status === 204) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Máy chủ trả về dữ liệu không hợp lệ.');
  }
  if (!response.ok) throw new Error(data.message || 'Không thể kết nối máy chủ. Vui lòng thử lại.');
  return data;
};
function loadDealBoardBundle() {
  if (typeof window.mountDealBoard === 'function') return Promise.resolve();
  if (!dealBoardLoadPromise) {
    dealBoardLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      // Version the lazy bundle URL so browsers do not reuse an older cached build
      // that may not expose window.mountDealBoard.
      script.src = '/static/deal-board.js?v=deal-cards-dnd-20261116';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        dealBoardLoadPromise = null;
        reject(new Error('Không thể tải bảng Deal. Vui lòng tải lại trang.'));
      };
      document.head.appendChild(script);
    });
  }
  return dealBoardLoadPromise;
}
function navigate(path, replace = false) {
  // Dọn React board trước khi thay nội dung trang để không giữ listener kéo thả cũ.
  if (unmountDealBoard) {
    unmountDealBoard();
    unmountDealBoard = null;
  }
  if (replace) history.replaceState({}, '', path);
  else history.pushState({}, '', path);
  state.error = '';
  state.notice = '';
  state.detail = null;
  state.geminiSummary = null;
  state.geminiTaskNotice = '';
  state.emailCopied = false;
  render();
}
const brand = '<div class="brand"><span class="brand-mark">N</span><div class="brand-info"><span>NEXUS<span class="brand-light">CRM</span></span><span class="brand-sub">Enterprise</span></div></div>';
function appSidebar(active = 'customers') {
  return `<aside class="sidebar">
    <div class="sidebar-top">
      <a class="brand" href="/customers">
        <span class="brand-mark">N</span>
        <div class="brand-info">
          <span>NEXUS<span class="brand-light">CRM</span></span>
          <span class="brand-sub">Enterprise Hub</span>
        </div>
      </a>
      <div class="nav-label">WORKSPACE</div>
      <nav class="nav-list">
        ${state.user?.role === 'Admin' ? `<a class="nav-item ${active === 'admin' ? 'active' : ''}" href="/admin/users">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Quản lý người dùng</span>
        </a>` : ''}
        <a class="nav-item ${active === 'customers' ? 'active' : ''}" href="/customers">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>
          <span>Khách hàng</span>
        </a>
        <a class="nav-item ${active === 'deals' ? 'active' : ''}" href="/deals">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18"/><path d="M18 3v18"/><rect width="6" height="7" x="3" y="5" rx="1"/><rect width="6" height="5" x="15" y="5" rx="1"/></svg>
          <span>Cơ hội Deal</span>
        </a>
        <a class="nav-item ${active === 'tasks' ? 'active' : ''}" href="/tasks">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          <span>Công việc</span>
        </a>
        <a class="nav-item ${active === 'calendar' ? 'active' : ''}" href="/calendar">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
          <span>Lịch làm việc</span>
        </a>
        <a class="nav-item ${active === 'workspace' ? 'active' : ''}" href="/workspace">
          <span class="nav-indicator"></span>
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          <span>Tổng quan</span>
        </a>
      </nav>
    </div>
    <div class="sidebar-bottom">
      <div class="profile-chip">
        <div class="profile-avatar-wrap">
          <div class="avatar">${initials(state.user?.name)}</div>
          <span class="avatar-status-dot"></span>
        </div>
        <div class="profile-info">
          <strong>${escapeHtml(state.user?.name)}</strong>
          <span>${escapeHtml(state.user?.role)}</span>
        </div>
      </div>
      <button class="logout-button" data-action="logout" title="Đăng xuất khỏi hệ thống">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
        <span>Đăng xuất</span>
      </button>
    </div>
  </aside>`;
}
function alertBox(text, type = 'error') {
  return text ? `<div class="alert ${type}" role="${type === 'error' ? 'alert' : 'status'}">${escapeHtml(text)}</div>` : '';
}
function authPage() {
  return `<main class="auth-page"><section class="auth-aside">${brand}<div class="aside-copy"><span class="eyebrow">CUSTOMER RELATIONSHIP MANAGEMENT</span>
    <h1>Mọi mối quan hệ tốt đều bắt đầu từ một cuộc trò chuyện.</h1><p>Quản lý khách hàng, kết nối đội ngũ và phát triển doanh nghiệp trên cùng một nền tảng.</p></div>
    <div class="aside-footer">◈ &nbsp; Bảo mật tài khoản bằng xác thực nhiều lớp</div></section>
    <section class="auth-main"><div class="auth-card"><div class="mobile-brand">${brand}</div><span class="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
    <h2>Đăng nhập</h2><p class="muted">Nhập thông tin tài khoản để tiếp tục.</p>
    <form class="form-stack" data-form="login"><label for="email">Email</label><div class="input-wrap">✉ <input id="email" name="email" type="email" autocomplete="username" required maxlength="254" placeholder="you@company.com"></div>
    <div class="label-row"><label for="password">Mật khẩu</label><a href="/forgot-password">Quên mật khẩu?</a></div>
    <div class="input-wrap">▣ <input id="password" name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128" placeholder="Nhập mật khẩu"></div>
    ${alertBox(state.error)}<button class="primary-button" type="submit" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? 'Đang đăng nhập...' : 'Đăng nhập →'}</button></form>
    <div class="demo-box"><strong>Tài khoản demo</strong><span>admin@nexus.local</span><span>Mật khẩu: Admin123!</span></div>
    <p class="legal">Phiên đăng nhập được bảo vệ bằng cookie HttpOnly.</p></div></section></main>`;
}
function forgotPage() {
  const messages = state.mailbox.map((item) => `<article class="mail-item"><span>${escapeHtml(item.recipient)} · ${escapeHtml(item.subject)}</span><a href="${escapeHtml(item.resetUrl)}">Mở liên kết đặt lại mật khẩu</a></article>`).join('');
  return `<main class="simple-page"><section class="simple-card"><a class="back-link" href="/login">← Quay lại đăng nhập</a>
    <div class="icon-tile">✉</div><span class="eyebrow">KHÔI PHỤC TÀI KHOẢN</span><h1>Quên mật khẩu?</h1>
    <p class="muted">Nhập email đã đăng ký. Nếu tài khoản tồn tại, hướng dẫn đặt lại sẽ được gửi đến hộp thư.</p>
    <form class="form-stack" data-form="forgot"><label for="email">Email</label><div class="input-wrap">✉ <input id="email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@company.com"></div>
    ${alertBox(state.notice, 'success')}${alertBox(state.error)}<button class="primary-button" type="submit">Gửi liên kết đặt lại</button></form>
    <div class="mailbox-panel"><div class="mailbox-heading"><strong>Hộp thư demo</strong><button class="icon-button" data-action="mailbox" aria-label="Tải hộp thư">↻</button></div>
    <p class="muted small">Chỉ dùng khi chạy môi trường development.</p><div class="mail-list">${messages}</div></div></section></main>`;
}
function resetPage() {
  const token = new URLSearchParams(location.search).get('token') || '';
  return `<main class="simple-page"><section class="simple-card"><a class="back-link" href="/login">← Quay lại đăng nhập</a>
    <div class="icon-tile">▣</div><span class="eyebrow">BẢO MẬT TÀI KHOẢN</span><h1>Tạo mật khẩu mới</h1>
    <p class="muted">Mật khẩu cần có ít nhất 8 ký tự. Liên kết chỉ sử dụng được một lần.</p>
    ${!token ? alertBox('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.') : ''}
    ${state.notice ? alertBox(state.notice, 'success') : `<form class="form-stack" data-form="reset"><label for="password">Mật khẩu mới</label>
    <div class="input-wrap">▣ <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required ${token ? '' : 'disabled'}></div>
    <label for="confirmation">Xác nhận mật khẩu</label><div class="input-wrap">▣ <input id="confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required ${token ? '' : 'disabled'}></div>
    ${alertBox(state.error)}<button class="primary-button" type="submit" ${token ? '' : 'disabled'}>Cập nhật mật khẩu</button></form>`}</section></main>`;
}
function workspacePage() {
  return `<main class="simple-page"><section class="simple-card workspace-card">${brand}<div class="icon-tile">◈</div>
    <span class="eyebrow">ĐĂNG NHẬP THÀNH CÔNG</span><h1>Xin chào, ${escapeHtml(state.user?.name)}</h1>
    <p class="muted">Vai trò: <strong>${escapeHtml(state.user?.role)}</strong>. Trang quản lý người dùng chỉ dành cho Admin.</p>
     <a class="primary-button full-width" href="/customers">Mở module khách hàng</a><a class="secondary-button full-width" href="/deals">Mở bảng Deal</a><button class="secondary-button full-width" data-action="logout">↪ &nbsp; Đăng xuất</button></section></main>`;
}

// Tạo vỏ trang và chỗ mount React; DnD Kit quản lý cột và card bên trong.
function dealsPage() {
  return `<div class="app-shell">${appSidebar('deals')}<main class="deals-content">
    <header class="topbar"><div><span class="eyebrow">SALES PIPELINE</span><h1>Cơ hội kinh doanh</h1></div><div class="deal-header-actions"><div class="admin-avatar">${escapeHtml(state.user?.role || '')}</div><button class="primary-button compact" data-action="new-deal">＋ Tạo Deal</button></div></header>
    ${alertBox(state.error)}${alertBox(state.notice, 'success')}
    ${state.dealsLoaded && !state.deals.length ? '<p class="muted deal-empty">Chưa có Deal để hiển thị.</p>' : ''}
    <div id="deal-board-root"></div>${state.dealFormOpen ? dealCreateModal() : ''}
  </main></div>`;
}
function dealCreateModal() {
  const canAssign = ['Admin', 'Manager'].includes(state.user?.role);
  const ownerId = canAssign ? state.dealOwnerSelected : String(state.user?.id || '');
  const accounts = state.dealAccounts.filter((account) => !canAssign || !ownerId || String(account.ownerUserId) === ownerId);
  const owners = canAssign ? `<label class="deal-modal-field">Sale phụ trách<select name="ownerUserId" data-input="deal-owner" required><option value="">Chọn Sale</option>${state.dealAssignees.map((user) => `<option value="${user.id}" ${String(user.id) === state.dealOwnerSelected ? 'selected' : ''}>${escapeHtml(user.name)}</option>`).join('')}</select></label>` : '';
  return `<div class="deal-modal-backdrop" data-action="close-deal"><section class="customer-modal deal-create-modal" role="dialog" aria-modal="true" aria-labelledby="deal-create-title">
    <div class="modal-heading"><div><span class="eyebrow">SALES PIPELINE</span><h2 id="deal-create-title">Tạo cơ hội Deal</h2></div><button class="modal-close" type="button" data-action="close-deal" aria-label="Đóng">×</button></div>
    <form class="customer-form" data-form="deal">${owners}<label class="deal-modal-field">Account liên quan<select name="accountId" required><option value="">${accounts.length ? 'Chọn Account' : 'Chưa có Account phù hợp'}</option>${accounts.map((account) => `<option value="${account.id}">${escapeHtml(account.name)}</option>`).join('')}</select></label>
    <label class="deal-modal-field">Tên Deal<input name="name" required minlength="2" maxlength="160" placeholder="Ví dụ: Hợp đồng phần mềm CRM"></label><label class="deal-modal-field">Giá trị<input name="amount" type="number" min="0" step="0.01" value="0"></label>
    <label class="deal-modal-field">Tiền tệ<select name="currency"><option value="VND">VND</option><option value="USD">USD</option></select></label><label class="deal-modal-field">Giai đoạn<select name="stage"><option value="PROSPECTING">Tìm kiếm</option><option value="QUALIFICATION">Đánh giá</option><option value="PROPOSAL">Đề xuất</option><option value="NEGOTIATION">Đàm phán</option></select></label>
    <label class="deal-modal-field">Xác suất (%)<input name="probability" type="number" min="0" max="100" value="0"></label><label class="deal-modal-field">Ngày dự kiến chốt<input name="expectedCloseDate" type="date"></label>${alertBox(state.error)}
    ${accounts.length ? '' : '<p class="deal-modal-hint wide-field">Hãy tạo Account trước hoặc chọn Sale đang phụ trách Account này.</p>'}<div class="deal-modal-actions wide-field"><button class="secondary-button" type="button" data-action="close-deal">Hủy</button><button class="primary-button compact" type="submit" ${accounts.length ? '' : 'disabled'}>Tạo Deal</button></div></form></section></div>`;
}
const taskStatusLabels = { TODO: 'Cần làm', IN_PROGRESS: 'Đang thực hiện', DONE: 'Hoàn thành', CANCELLED: 'Đã hủy' };
const taskPriorityLabels = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao' };
function taskOverdue(task) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return task.due_date && String(task.due_date).slice(0, 10) < todayKey && !['DONE', 'CANCELLED'].includes(task.status);
}
function taskDate(value) {
  if (!value) return 'Chưa đặt hạn';
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN');
}
function tasksPage() {
  const overdue = state.tasks.filter(taskOverdue);
  const canAssign = ['Admin', 'Manager'].includes(state.user?.role);
  const activeAssigneeIds = state.taskAssignees.map((user) => String(user.id));
  const inactiveCurrentAssignee = state.taskEdit && !activeAssigneeIds.includes(String(state.taskEdit.assigned_to));
  const assigneeField = canAssign
    ? `<label>Giao cho<select name="assigned_to" required>${inactiveCurrentAssignee ? `<option value="${state.taskEdit.assigned_to}" selected>${escapeHtml(state.taskEdit.assignee_name)} · không còn hoạt động</option>` : ''}${!state.taskEdit && !state.taskAssignees.length ? '<option value="" selected disabled>Không có Sale đang hoạt động</option>' : ''}${state.taskAssignees.map((user) => `<option value="${user.id}" ${String(state.taskEdit?.assigned_to || '') === String(user.id) ? 'selected' : ''}>${escapeHtml(user.name)} · ${escapeHtml(user.email)}</option>`).join('')}</select></label>`
    : '';
  return `<div class="app-shell">${appSidebar('tasks')}<main class="admin-content task-content">
    <header class="topbar"><div><span class="eyebrow">TASK MANAGEMENT</span><h1>Công việc</h1></div><div class="admin-avatar">${escapeHtml(state.user?.role || '')}</div></header>
    <section class="page-intro"><div><h2>Theo dõi tiến độ công việc</h2><p class="muted">Lọc theo trạng thái, ưu tiên và nhận diện công việc quá hạn.</p></div><button class="primary-button compact" data-action="new-task">＋ Tạo Task</button></section>
    ${alertBox(state.error)}${alertBox(state.notice, 'success')}
    ${overdue.length ? `<div class="alert error task-overdue-alert" role="alert">⚠ Có ${overdue.length} Task quá hạn cần xử lý.</div>` : ''}
    ${state.taskFormOpen ? `<section class="task-form-card"><form class="customer-form" data-form="task"><label class="wide-field">Tiêu đề<input name="title" required minlength="2" maxlength="180" value="${escapeHtml(state.taskEdit?.title || '')}"></label>
      <label>Ngày đến hạn<input name="due_date" type="date" value="${escapeHtml(state.taskEdit?.due_date ? String(state.taskEdit.due_date).slice(0, 10) : '')}"></label>
      <label>Ưu tiên<select name="priority">${[['LOW','Thấp'],['MEDIUM','Trung bình'],['HIGH','Cao']].map(([value,label]) => `<option value="${value}" ${(state.taskEdit?.priority || 'MEDIUM') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Trạng thái<select name="status">${Object.entries(taskStatusLabels).map(([value,label]) => `<option value="${value}" ${(state.taskEdit?.status || 'TODO') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      ${assigneeField}${alertBox(state.error)}
      <div class="form-actions wide-field"><button type="button" class="secondary-button" data-action="close-task-form">Hủy</button><button type="submit" class="primary-button compact">${state.taskEdit ? 'Lưu thay đổi' : 'Tạo Task'}</button></div></form></section>` : ''}
    <section class="table-card task-table-card"><div class="table-toolbar"><div class="table-title"><div class="icon-tile small-tile">✓</div><div><strong>Danh sách Task</strong><span>${state.tasks.length} công việc · ${overdue.length} quá hạn</span></div></div>
      <div class="task-filters"><select aria-label="Lọc trạng thái Task" data-input="task-status-filter"><option value="">Tất cả trạng thái</option>${Object.entries(taskStatusLabels).map(([value,label]) => `<option value="${value}" ${state.taskStatusFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <select aria-label="Lọc mức ưu tiên" data-input="task-priority-filter"><option value="">Mọi mức ưu tiên</option>${Object.entries(taskPriorityLabels).map(([value,label]) => `<option value="${value}" ${state.taskPriorityFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div>
      <div class="table-scroll"><table class="task-data-table"><thead><tr><th>CÔNG VIỆC</th><th>NGƯỜI PHỤ TRÁCH</th><th>HẠN HOÀN THÀNH</th><th>ƯU TIÊN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>
      ${state.tasks.map((task) => `<tr class="${taskOverdue(task) ? 'task-row-overdue' : ''}"><td><strong>${escapeHtml(task.title)}</strong>${taskOverdue(task) ? '<span class="overdue-label">Quá hạn</span>' : ''}</td><td>${escapeHtml(task.assignee_name || '—')}</td><td>${taskDate(task.due_date)}</td>
        <td><span class="priority-pill priority-${String(task.priority || 'MEDIUM').toLowerCase()}">${escapeHtml(taskPriorityLabels[task.priority] || task.priority)}</span></td>
        <td><select class="task-status-select" aria-label="Trạng thái ${escapeHtml(task.title)}" data-task-status="${task.id}">${Object.entries(taskStatusLabels).map(([value,label]) => `<option value="${value}" ${task.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
        <td><button class="text-button" data-action="edit-task" data-id="${task.id}">Sửa</button></td></tr>`).join('') || '<tr><td class="empty-row" colspan="6">Chưa có Task phù hợp.</td></tr>'}
      </tbody></table></div></section></main></div>`;
}
function calendarDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function calendarRange() {
  const cursor = new Date(state.calendarCursor);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  if (state.calendarMode === 'month') {
    start.setDate(1);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 41);
    return { start, end };
  }
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}
function calendarPage() {
  const { start, end } = calendarRange();
  const dayCount = state.calendarMode === 'month' ? 42 : 7;
  const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = calendarDateKey(date);
    const events = state.appointments.filter((item) => String(item.startsAt).slice(0, 10) === key);
    const today = key === calendarDateKey(new Date());
    const outsideMonth = state.calendarMode === 'month' && date.getMonth() !== state.calendarCursor.getMonth();
    return `<article class="calendar-day ${today ? 'calendar-today' : ''} ${outsideMonth ? 'calendar-outside' : ''}"><div class="calendar-day-heading"><span>${date.getDate()}</span><button class="calendar-add" data-action="new-appointment" data-date="${key}" aria-label="Tạo lịch hẹn ngày ${key}">＋</button></div>
      <div class="calendar-events">${events.map((item) => `<div class="calendar-event event-${String(item.status).toLowerCase()}"><span>${escapeHtml(new Date(item.startsAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))} · ${escapeHtml(item.title)}</span>
        ${item.status === 'SCHEDULED' && Number(item.organizerId) === Number(state.user?.id) ? `<button data-action="appointment-status" data-id="${item.id}">Hoàn thành</button>` : item.status !== 'SCHEDULED' ? `<small>${item.status === 'COMPLETED' ? 'Hoàn thành' : 'Đã hủy'}</small>` : ''}</div>`).join('') || '<span class="calendar-empty"></span>'}</div></article>`;
  });
  const title = state.calendarMode === 'month'
    ? state.calendarCursor.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
    : `${start.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `<div class="app-shell">${appSidebar('calendar')}<main class="admin-content calendar-content">
    <header class="topbar"><div><span class="eyebrow">APPOINTMENT CALENDAR</span><h1>Lịch làm việc</h1></div><div class="admin-avatar">${escapeHtml(state.user?.role || '')}</div></header>
    <section class="calendar-toolbar"><div class="calendar-navigation"><button class="secondary-button compact" data-action="calendar-prev" aria-label="Thời gian trước">←</button><button class="secondary-button compact" data-action="calendar-today">Hôm nay</button><button class="secondary-button compact" data-action="calendar-next" aria-label="Thời gian sau">→</button><h2>${escapeHtml(title)}</h2></div>
      <div class="calendar-controls"><div class="calendar-mode"><button class="${state.calendarMode === 'month' ? 'selected' : ''}" data-action="calendar-mode" data-mode="month">Tháng</button><button class="${state.calendarMode === 'week' ? 'selected' : ''}" data-action="calendar-mode" data-mode="week">Tuần</button></div><button class="primary-button compact" data-action="new-appointment" data-date="${calendarDateKey(new Date())}">＋ Tạo lịch hẹn</button></div></section>
    ${alertBox(state.error)}${alertBox(state.notice, 'success')}
    <section class="table-card calendar-card"><div class="calendar-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid ${state.calendarMode === 'week' ? 'calendar-week-view' : ''}">${days.join('')}</div></section>
    ${state.appointmentFormOpen ? `<div class="modal-backdrop" data-action="close-appointment-form"><section class="customer-modal narrow-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-form-title"><div class="modal-heading"><div><span class="eyebrow">NEW APPOINTMENT</span><h2 id="appointment-form-title">Tạo lịch hẹn</h2></div><button class="modal-close" type="button" data-action="close-appointment-form">×</button></div>
      <form class="customer-form single-column" data-form="appointment"><label>Tiêu đề<input name="title" required minlength="2" maxlength="180"></label><label>Ngày<input name="date" type="date" required value="${escapeHtml(state.appointmentFormDate)}"></label>
      <div class="appointment-time-fields"><label>Bắt đầu<input name="startsTime" type="time" required value="09:00"></label><label>Kết thúc<input name="endsTime" type="time" required value="09:30"></label></div>
      <label>Địa điểm<input name="location" maxlength="255"></label><label>Mô tả<textarea name="description" rows="2" maxlength="5000"></textarea></label>
      <label>Chu kỳ lặp<select name="recurrenceFrequency"><option value="">Không lặp</option><option value="WEEKLY">Hàng tuần</option><option value="MONTHLY">Hàng tháng</option></select></label>
      <label>Ngày kết thúc lặp<input name="recurrenceUntil" type="date"></label>${alertBox(state.error)}
      <div class="form-actions"><button type="button" class="secondary-button" data-action="close-appointment-form">Hủy</button><button type="submit" class="primary-button compact">Tạo lịch hẹn</button></div></form></section></div>` : ''}
  </main></div>`;
}

// Lưu stage mới; khi kéo vào LOST, hỏi lý do để backend có đủ dữ liệu nghiệp vụ.
async function updateDealStage(deal, boardStage, details = {}) {
  const databaseStage = boardStage === 'LEAD' ? 'PROSPECTING' : boardStage;
  const result = await api(`/deals/${encodeURIComponent(deal.id)}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stage: databaseStage, expectedStage: deal.stage, expectedVersion: deal.version, ...details }),
  });
  // Lưu stage đã được server xác nhận cho lần kéo tiếp theo.
  state.deals = state.deals.map((item) => item.id === deal.id ? { ...item, stage: result.stage, version: result.version } : item);
  return result;
}
function adminPage() {
  const users = state.users || [];
  const filtered = users.filter((user) => {
    const matchesSearch = `${user.name} ${user.email} ${user.role}`.toLowerCase().includes((state.adminSearch || '').toLowerCase());
    const matchesRole = !state.adminRoleFilter || user.role === state.adminRoleFilter;
    const matchesStatus = !state.adminStatusFilter || user.status === state.adminStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalCount = users.length;
  const activeCount = users.filter((u) => u.status === 'ACTIVE').length;
  const salesCount = users.filter((u) => u.role === 'Sale').length;
  const lockedCount = users.filter((u) => u.status === 'LOCKED').length;

  return `<div class="app-shell">${appSidebar('admin')}<main class="admin-content">
    <header class="topbar modern-topbar">
      <div>
        <div class="breadcrumb">
          <span>Nexus CRM</span><span>/</span><span>Quản trị hệ thống</span><span>/</span><strong class="breadcrumb-current">Người dùng</strong>
        </div>
        <h1>Quản trị Đội ngũ & Người dùng</h1>
        <p class="topbar-sub">Thiết lập tài khoản nhân viên, phân quyền vai trò (RBAC) và kiểm soát bảo mật truy cập.</p>
      </div>
      <div class="topbar-actions">
        <button class="primary-button compact elevated-btn" data-action="toggle-user-form">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
          <span>${state.userFormOpen ? 'Đóng biểu mẫu' : 'Thêm người dùng'}</span>
        </button>
      </div>
    </header>

    ${alertBox(state.error)}${alertBox(state.notice, 'success')}

    <!-- KPI Metric Cards -->
    <section class="kpi-grid">
      <article class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Tổng tài khoản</span>
          <strong class="kpi-value">${totalCount}</strong>
          <span class="kpi-hint">Tất cả nhân sự</span>
        </div>
        <div class="kpi-icon-wrap indigo-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Đang hoạt động</span>
          <strong class="kpi-value text-emerald">${activeCount}</strong>
          <span class="kpi-hint success-hint">${totalCount ? Math.round((activeCount / totalCount) * 100) : 0}% sẵn sàng</span>
        </div>
        <div class="kpi-icon-wrap emerald-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Đội ngũ Sales</span>
          <strong class="kpi-value text-blue">${salesCount}</strong>
          <span class="kpi-hint">Kinh doanh & Deals</span>
        </div>
        <div class="kpi-icon-wrap blue-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        </div>
      </article>

      <article class="kpi-card">
        <div class="kpi-info">
          <span class="kpi-label">Tài khoản bị khóa</span>
          <strong class="kpi-value text-rose">${lockedCount}</strong>
          <span class="kpi-hint ${lockedCount ? 'danger-hint' : ''}">${lockedCount ? 'Cần xem xét' : 'Không có vi phạm'}</span>
        </div>
        <div class="kpi-icon-wrap rose-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
      </article>
    </section>

    <!-- Create User Form -->
    ${state.userFormOpen ? `<form class="create-user-form modern-form-card" data-form="create-user">
      <div class="form-heading">
        <div class="form-icon-tile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
        </div>
        <div>
          <strong>Tạo tài khoản nhân viên mới</strong>
          <span class="muted small">Mật khẩu ban đầu tối thiểu 8 ký tự. Nhân viên có thể đổi mật khẩu sau khi đăng nhập.</span>
        </div>
      </div>
      <label>Họ và tên *<input type="text" name="name" required minlength="2" maxlength="100" placeholder="VD: Nguyễn Văn A"></label>
      <label>Email đăng nhập *<input type="email" name="email" required maxlength="254" placeholder="user@nexus.local"></label>
      <label>Mật khẩu tạm thời *<input type="password" name="password" required minlength="8" maxlength="128" placeholder="Tối thiểu 8 ký tự"></label>
      <label>Vai trò hệ thống
        <select name="role">
          <option value="Sale">Sale Rep</option>
          <option value="Manager">Manager</option>
          <option value="Admin">Admin</option>
        </select>
      </label>
      <div class="form-actions">
        <button type="button" class="secondary-button" data-action="cancel-user">Hủy bỏ</button>
        <button type="submit" class="primary-button elevated-btn">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
          Tạo tài khoản
        </button>
      </div>
    </form>` : ''}

    <!-- Modern Table Card -->
    <section class="table-card modern-table-card">
      <div class="table-toolbar">
        <div class="table-title">
          <div class="table-title-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
          <div>
            <strong>Danh sách nhân sự</strong>
            <span>${filtered.length} tài khoản phù hợp</span>
          </div>
        </div>

        <div class="table-filter-group">
          <!-- Role filter -->
          <select class="table-filter-select" data-input="admin-role-filter">
            <option value="">Tất cả vai trò</option>
            <option value="Admin" ${state.adminRoleFilter === 'Admin' ? 'selected' : ''}>Admin</option>
            <option value="Manager" ${state.adminRoleFilter === 'Manager' ? 'selected' : ''}>Manager</option>
            <option value="Sale" ${state.adminRoleFilter === 'Sale' ? 'selected' : ''}>Sale Rep</option>
          </select>

          <!-- Status filter -->
          <select class="table-filter-select" data-input="admin-status-filter">
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE" ${state.adminStatusFilter === 'ACTIVE' ? 'selected' : ''}>Đang hoạt động</option>
            <option value="LOCKED" ${state.adminStatusFilter === 'LOCKED' ? 'selected' : ''}>Đã khóa</option>
          </select>

          <!-- Search Input -->
          <label class="search-wrap modern-search">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
            <input aria-label="Tìm kiếm người dùng" placeholder="Tìm tên, email..." value="${escapeHtml(state.adminSearch || '')}" data-input="admin-search">
            <kbd class="kbd-shortcut">⌘K</kbd>
          </label>
        </div>
      </div>

      <div class="table-scroll">
        <table class="modern-table">
          <thead>
            <tr>
              <th>THÀNH VIÊN</th>
              <th>VAI TRÒ PHÂN QUYỀN</th>
              <th>TRẠNG THÁI</th>
              <th class="text-right">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((user) => {
              const isCurrentUser = user.id === state.user?.id;
              const roleBadgeClass = user.role === 'Admin' ? 'badge-role-admin' : user.role === 'Manager' ? 'badge-role-manager' : 'badge-role-sale';
              return `<tr class="table-row ${user.status === 'LOCKED' ? 'row-locked' : ''}">
                <td>
                  <div class="user-cell">
                    <div class="avatar-wrap">
                      <div class="avatar ${user.role === 'Admin' ? 'avatar-admin' : user.role === 'Manager' ? 'avatar-manager' : 'avatar-sale'}">${initials(user.name)}</div>
                      <span class="user-status-dot ${user.status === 'ACTIVE' ? 'dot-active' : 'dot-locked'}"></span>
                    </div>
                    <div class="user-meta">
                      <strong class="user-name">${escapeHtml(user.name)}${isCurrentUser ? ' <span class="badge-self">(Bạn)</span>' : ''}</strong>
                      <span class="user-email">${escapeHtml(user.email)}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="role-wrapper">
                    <select class="role-select ${roleBadgeClass}" data-role-id="${user.id}" ${isCurrentUser ? 'disabled title="Không thể đổi vai trò của chính bạn"' : ''}>
                      <option ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
                      <option ${user.role === 'Manager' ? 'selected' : ''}>Manager</option>
                      <option ${user.role === 'Sale' ? 'selected' : ''}>Sale</option>
                    </select>
                  </div>
                </td>
                <td>
                  <span class="status-pill ${user.status === 'ACTIVE' ? 'status-active' : 'status-locked'}">
                    <span class="pill-dot ${user.status === 'ACTIVE' ? 'pulse' : ''}"></span>
                    ${user.status === 'ACTIVE' ? 'Đang hoạt động' : user.status === 'LOCKED' ? 'Đã khóa' : 'Ngừng hoạt động'}
                  </span>
                </td>
                <td class="text-right">
                  ${isCurrentUser ? '<span class="self-tag">Tài khoản hiện tại</span>' : `
                    <div class="row-actions justify-end">
                      <button class="action-btn ${user.status === 'ACTIVE' ? 'btn-lock' : 'btn-unlock'}" data-action="toggle-user" data-id="${user.id}" title="${user.status === 'ACTIVE' ? 'Khóa tài khoản này' : 'Mở khóa tài khoản'}">
                        ${user.status === 'ACTIVE' ? `
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          <span>Khóa</span>` : `
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                          <span>Mở khóa</span>`}
                      </button>
                      <button class="action-btn btn-delete" data-action="delete-user" data-id="${user.id}" title="Xóa tài khoản vĩnh viễn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        <span>Xóa</span>
                      </button>
                    </div>
                  `}
                </td>
              </tr>`;
            }).join('') || `<tr><td class="empty-row" colspan="4">
              <div class="empty-state-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
                <p>Không tìm thấy người dùng phù hợp với bộ lọc.</p>
              </div>
            </td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="table-pagination-footer">
        <span>Hiển thị <strong>${filtered.length}</strong> trên tổng số <strong>${totalCount}</strong> người dùng</span>
        <span class="security-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Quyền truy cập được xác thực bởi API JWT HttpOnly
        </span>
      </div>
    </section>
  </main></div>${state.deletingUser ? deleteUserModal() : ''}`;
}
function deleteUserModal() {
  const user = state.deletingUser;
  return `<div class="confirm-modal-backdrop" data-action="cancel-delete-user">
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
      <div class="confirm-modal-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </div>
      <div>
        <h2 class="confirm-modal-title" id="delete-modal-title">Xóa tài khoản này?</h2>
        <p class="confirm-modal-desc">Bạn đang chuẩn bị xóa vĩnh viễn tài khoản của
          <strong>${escapeHtml(user.name)}</strong>
          (<strong>${escapeHtml(user.email)}</strong>).
        </p>
      </div>
      <p class="confirm-modal-warn">⚠&nbsp; Hành động này không thể hoàn tác. Mọi dữ liệu liên quan đến tài khoản này sẽ bị xóa khỏi hệ thống.</p>
      <div class="confirm-modal-actions">
        <button class="btn-confirm-cancel" data-action="cancel-delete-user" type="button">Hủy bỏ</button>
        <button class="btn-confirm-delete" data-action="confirm-delete-user" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
          Xóa vĩnh viễn
        </button>
      </div>
    </div>
  </div>`;
}
function statusLabel(status) {
  return ({ NEW: 'Mới', CONTACTED: 'Đã liên hệ', QUALIFIED: 'Tiềm năng', UNQUALIFIED: 'Không phù hợp', CONVERTED: 'Đã chuyển đổi' })[status] || status;
}
function customersPage() {
  const view = state.customerView;
  const items = state.customerItems;
  const viewTabs = [['leads', 'Leads', '♧'], ['accounts', 'Accounts', '▣'], ['contacts', 'Contacts', '♙']];
  let headings = view === 'leads'
    ? '<th>KHÁCH HÀNG TIỀM NĂNG</th><th>CÔNG TY</th><th>LIÊN HỆ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th>'
    : view === 'accounts'
      ? '<th>DOANH NGHIỆP</th><th>NGÀNH</th><th>LIÊN HỆ</th><th>THAO TÁC</th>'
      : '<th>NGƯỜI LIÊN HỆ</th><th>DOANH NGHIỆP</th><th>THÔNG TIN</th><th>CHỨC VỤ</th><th>THAO TÁC</th>';
  const rows = items.map((item) => {
    if (view === 'leads') return `<tr><td><div class="user-cell"><div class="avatar">${initials(item.name)}</div><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.source || 'Chưa rõ nguồn')}</span></div></div></td>
      <td>${escapeHtml(item.company || '—')}</td><td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td>
      <td><span class="status-pill status-${String(item.status || 'NEW').toLowerCase()}">${escapeHtml(statusLabel(item.status))}</span></td><td><div class="row-actions">
      ${item.status === 'CONVERTED' ? `<a class="text-button" href="/customers/accounts/${item.accountId}">Xem Account</a>` : `<button class="text-button" data-action="edit-lead" data-id="${item.id}">Sửa</button>${item.status === 'QUALIFIED' ? `<button class="text-button" data-action="convert-lead" data-id="${item.id}">Chuyển đổi</button>` : ''}<button class="text-button danger-text-button" data-action="delete-customer" data-kind="leads" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Xóa</button>`}</div></td></tr>`;
    if (view === 'accounts') return `<tr><td><a class="customer-primary-link" href="/customers/accounts/${item.id}">${escapeHtml(item.name)}</a></td><td>${escapeHtml(item.industry || '—')}</td>
      <td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td><td><div class="row-actions"><a class="text-button" href="/customers/accounts/${item.id}">Xem chi tiết</a><button class="text-button danger-text-button" data-action="delete-customer" data-kind="accounts" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Xóa</button></div></td></tr>`;
    return `<tr><td><strong>${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</strong></td><td><a class="customer-primary-link" href="/customers/accounts/${item.accountId}">${escapeHtml(item.accountName)}</a></td>
      <td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td><td>${escapeHtml(item.jobTitle || '—')}</td><td><button class="text-button danger-text-button" data-action="delete-customer" data-kind="contacts" data-id="${item.id}" data-name="${escapeHtml(`${item.firstName} ${item.lastName}`)}">Xóa</button></td></tr>`;
  }).join('');
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(state.customerTotal / pageSize));
  const columnCount = view === 'leads' ? 5 : view === 'contacts' ? 5 : 4;
  return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content customer-content"><header class="topbar"><div><span class="eyebrow">CUSTOMER RELATIONSHIP</span><h1>Khách hàng</h1></div><div class="admin-avatar">${state.customerTotal} bản ghi</div></header>
    <section class="page-intro"><div><h2>Danh sách khách hàng</h2><p class="muted">Theo dõi lead, doanh nghiệp và người liên hệ trong một nơi.</p></div>${view === 'leads' ? '<button class="primary-button compact" data-action="new-lead">＋ Thêm Lead</button>' : ''}</section>
    ${alertBox(state.error)}${alertBox(state.notice, 'success')}<nav class="customer-tabs" aria-label="Loại khách hàng">${viewTabs.map(([id, title, icon]) => `<button class="customer-tab ${view === id ? 'selected' : ''}" data-view="${id}">${icon} &nbsp; ${title}</button>`).join('')}</nav>
    <section class="table-card customer-table-card"><div class="table-toolbar"><div class="table-title"><div class="icon-tile small-tile">♧</div><div><strong>${viewTabs.find(([id]) => id === view)[1]}</strong><span>${state.customerTotal} kết quả</span></div></div>
    <div class="customer-filters">${view === 'leads' ? `<select aria-label="Lọc theo trạng thái" data-input="customer-status"><option value="">Tất cả trạng thái</option>${[['NEW','Mới'],['CONTACTED','Đã liên hệ'],['QUALIFIED','Tiềm năng'],['UNQUALIFIED','Không phù hợp'],['CONVERTED','Đã chuyển đổi']].map(([value,label]) => `<option value="${value}" ${state.customerStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}
    <label class="search-wrap">⌕ <input aria-label="Tìm khách hàng" placeholder="Tìm tên, email, công ty..." value="${escapeHtml(state.customerSearch)}" data-input="customer-search"></label></div></div>
    <div class="table-scroll"><table class="customer-data-table customer-data-table-${view}"><thead><tr>${headings}</tr></thead><tbody>${rows || `<tr><td class="empty-row" colspan="${columnCount}">${state.customerLoading ? 'Đang tải dữ liệu...' : state.error ? `Không tải được dữ liệu. <button class="text-button" data-action="reload-customers">Thử tải lại</button>` : 'Không tìm thấy dữ liệu phù hợp.'}</td></tr>`}</tbody></table></div>
    <div class="customer-pagination"><span>Hiển thị ${state.customerTotal ? (state.customerPage - 1) * pageSize + 1 : 0}–${Math.min(state.customerPage * pageSize, state.customerTotal)} trên ${state.customerTotal}</span>
    <div><button class="secondary-button pagination-button" data-action="page-prev" ${state.customerPage <= 1 ? 'disabled' : ''}>‹</button><span>Trang ${state.customerPage} / ${pageCount}</span><button class="secondary-button pagination-button" data-action="page-next" ${state.customerPage >= pageCount ? 'disabled' : ''}>›</button></div></div></section>
    ${state.leadFormOpen ? leadModal() : ''}${state.converting ? convertModal() : ''}${state.customerDeleteConfirm ? customerDeleteModal() : ''}</main></div>`;
}
function customerDeleteModal() {
  const item = state.customerDeleteConfirm;
  const type = ({ leads: 'Lead', accounts: 'Account', contacts: 'Contact' })[item.kind];
  const hint = item.kind === 'leads' ? 'Lead sẽ được xóa mềm và ẩn khỏi danh sách.' : item.kind === 'accounts' ? 'Account còn Contact, Deal hoặc dữ liệu liên quan thì máy chủ sẽ từ chối xóa.' : 'Contact còn được Deal, Task hoặc lịch hẹn sử dụng thì máy chủ sẽ từ chối xóa.';
  return `<div class="modal-backdrop" data-action="cancel-delete-customer"><section class="deal-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-customer-title"><button class="deal-modal-close" type="button" data-action="cancel-delete-customer" aria-label="Đóng">×</button><span class="eyebrow">XÁC NHẬN XÓA</span><h2 id="delete-customer-title">Xóa ${type}?</h2><p class="muted">Bạn có chắc muốn xóa <strong>${escapeHtml(item.name)}</strong>?</p><p class="deal-modal-hint">${hint}</p>${alertBox(state.error)}<div class="deal-modal-actions"><button class="secondary-button" type="button" data-action="cancel-delete-customer">Hủy</button><button class="btn-confirm-delete" type="button" data-action="confirm-delete-customer">Xác nhận xóa</button></div></section></div>`;
}
function leadModal() {
  const lead = state.leadEdit || {};
  const f = (name, label, type = 'text', required = false, max = 160) => `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(lead[name] || '')}" maxlength="${max}" ${required ? 'required' : ''}></label>`;
  return `<div class="modal-backdrop" data-action="close-modal"><section class="customer-modal" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
    <div class="modal-heading"><div><span class="eyebrow">LEAD MANAGEMENT</span><h2 id="lead-modal-title">${state.leadEdit ? 'Chỉnh sửa Lead' : 'Thêm Lead mới'}</h2></div><button class="modal-close" data-action="close-lead">×</button></div>
    <form class="customer-form" data-form="lead">${f('name','Họ tên *','text',true)}${f('company','Công ty')}${f('email','Email','email',!lead.phone,254)}${f('phone','Số điện thoại','text',!lead.email,40)}${f('source','Nguồn Lead','text',false,80)}
    <label>Trạng thái<select name="status">${[['NEW','Mới'],['CONTACTED','Đã liên hệ'],['QUALIFIED','Tiềm năng'],['UNQUALIFIED','Không phù hợp']].map(([v,l]) => `<option value="${v}" ${(lead.status || 'NEW') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="wide-field">Ghi chú<textarea name="notes" rows="3" maxlength="5000">${escapeHtml(lead.notes || '')}</textarea></label>${alertBox(state.error)}
    <div class="form-actions wide-field"><button type="button" class="secondary-button" data-action="close-lead">Hủy</button><button type="submit" class="primary-button compact">${state.leadEdit ? 'Lưu thay đổi' : 'Tạo Lead'}</button></div></form></section></div>`;
}
function convertModal() {
  return `<div class="modal-backdrop"><section class="customer-modal narrow-modal" role="dialog" aria-modal="true"><div class="modal-heading"><div><span class="eyebrow">LEAD CONVERSION</span><h2>Chuyển đổi Lead</h2></div><button class="modal-close" data-action="close-convert">×</button></div>
    <p class="muted">Chuyển <strong>${escapeHtml(state.converting.name)}</strong> thành Account và tạo Contact liên quan.</p>
    <form class="customer-form single-column" data-form="convert"><label>Tên Account<input name="accountName" required minlength="2" maxlength="160" value="${escapeHtml(state.accountName)}"></label>${alertBox(state.error)}
    <div class="form-actions"><button type="button" class="secondary-button" data-action="close-convert">Hủy</button><button type="submit" class="primary-button compact">Chuyển đổi</button></div></form></section></div>`;
}
function activityTimelineItem(activity) {
  const presentation = {
    CALL: { icon: '☎', label: 'Cuộc gọi', className: 'activity-call' },
    EMAIL: { icon: '✉', label: 'Email', className: 'activity-email' },
    MEETING: { icon: '▦', label: 'Cuộc họp', className: 'activity-meeting' },
    NOTE: { icon: '✎', label: 'Ghi chú', className: 'activity-note' },
    STATUS_CHANGE: { icon: '↻', label: 'Cập nhật trạng thái', className: 'activity-status' },
    OTHER: { icon: '•', label: 'Hoạt động khác', className: 'activity-other' },
  }[activity.type] || { icon: '•', label: 'Hoạt động', className: 'activity-other' };
  const occurredAt = activity.occurredAt ? new Date(activity.occurredAt).toLocaleString('vi-VN') : 'Không rõ thời gian';
  return `<div class="timeline-item"><span class="activity-type-icon ${presentation.className}" aria-label="${presentation.label}" title="${presentation.label}">${presentation.icon}</span>
    <div><strong>${escapeHtml(activity.subject)}</strong><span>${presentation.label} · ${escapeHtml(occurredAt)}</span>
    ${activity.details ? `<p>${escapeHtml(activity.details)}</p>` : ''}</div></div>`;
}
function geminiCopilotPanel() {
  const g = state.geminiSummary;
  if (!g) return '';
  if (g.loading) {
    return `<section class="gemini-copilot-card loading">
      <div class="gemini-loading-spinner">✦</div>
      <div class="gemini-loading-text">
        <strong>Gemini đang phân tích Customer 360°...</strong>
        <span>Đang tổng hợp dữ liệu doanh nghiệp, cơ hội Deal và lịch sử tương tác để xây dựng chiến lược tiếp cận.</span>
      </div>
    </section>`;
  }
  if (g.error) {
    return `<section class="gemini-copilot-card error-card">
      <div class="gemini-error-header">
        <span class="badge-error">⚠️ Lỗi phân tích Gemini AI</span>
        <button class="secondary-button compact" data-action="generate-gemini-summary">Thử lại</button>
      </div>
      <p class="gemini-error-msg">${escapeHtml(g.error)}</p>
      ${g.missingConfig ? `<div class="gemini-config-tip">
        <strong>Hướng dẫn cấu hình:</strong>
        <p>1. Lấy API key tại <a href="https://aistudio.google.com/" target="_blank" rel="noopener">Google AI Studio</a>.<br>
        2. Thêm vào file <code>.env</code> ở thư mục gốc: <code>GEMINI_API_KEY=your_api_key</code>.<br>
        3. Khởi động lại máy chủ ứng dụng.</p>
      </div>` : ''}
    </section>`;
  }
  const data = g.data;
  if (!data) return '';

  const health = data.relationship_health || { status: 'GOOD', score: 70, headline: '' };
  const healthClass = health.status === 'EXCELLENT' ? 'health-excellent'
    : health.status === 'GOOD' ? 'health-good'
    : health.status === 'NEEDS_ATTENTION' ? 'health-warning' : 'health-danger';
  const healthLabel = health.status === 'EXCELLENT' ? 'Xuất sắc'
    : health.status === 'GOOD' ? 'Tích cực'
    : health.status === 'NEEDS_ATTENTION' ? 'Cần chú ý' : 'Nguy cơ';

  const highlights = (data.key_highlights || []).map((h) => `<li>${escapeHtml(h)}</li>`).join('');
  const risks = (data.risks || []).map((r) => `<li class="risk-item">⚠️ ${escapeHtml(r)}</li>`).join('');
  const opportunities = (data.opportunities || []).map((o) => `<li class="opp-item">🚀 ${escapeHtml(o)}</li>`).join('');

  const actions = (data.recommended_actions || []).map((act, index) => {
    const prioClass = act.priority === 'HIGH' ? 'priority-high' : act.priority === 'MEDIUM' ? 'priority-medium' : 'priority-low';
    const prioLabel = act.priority === 'HIGH' ? 'Cao' : act.priority === 'MEDIUM' ? 'Trung bình' : 'Thấp';
    return `<div class="gemini-action-item">
      <div class="gemini-action-info">
        <div class="gemini-action-top">
          <span class="priority-pill ${prioClass}">${prioLabel}</span>
          <span class="gemini-action-due">Hạn đề xuất: ${act.due_days ? `${act.due_days} ngày tới` : 'Trong tuần'}</span>
        </div>
        <strong>${escapeHtml(act.title)}</strong>
        <p>${escapeHtml(act.rationale)}</p>
      </div>
      <button class="secondary-button compact action-create-task" data-action="gemini-create-task" data-action-index="${index}">
        ＋ Tạo Task vào CRM
      </button>
    </div>`;
  }).join('');

  const email = data.email_draft || {};

  return `<section class="gemini-copilot-card">
    <div class="gemini-header">
      <div class="gemini-title-group">
        <div class="gemini-sparkle-icon">✦</div>
        <div>
          <div class="gemini-eyebrow">GEMINI 360° AI COPILOT · ${escapeHtml(data.model || 'gemini-4-hydrogen')}</div>
          <h3>Chiến lược & Đánh giá khách hàng thông minh</h3>
        </div>
      </div>
      <div class="gemini-health-badge ${healthClass}">
        <span class="health-score">${health.score}/100</span>
        <span class="health-text">${healthLabel}</span>
      </div>
    </div>

    ${state.geminiTaskNotice ? `<div class="alert success">${escapeHtml(state.geminiTaskNotice)}</div>` : ''}

    <div class="gemini-headline-box">
      <strong>Đánh giá nhanh:</strong> ${escapeHtml(health.headline)}
    </div>

    <div class="gemini-section">
      <h4>TÓM TẮT ĐIỀU HÀNH</h4>
      <p class="gemini-summary-text">${escapeHtml(data.executive_summary)}</p>
    </div>

    ${highlights ? `<div class="gemini-section">
      <h4>ĐIỂM NHẤN QUAN TRỌNG</h4>
      <ul class="gemini-list highlights-list">${highlights}</ul>
    </div>` : ''}

    <div class="gemini-two-col">
      <div class="gemini-col">
        <h4 class="col-title danger-text">⚠️ RỦI RO CẦN LƯU Ý</h4>
        <ul class="gemini-list risks-list">${risks || '<li>Không ghi nhận rủi ro đáng kể.</li>'}</ul>
      </div>
      <div class="gemini-col">
        <h4 class="col-title success-text">🚀 CƠ HỘI PHÁT TRIỂN (UPSELL / EXPAND)</h4>
        <ul class="gemini-list opps-list">${opportunities || '<li>Chưa có cơ hội mở rộng thêm.</li>'}</ul>
      </div>
    </div>

    ${actions ? `<div class="gemini-section">
      <h4>KẾ HOẠCH HÀNH ĐỘNG ĐỀ XUẤT (NEXT BEST ACTIONS)</h4>
      <div class="gemini-actions-list">${actions}</div>
    </div>` : ''}

    ${email.body ? `<div class="gemini-section email-draft-section">
      <div class="email-draft-header">
        <h4>GỢI Ý EMAIL CHĂM SÓC KHÁCH HÀNG (CÁ NHÂN HÓA)</h4>
        <button class="secondary-button compact" data-action="copy-gemini-email">
          ${state.emailCopied ? '✓ Đã sao chép' : '📋 Sao chép Email'}
        </button>
      </div>
      <div class="email-draft-box">
        <div class="email-draft-meta">
          <span><strong>Gửi tới:</strong> ${escapeHtml(email.recipient_name || 'Khách hàng')}</span>
          <span><strong>Tiêu đề:</strong> ${escapeHtml(email.subject || 'Follow-up')}</span>
        </div>
        <pre class="email-draft-content">${escapeHtml(email.body)}</pre>
      </div>
    </div>` : ''}
  </section>`;
}
function accountDetailPage() {
  if (!state.detail) return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content"><div class="loading-screen customer-loading">Đang tải hồ sơ khách hàng...</div></main></div>`;
  const { account, contacts, deals, activities } = state.detail;
  const summaries = [['EMAIL', account.email], ['ĐIỆN THOẠI', account.phone], ['WEBSITE', account.website], ['ĐỊA CHỈ', account.billingAddress], ['NHÂN VIÊN PHỤ TRÁCH', account.ownerName]];
  return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content customer-content"><a class="back-link customer-back" href="/customers">← Danh sách khách hàng</a>${alertBox(state.error)}
    <header class="account-hero"><div class="account-mark">▣</div><div class="account-heading"><span class="eyebrow">CUSTOMER 360°</span><h1>${escapeHtml(account.name)}</h1><p>${escapeHtml(account.industry || 'Chưa phân loại ngành')}</p></div>
      <div class="account-hero-aside">
        <span class="status-pill status-active">Khách hàng</span>
        <button class="ai-trigger-button ${state.geminiSummary?.loading ? 'busy' : ''}" data-action="generate-gemini-summary" ${state.geminiSummary?.loading ? 'disabled' : ''}>
          ${state.geminiSummary?.loading ? '✦ Đang phân tích...' : '✨ Phân tích AI Copilot'}
        </button>
      </div>
    </header>
    ${geminiCopilotPanel()}
    <section class="account-summary-grid">${summaries.map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${escapeHtml(value || 'Chưa cập nhật')}</strong></article>`).join('')}</section>
    <section class="customer-detail-grid"><article class="table-card detail-section"><div class="detail-section-heading"><div class="icon-tile small-tile">♙</div><div><strong>Người liên hệ</strong><span>${contacts.length} liên hệ</span></div></div>
    ${contacts.length ? `<div class="related-list">${contacts.map((c) => `<div class="related-item"><div class="avatar">${initials(c.firstName)}</div><div class="related-main"><strong>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</strong><span>${escapeHtml(c.jobTitle || 'Chưa có chức vụ')}</span><small>${escapeHtml(c.email || c.phone || 'Chưa có thông tin liên hệ')}</small></div></div>`).join('')}</div>` : '<p class="empty-state">Chưa có người liên hệ.</p>'}</article>
    <article class="table-card detail-section"><div class="detail-section-heading"><div class="icon-tile small-tile">◇</div><div><strong>Cơ hội kinh doanh</strong><span>${deals.length} cơ hội gần đây</span></div></div>
    ${deals.length ? `<div class="related-list">${deals.map((d) => `<div class="related-item deal-item"><div class="related-main"><strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.stage)} · ${escapeHtml(d.probability)}%</span></div><strong>${escapeHtml(d.currency)} ${Number(d.amount).toLocaleString('vi-VN')}</strong></div>`).join('')}</div>` : '<p class="empty-state">Chưa có cơ hội kinh doanh.</p>'}</article>
    <article class="table-card detail-section activity-section"><div class="detail-section-heading"><div class="icon-tile small-tile">◷</div><div><strong>Lịch sử tương tác</strong><span>${activities.length} hoạt động gần đây · mới nhất trước</span></div></div>
    ${activities.length ? `<div class="timeline activity-timeline">${activities.map(activityTimelineItem).join('')}</div>` : '<p class="empty-state">Chưa có lịch sử tương tác.</p>'}</article></section></main></div>`;
}
async function loadCustomers() {
  const key = `${state.customerView}|${state.customerPage}|${state.customerSearch}|${state.customerStatus}`;
  if (customerRequest === key || customerLoadedKey === key) return;
  customerRequest = key;
  state.customerLoading = true;
  state.customerItems = [];
  state.customerTotal = 0;
  state.error = '';
  if (route() === '/customers') render();
  try {
    const params = new URLSearchParams({ page: String(state.customerPage), pageSize: '10', search: state.customerSearch });
    if (state.customerView === 'leads' && state.customerStatus) params.set('status', state.customerStatus);
    const data = await api(`/customers/${state.customerView}?${params}`);
    if (customerRequest !== key) return;
    state.customerItems = data.items;
    state.customerTotal = data.total;
    state.error = '';
  } catch (error) {
    if (customerRequest === key) {
      state.customerItems = [];
      state.customerTotal = 0;
      state.error = error.message;
    }
  } finally {
    if (customerRequest === key) {
      // Cache this completed attempt so render() does not immediately fetch it again.
      // Errors are cached too; the explicit retry action clears this key.
      customerLoadedKey = key;
      customerRequest = '';
      state.customerLoading = false;
      if (route() === '/customers') render();
    }
  }
}
async function loadDealCreateOptions() {
  if (state.dealOptionsLoaded) return;
  try {
    const [accounts, assignees] = await Promise.all([
      api('/deals/accounts'),
      ['Admin', 'Manager'].includes(state.user?.role) ? api('/tasks/assignees') : Promise.resolve({ users: [] }),
    ]);
    state.dealAccounts = accounts.items || [];
    state.dealAssignees = assignees.users || [];
    state.dealOptionsLoaded = true;
    if (state.user?.role === 'Sale') state.dealOwnerSelected = String(state.user.id);
    render();
  } catch (error) {
    state.error = error.message;
    render();
  }
}
async function loadDetail(id) {
  state.geminiSummary = null;
  state.geminiTaskNotice = '';
  state.emailCopied = false;
  try {
    state.detail = await api(`/customers/accounts/${encodeURIComponent(id)}`);
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  if (route().startsWith('/customers/accounts/')) render();
}
async function loadUsers() {
  try {
    const data = await api('/admin/users');
    state.users = data.users;
    state.usersLoaded = true;
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  if (route() === '/admin/users') render();
}
// Lấy Deal từ API một lần khi mở board, sau đó render lại để đổ card vào cột.
async function loadDeals() {
  try {
    const result = await api('/deals');
    state.deals = result.deals || [];
    state.dealsLoaded = true;
    state.error = '';
  } catch (error) {
    state.error = error.message;
  }
  if (route() === '/deals') render();
}
async function loadTasks() {
  const params = new URLSearchParams();
  if (state.taskStatusFilter) params.set('status', state.taskStatusFilter);
  if (state.taskPriorityFilter) params.set('priority', state.taskPriorityFilter);
  const key = `${state.taskStatusFilter}|${state.taskPriorityFilter}`;
  if (taskRequest === key && state.tasksLoaded) return;
  taskRequest = key;
  state.tasksLoaded = true;
  try {
    const result = await api(`/tasks${params.toString() ? `?${params}` : ''}`);
    if (taskRequest !== key) return;
    state.tasks = result.tasks;
    state.error = '';
  } catch (error) {
    if (taskRequest !== key) return;
    state.error = error.message;
  }
  if (route() === '/tasks' && taskRequest === key) render();
}
async function loadTaskAssignees() {
  state.taskAssigneesLoaded = true;
  try {
    state.taskAssignees = (await api('/tasks/assignees')).users;
  } catch (error) {
    state.error = error.message;
  }
  if (route() === '/tasks') render();
}
async function loadAppointments() {
  const { start, end } = calendarRange();
  const key = `${state.calendarMode}|${calendarDateKey(start)}|${calendarDateKey(end)}`;
  if (appointmentRequest === key) return;
  appointmentRequest = key;
  state.appointmentsLoaded = true;
  try {
    const appointments = [];
    let page = 1;
    let total = 0;
    do {
      const params = new URLSearchParams({
        from: calendarDateKey(start), to: calendarDateKey(end),
        page: String(page), pageSize: '50',
      });
      const result = await api(`/appointments?${params}`);
      if (appointmentRequest !== key) return;
      appointments.push(...result.appointments);
      total = result.total;
      page += 1;
    } while (appointments.length < total);
    state.appointments = appointments;
    state.error = '';
  } catch (error) {
    if (appointmentRequest !== key) return;
    state.error = error.message;
  }
  if (route() === '/calendar' && appointmentRequest === key) render();
}
function render() {
  if (state.loading) {
    root.innerHTML = '<div class="loading-screen">Đang tải phiên đăng nhập...</div>';
    return;
  }
  const path = route();
  if (!state.user && !['/login', '/forgot-password', '/reset-password'].includes(path)) {
    history.replaceState({}, '', '/login');
    root.innerHTML = authPage();
    return;
  }
  if (path === '/login') {
    if (state.user) {
      navigate(state.user.role === 'Admin' ? '/admin/users' : '/workspace', true);
      return;
    }
    root.innerHTML = authPage();
  } else if (path === '/forgot-password') root.innerHTML = forgotPage();
  else if (path === '/reset-password') root.innerHTML = resetPage();
  else if (path === '/admin/users') {
    if (state.user.role !== 'Admin') {
      navigate('/workspace', true);
      return;
    }
    root.innerHTML = adminPage();
    if (!state.usersLoaded) void loadUsers();
  } else if (path === '/customers') {
    root.innerHTML = customersPage();
    void loadCustomers();
  } else if (path.startsWith('/customers/accounts/')) {
    root.innerHTML = accountDetailPage();
    const id = path.split('/').pop();
    if (!state.detail) void loadDetail(id);
  } else if (path === '/deals') {
    if (unmountDealBoard) { unmountDealBoard(); unmountDealBoard = null; }
    root.innerHTML = dealsPage();
    if (state.dealsLoaded) {
      if (typeof window.mountDealBoard === 'function' && !unmountDealBoard) {
        unmountDealBoard = window.mountDealBoard(document.getElementById('deal-board-root'), {
          deals: state.deals,
          onStageChange: updateDealStage,
          onHistory: async (deal) => (await api(`/deals/${encodeURIComponent(deal.id)}/history`)).history,
          onDelete: async (deal) => {
            await api(`/deals/${encodeURIComponent(deal.id)}`, { method: 'DELETE' });
            state.deals = state.deals.filter((item) => String(item.id) !== String(deal.id));
          },
        });
      } else if (typeof window.mountDealBoard !== 'function') {
        void loadDealBoardBundle().then(() => {
          if (typeof window.mountDealBoard !== 'function') {
            throw new Error('Bảng Deal chưa khởi tạo được. Vui lòng tải lại trang.');
          }
          if (route() === '/deals' && state.dealsLoaded && !unmountDealBoard) render();
        }).catch((error) => {
          console.error(error);
          const board = document.getElementById('deal-board-root');
          if (board) board.innerHTML = `<p class="alert error">${escapeHtml(error.message)}</p>`;
        });
      }
    }
    if (!state.dealsLoaded) void loadDeals();
  } else if (path === '/tasks') {
    root.innerHTML = tasksPage();
    if (!state.tasksLoaded) void loadTasks();
    if (['Admin', 'Manager'].includes(state.user?.role) && !state.taskAssigneesLoaded) void loadTaskAssignees();
  } else if (path === '/calendar') {
    root.innerHTML = calendarPage();
    if (!state.appointmentsLoaded) void loadAppointments();
  } else if (path === '/workspace') root.innerHTML = workspacePage();
  else navigate(state.user?.role === 'Admin' ? '/admin/users' : '/workspace', true);
}
root.addEventListener('click', async (event) => {
  const anchor = event.target.closest('a[href]');
  if (anchor && anchor.origin === location.origin && anchor.getAttribute('href').startsWith('/')) {
    event.preventDefault();
    navigate(anchor.getAttribute('href'));
    return;
  }
  const button = event.target.closest('[data-action], [data-view]');
  if (!button) return;
  if (button.dataset.view) {
    state.customerView = button.dataset.view;
    state.customerPage = 1;
    state.customerStatus = '';
    customerRequest = '';
    customerLoadedKey = '';
    render();
    return;
  }
  const id = Number(button.dataset.id);
  switch (button.dataset.action) {
    case 'logout':
      try { await api('/auth/logout', { method: 'POST' }); } catch (error) { console.error(error); }
      state.user = null;
      navigate('/login', true);
      break;
    case 'mailbox':
      try { state.mailbox = (await api('/dev/mailbox')).messages; state.error = ''; }
      catch (error) { state.error = error.message; }
      render();
      break;
    case 'toggle-user-form': state.userFormOpen = !state.userFormOpen; render(); break;
    case 'cancel-user': state.userFormOpen = false; render(); break;
    case 'toggle-user': {
      const target = state.users.find((item) => item.id === id);
      if (!target) break;
      try {
        await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ status: target.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE' }) });
        state.notice = `Đã cập nhật ${target.email}.`;
        state.users = (await api('/admin/users')).users;
      } catch (error) { state.error = error.message; }
      render();
      break;
    }
    case 'delete-user': {
      const target = state.users.find((item) => item.id === id);
      if (!target) break;
      state.deletingUser = target;
      render();
      break;
    }
    case 'cancel-delete-user': {
      state.deletingUser = null;
      render();
      break;
    }
    case 'confirm-delete-user': {
      const target = state.deletingUser;
      if (!target) break;
      state.deletingUser = null;
      try {
        await api(`/admin/users/${target.id}`, { method: 'DELETE' });
        state.notice = `Đã xóa tài khoản ${target.email}.`;
        state.users = (await api('/admin/users')).users;
      } catch (error) { state.error = error.message; }
      render();
      break;
    }
    case 'new-lead': state.leadEdit = null; state.leadFormOpen = true; state.error = ''; render(); break;
    case 'close-lead': state.leadFormOpen = false; state.error = ''; render(); break;
    case 'close-modal':
      if (event.target === button) { state.leadFormOpen = false; render(); }
      break;
    case 'edit-lead':
      state.leadEdit = state.customerItems.find((item) => item.id === id) || null;
      state.leadFormOpen = Boolean(state.leadEdit); state.error = ''; render(); break;
    case 'convert-lead':
      state.converting = state.customerItems.find((item) => item.id === id) || null;
      state.accountName = state.converting?.company || state.converting?.name || '';
      state.error = ''; render(); break;
    case 'close-convert': state.converting = null; state.error = ''; render(); break;
    case 'new-deal':
      state.dealFormOpen = true; state.dealOwnerSelected = state.user?.role === 'Sale' ? String(state.user.id) : '';
      state.error = ''; state.notice = ''; render(); void loadDealCreateOptions(); break;
    case 'close-deal':
      if (button.classList.contains('deal-modal-backdrop') && event.target !== button) break;
      state.dealFormOpen = false; state.error = ''; render(); break;
    case 'delete-customer':
      state.customerDeleteConfirm = { kind: button.dataset.kind, id, name: button.dataset.name || '' };
      state.error = ''; render(); break;
    case 'cancel-delete-customer':
      if (button.classList.contains('modal-backdrop') && event.target !== button) break;
      state.customerDeleteConfirm = null; state.error = ''; render(); break;
    case 'confirm-delete-customer': {
      const target = state.customerDeleteConfirm;
      if (!target) break;
      try {
        await api(`/${target.kind}/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
        state.notice = `${({ leads: 'Lead', accounts: 'Account', contacts: 'Contact' })[target.kind]} đã được xóa.`;
        state.customerDeleteConfirm = null;
        state.error = '';
        customerRequest = '';
        customerLoadedKey = '';
        await loadCustomers();
      } catch (error) { state.error = error.message; }
      render();
      break;
    }
    case 'page-prev':
      if (state.customerPage > 1) { state.customerPage -= 1; customerRequest = ''; customerLoadedKey = ''; render(); }
      break;
    case 'page-next':
      if (state.customerPage < Math.ceil(state.customerTotal / 10)) { state.customerPage += 1; customerRequest = ''; customerLoadedKey = ''; render(); }
      break;
    case 'reload-customers':
      customerRequest = '';
      customerLoadedKey = '';
      state.error = '';
      void loadCustomers();
      break;
    case 'new-task':
      state.taskEdit = null; state.taskFormOpen = true; state.error = ''; render(); break;
    case 'close-task-form':
      state.taskFormOpen = false; state.taskEdit = null; state.error = ''; render(); break;
    case 'edit-task':
      state.taskEdit = state.tasks.find((task) => Number(task.id) === id) || null;
      state.taskFormOpen = Boolean(state.taskEdit); state.error = ''; render(); break;
    case 'calendar-prev':
    case 'calendar-next': {
      const direction = button.dataset.action === 'calendar-prev' ? -1 : 1;
      if (state.calendarMode === 'month') {
        state.calendarCursor.setDate(1);
        state.calendarCursor.setMonth(state.calendarCursor.getMonth() + direction);
      }
      else state.calendarCursor.setDate(state.calendarCursor.getDate() + 7 * direction);
      state.appointmentsLoaded = false; appointmentRequest = ''; render(); break;
    }
    case 'calendar-today':
      state.calendarCursor = new Date();
      state.appointmentsLoaded = false; appointmentRequest = ''; render(); break;
    case 'calendar-mode':
      if (state.calendarMode !== button.dataset.mode) {
        state.calendarMode = button.dataset.mode; state.appointmentsLoaded = false; appointmentRequest = ''; render();
      }
      break;
    case 'new-appointment':
      state.appointmentFormDate = button.dataset.date || calendarDateKey(new Date());
      state.appointmentFormOpen = true; state.error = ''; render(); break;
    case 'close-appointment-form':
      if (button.classList.contains('modal-backdrop') && event.target !== button) break;
      state.appointmentFormOpen = false; state.error = ''; render(); break;
    case 'appointment-status':
      try {
        await api(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED' }) });
        state.notice = 'Đã đánh dấu lịch hẹn hoàn thành.';
        state.appointmentsLoaded = false; appointmentRequest = '';
      } catch (error) { state.error = error.message; }
      render();
      break;
    case 'generate-gemini-summary': {
      const accountId = state.detail?.account?.id;
      if (!accountId) break;
      state.geminiSummary = { loading: true, data: null, error: '', missingConfig: false };
      state.geminiTaskNotice = '';
      state.emailCopied = false;
      render();
      try {
        const res = await api(`/customers/accounts/${encodeURIComponent(accountId)}/gemini-summary`, { method: 'POST' });
        state.geminiSummary = { loading: false, data: res.summary, error: '', missingConfig: false };
      } catch (err) {
        const isMissingKey = err.message && (err.message.includes('GEMINI_API_KEY') || err.message.includes('Chưa cấu hình'));
        state.geminiSummary = { loading: false, data: null, error: err.message, missingConfig: Boolean(isMissingKey) };
      }
      render();
      break;
    }
    case 'gemini-create-task': {
      const actionIndex = Number(button.dataset.actionIndex);
      const actionItem = state.geminiSummary?.data?.recommended_actions?.[actionIndex];
      if (!actionItem || !state.detail?.account) break;
      const days = Number(actionItem.due_days) || 3;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      const isoDue = dueDate.toISOString().slice(0, 10);
      const assignedId = state.user?.role === 'Sale' ? state.user.id : (state.detail.account.ownerUserId || state.user?.id);
      try {
        await api('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: `[${state.detail.account.name}] ${actionItem.title}`.slice(0, 180),
            priority: actionItem.priority || 'MEDIUM',
            due_date: isoDue,
            assigned_to: assignedId,
          }),
        });
        state.geminiTaskNotice = `✓ Đã tạo công việc: "${actionItem.title}" vào CRM!`;
        button.disabled = true;
        button.textContent = '✓ Đã tạo Task';
      } catch (err) {
        state.geminiTaskNotice = `⚠️ Không thể tạo Task: ${err.message}`;
      }
      render();
      break;
    }
    case 'copy-gemini-email': {
      const email = state.geminiSummary?.data?.email_draft;
      if (!email) break;
      const fullText = `Tiêu đề: ${email.subject || ''}\n\n${email.body || ''}`;
      try {
        await navigator.clipboard.writeText(fullText);
        state.emailCopied = true;
        render();
        setTimeout(() => {
          state.emailCopied = false;
          if (route().startsWith('/customers/accounts/')) render();
        }, 3000);
      } catch (err) {
        console.warn('Clipboard write failed', err);
      }
      break;
    }
  }
});
root.addEventListener('input', (event) => {
  const input = event.target;
  if (input.dataset.input === 'admin-search') {
    state.adminSearch = input.value;
    const pos = input.selectionStart;
    render();
    const refreshed = root.querySelector('[data-input="admin-search"]');
    refreshed?.focus();
    refreshed?.setSelectionRange(pos, pos);
  } else if (input.dataset.input === 'customer-search') {
    state.customerSearch = input.value;
    state.customerPage = 1;
    customerRequest = '';
    customerLoadedKey = '';
    clearTimeout(customerDebounce);
    customerDebounce = setTimeout(() => { render(); void loadCustomers(); }, 250);
  }
});
root.addEventListener('change', async (event) => {
  const input = event.target;
  if (input.dataset.input === 'admin-role-filter') {
    state.adminRoleFilter = input.value;
    render();
  } else if (input.dataset.input === 'admin-status-filter') {
    state.adminStatusFilter = input.value;
    render();
  } else if (input.dataset.input === 'customer-status') {
    state.customerStatus = input.value;
    state.customerPage = 1;
    customerRequest = '';
    customerLoadedKey = '';
    render();
  } else if (input.dataset.input === 'deal-owner') {
    state.dealOwnerSelected = input.value;
    render();
  } else if (input.dataset.input === 'task-status-filter') {
    state.taskStatusFilter = input.value;
    state.tasksLoaded = false; taskRequest = ''; render();
  } else if (input.dataset.input === 'task-priority-filter') {
    state.taskPriorityFilter = input.value;
    state.tasksLoaded = false; taskRequest = ''; render();
  } else if (input.dataset.roleId) {
    try {
      await api(`/admin/users/${input.dataset.roleId}`, { method: 'PATCH', body: JSON.stringify({ role: input.value }) });
      state.users = (await api('/admin/users')).users;
      state.notice = 'Đã cập nhật vai trò.';
    } catch (error) { state.error = error.message; }
    render();
  } else if (input.dataset.taskStatus) {
    try {
      await api(`/tasks/${input.dataset.taskStatus}`, { method: 'PATCH', body: JSON.stringify({ status: input.value }) });
      state.notice = 'Đã cập nhật trạng thái Task.';
      state.tasksLoaded = false; taskRequest = '';
    } catch (error) {
      state.error = error.message;
    }
    render();
  }
});
root.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.form === 'login') {
      state.loginBusy = true; render();
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
      state.user = result.user;
      state.loginBusy = false;
      navigate(result.user.role === 'Admin' ? '/admin/users' : '/workspace', true);
    } else if (form.dataset.form === 'forgot') {
      const result = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) });
      state.notice = result.message;
      state.error = '';
      render();
    } else if (form.dataset.form === 'reset') {
      if (data.password !== data.confirmation) throw new Error('Mật khẩu xác nhận chưa khớp.');
      const token = new URLSearchParams(location.search).get('token');
      const result = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: data.password }) });
      state.notice = `${result.message} Đang chuyển về trang đăng nhập...`;
      state.error = '';
      render();
      setTimeout(() => navigate('/login', true), 1600);
    } else if (form.dataset.form === 'create-user') {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(data) });
      state.users = (await api('/admin/users')).users;
      state.userFormOpen = false;
      state.notice = 'Đã tạo tài khoản nhân viên.';
      state.error = '';
      render();
    } else if (form.dataset.form === 'lead') {
      const endpoint = state.leadEdit ? `/customers/leads/${state.leadEdit.id}` : '/customers/leads';
      await api(endpoint, { method: state.leadEdit ? 'PATCH' : 'POST', body: JSON.stringify(data) });
      state.leadFormOpen = false;
      state.leadEdit = null;
      state.error = '';
      customerRequest = '';
      customerLoadedKey = '';
      render();
    } else if (form.dataset.form === 'deal') {
      const payload = {
        ...data,
        accountId: Number(data.accountId),
        amount: data.amount === '' ? 0 : Number(data.amount),
        probability: data.probability === '' ? 0 : Number(data.probability),
      };
      if (payload.ownerUserId) payload.ownerUserId = Number(payload.ownerUserId);
      else delete payload.ownerUserId;
      const created = await api('/deals', { method: 'POST', body: JSON.stringify(payload) });
      state.dealFormOpen = false;
      // Cập nhật bảng ngay bằng bản ghi API vừa xác nhận tạo thành công.
      // Không phụ thuộc một GET tiếp theo để Deal mới xuất hiện trên Kanban.
      state.deals = [created.deal, ...state.deals.filter((deal) => String(deal.id) !== String(created.deal.id))];
      state.dealsLoaded = true;
      state.notice = 'Đã tạo Deal.';
      state.error = '';
      if (unmountDealBoard) { unmountDealBoard(); unmountDealBoard = null; }
      render();
    } else if (form.dataset.form === 'convert') {
      const result = await api(`/leads/${state.converting.id}/convert`, { method: 'POST', body: JSON.stringify({ accountName: data.accountName }) });
      state.converting = null;
      customerRequest = '';
      customerLoadedKey = '';
      navigate(`/customers/accounts/${result.accountId}`);
    } else if (form.dataset.form === 'task') {
      if (state.taskEdit && data.assigned_to === String(state.taskEdit.assigned_to)
        && !state.taskAssignees.some((user) => String(user.id) === data.assigned_to)) {
        delete data.assigned_to;
      }
      const endpoint = state.taskEdit ? `/tasks/${state.taskEdit.id}` : '/tasks';
      await api(endpoint, {
        method: state.taskEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(data),
      });
      state.taskFormOpen = false;
      state.taskEdit = null;
      state.tasksLoaded = false; taskRequest = '';
      state.error = ''; state.notice = 'Đã lưu Task.';
      render();
    } else if (form.dataset.form === 'appointment') {
      if (data.endsTime <= data.startsTime) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
      const appointment = {
        title: data.title,
        startsAt: `${data.date}T${data.startsTime}:00`,
        endsAt: `${data.date}T${data.endsTime}:00`,
        location: data.location,
        description: data.description,
      };
      if (data.recurrenceFrequency) {
        appointment.recurrenceFrequency = data.recurrenceFrequency;
        if (data.recurrenceUntil) appointment.recurrenceUntil = data.recurrenceUntil;
      }
      await api('/appointments', { method: 'POST', body: JSON.stringify(appointment) });
      state.appointmentFormOpen = false;
      state.appointmentsLoaded = false; appointmentRequest = '';
      state.error = ''; state.notice = 'Đã tạo lịch hẹn.';
      render();
    }
  } catch (error) {
    state.loginBusy = false;
    state.error = error.message;
    render();
  }
});
window.addEventListener('popstate', () => {
  if (unmountDealBoard) {
    unmountDealBoard();
    unmountDealBoard = null;
  }
  state.error = '';
  state.detail = null;
  render();
});
(async function start() {
  try {
    const data = await api('/auth/me');
    state.user = data.user;
  } catch (error) {
    if (!/Vui lòng đăng nhập|hết hạn|không hoạt động/i.test(error.message)) console.error(error);
    state.user = null;
  } finally {
    state.loading = false;
    render();
  }
})();

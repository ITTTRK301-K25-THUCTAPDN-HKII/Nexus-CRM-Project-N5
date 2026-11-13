const root = document.getElementById('app');
const state = {
  user: null,
  loading: true,
  error: '',
  notice: '',
  users: [],
  deals: [],
  dealsLoaded: false,
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
  customerItems: [],
  customerView: 'leads',
  customerSearch: '',
  customerStatus: '',
  customerPage: 1,
  customerTotal: 0,
  leadEdit: null,
  leadFormOpen: false,
  converting: null,
  accountName: '',
  detail: null,
  mailbox: [],
  loginBusy: false,
};
let customerRequest = '';
let customerDebounce;
let refreshRequest;
let unmountDealBoard = null;
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
  render();
}
const brand = '<div class="brand"><span class="brand-mark">N</span><span>NEXUS<span class="brand-light">CRM</span></span></div>';
function appSidebar(active = 'customers') {
  return `<aside class="sidebar"><a class="brand" href="/customers"><span class="brand-mark">N</span><span>NEXUS<span class="brand-light">CRM</span></span></a>
    <div class="nav-label">WORKSPACE</div>
    ${state.user?.role === 'Admin' ? '<a class="nav-item" href="/admin/users">♙ &nbsp; Quản lý người dùng</a>' : ''}
    <a class="nav-item ${active === 'customers' ? 'active' : ''}" href="/customers">♧ &nbsp; Khách hàng</a>
    <a class="nav-item ${active === 'deals' ? 'active' : ''}" href="/deals">▤ &nbsp; Cơ hội Deal</a>
    <a class="nav-item ${active === 'tasks' ? 'active' : ''}" href="/tasks">✓ &nbsp; Công việc</a>
    <a class="nav-item ${active === 'calendar' ? 'active' : ''}" href="/calendar">▦ &nbsp; Lịch làm việc</a>
    <a class="nav-item ${active === 'workspace' ? 'active' : ''}" href="/workspace">▦ &nbsp; Tổng quan</a>
    <div class="sidebar-bottom"><div class="profile-chip"><div class="avatar">${initials(state.user?.name)}</div><div><strong>${escapeHtml(state.user?.name)}</strong><span>${escapeHtml(state.user?.role)}</span></div></div>
    <button class="logout-button" data-action="logout">↪ &nbsp; Đăng xuất</button></div></aside>`;
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
    <header class="topbar"><div><span class="eyebrow">SALES PIPELINE</span><h1>Cơ hội kinh doanh</h1></div><div class="admin-avatar">${escapeHtml(state.user?.role || '')}</div></header>
    ${alertBox(state.error)}
    ${state.dealsLoaded && !state.deals.length ? '<p class="muted deal-empty">Chưa có Deal để hiển thị.</p>' : ''}
    <div id="deal-board-root"></div>
  </main></div>`;
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
      <div class="table-scroll"><table><thead><tr><th>CÔNG VIỆC</th><th>NGƯỜI PHỤ TRÁCH</th><th>HẠN HOÀN THÀNH</th><th>ƯU TIÊN</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>
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
  const filtered = state.users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes((state.adminSearch || '').toLowerCase()));
  return `<div class="app-shell">${appSidebar('admin')}<main class="admin-content"><header class="topbar"><div><span class="eyebrow">QUẢN TRỊ HỆ THỐNG</span><h1>Người dùng</h1></div><div class="admin-avatar">♙ Admin</div></header>
    <section class="page-intro"><div><h2>Đội ngũ của bạn</h2><p class="muted">Tạo tài khoản, phân quyền và quản lý trạng thái truy cập.</p></div><button class="primary-button compact" data-action="toggle-user-form">＋ Tạo người dùng</button></section>
    ${alertBox(state.error)}${alertBox(state.notice, 'success')}
    ${state.userFormOpen ? `<form class="create-user-form" data-form="create-user"><div class="form-heading"><div><strong>Tài khoản nhân viên mới</strong><span class="muted small">Mật khẩu ban đầu tối thiểu 8 ký tự.</span></div></div>
    <label>Họ và tên<input name="name" required minlength="2" maxlength="100"></label><label>Email<input name="email" type="email" required maxlength="254"></label>
    <label>Mật khẩu tạm thời<input name="password" type="password" required minlength="8" maxlength="128"></label><label>Vai trò<select name="role"><option>Sale</option><option>Manager</option><option>Admin</option></select></label>
    <div class="form-actions"><button type="button" class="secondary-button" data-action="cancel-user">Hủy</button><button type="submit" class="primary-button compact">Tạo tài khoản</button></div></form>` : ''}
    <section class="table-card"><div class="table-toolbar"><div class="table-title"><div class="icon-tile small-tile">♙</div><div><strong>Danh sách người dùng</strong><span>${state.users.length} tài khoản</span></div></div>
    <label class="search-wrap">⌕ <input aria-label="Tìm kiếm người dùng" placeholder="Tìm tên, email, vai trò..." value="${escapeHtml(state.adminSearch || '')}" data-input="admin-search"></label></div>
    <div class="table-scroll"><table><thead><tr><th>NGƯỜI DÙNG</th><th>VAI TRÒ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>
    ${filtered.map((user) => `<tr><td><div class="user-cell"><div class="avatar">${initials(user.name)}</div><div><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)}</span></div></div></td>
    <td><select class="role-select" data-role-id="${user.id}" ${user.id === state.user.id ? 'disabled' : ''}><option ${user.role === 'Admin' ? 'selected' : ''}>Admin</option><option ${user.role === 'Manager' ? 'selected' : ''}>Manager</option><option ${user.role === 'Sale' ? 'selected' : ''}>Sale</option></select></td>
    <td><span class="status-pill ${user.status === 'ACTIVE' ? 'status-active' : 'status-locked'}">${user.status === 'ACTIVE' ? 'Đang hoạt động' : user.status === 'LOCKED' ? 'Đã khóa' : 'Ngừng hoạt động'}</span></td>
    <td><div class="row-actions"><button class="text-button" data-action="toggle-user" data-id="${user.id}" ${user.id === state.user.id ? 'disabled' : ''}>${user.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</button><button class="text-button danger-text" data-action="delete-user" data-id="${user.id}" ${user.id === state.user.id ? 'disabled' : ''}>Xóa</button></div></td></tr>`).join('') || '<tr><td class="empty-row" colspan="4">Không tìm thấy người dùng phù hợp.</td></tr>'}
    </tbody></table></div></section><p class="page-footnote">Quyền truy cập được kiểm tra lại ở API trên mỗi yêu cầu.</p></main></div>`;
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
      : '<th>NGƯỜI LIÊN HỆ</th><th>DOANH NGHIỆP</th><th>THÔNG TIN</th><th>CHỨC VỤ</th>';
  const rows = items.map((item) => {
    if (view === 'leads') return `<tr><td><div class="user-cell"><div class="avatar">${initials(item.name)}</div><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.source || 'Chưa rõ nguồn')}</span></div></div></td>
      <td>${escapeHtml(item.company || '—')}</td><td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td>
      <td><span class="status-pill status-${String(item.status || 'NEW').toLowerCase()}">${escapeHtml(statusLabel(item.status))}</span></td><td><div class="row-actions">
      ${item.status === 'CONVERTED' ? `<a class="text-button" href="/customers/accounts/${item.accountId}">Xem Account</a>` : `<button class="text-button" data-action="edit-lead" data-id="${item.id}">Sửa</button>${item.status === 'QUALIFIED' ? `<button class="text-button" data-action="convert-lead" data-id="${item.id}">Chuyển đổi</button>` : ''}`}</div></td></tr>`;
    if (view === 'accounts') return `<tr><td><a class="customer-primary-link" href="/customers/accounts/${item.id}">${escapeHtml(item.name)}</a></td><td>${escapeHtml(item.industry || '—')}</td>
      <td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td><td><a class="text-button" href="/customers/accounts/${item.id}">Xem chi tiết</a></td></tr>`;
    return `<tr><td><strong>${escapeHtml(item.firstName)} ${escapeHtml(item.lastName)}</strong></td><td><a class="customer-primary-link" href="/customers/accounts/${item.accountId}">${escapeHtml(item.accountName)}</a></td>
      <td><div class="contact-info"><span>${escapeHtml(item.email || '—')}</span><span>${escapeHtml(item.phone || '—')}</span></div></td><td>${escapeHtml(item.jobTitle || '—')}</td></tr>`;
  }).join('');
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(state.customerTotal / pageSize));
  return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content customer-content"><header class="topbar"><div><span class="eyebrow">CUSTOMER RELATIONSHIP</span><h1>Khách hàng</h1></div><div class="admin-avatar">${items.length} bản ghi</div></header>
    <section class="page-intro"><div><h2>Danh sách khách hàng</h2><p class="muted">Theo dõi lead, doanh nghiệp và người liên hệ trong một nơi.</p></div>${view === 'leads' ? '<button class="primary-button compact" data-action="new-lead">＋ Thêm Lead</button>' : ''}</section>
    ${alertBox(state.error)}<nav class="customer-tabs" aria-label="Loại khách hàng">${viewTabs.map(([id, title, icon]) => `<button class="customer-tab ${view === id ? 'selected' : ''}" data-view="${id}">${icon} &nbsp; ${title}</button>`).join('')}</nav>
    <section class="table-card customer-table-card"><div class="table-toolbar"><div class="table-title"><div class="icon-tile small-tile">♧</div><div><strong>${viewTabs.find(([id]) => id === view)[1]}</strong><span>${state.customerTotal} kết quả</span></div></div>
    <div class="customer-filters">${view === 'leads' ? `<select aria-label="Lọc theo trạng thái" data-input="customer-status"><option value="">Tất cả trạng thái</option>${[['NEW','Mới'],['CONTACTED','Đã liên hệ'],['QUALIFIED','Tiềm năng'],['UNQUALIFIED','Không phù hợp'],['CONVERTED','Đã chuyển đổi']].map(([value,label]) => `<option value="${value}" ${state.customerStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}
    <label class="search-wrap">⌕ <input aria-label="Tìm khách hàng" placeholder="Tìm tên, email, công ty..." value="${escapeHtml(state.customerSearch)}" data-input="customer-search"></label></div></div>
    <div class="table-scroll"><table><thead><tr>${headings}</tr></thead><tbody>${rows || `<tr><td class="empty-row" colspan="5">${customerRequest ? 'Đang tải dữ liệu...' : 'Không tìm thấy dữ liệu phù hợp.'}</td></tr>`}</tbody></table></div>
    <div class="customer-pagination"><span>Hiển thị ${state.customerTotal ? (state.customerPage - 1) * pageSize + 1 : 0}–${Math.min(state.customerPage * pageSize, state.customerTotal)} trên ${state.customerTotal}</span>
    <div><button class="secondary-button pagination-button" data-action="page-prev" ${state.customerPage <= 1 ? 'disabled' : ''}>‹</button><span>Trang ${state.customerPage} / ${pageCount}</span><button class="secondary-button pagination-button" data-action="page-next" ${state.customerPage >= pageCount ? 'disabled' : ''}>›</button></div></div></section>
    ${state.leadFormOpen ? leadModal() : ''}${state.converting ? convertModal() : ''}</main></div>`;
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
function accountDetailPage() {
  if (!state.detail) return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content"><div class="loading-screen customer-loading">Đang tải hồ sơ khách hàng...</div></main></div>`;
  const { account, contacts, deals, activities } = state.detail;
  const summaries = [['EMAIL', account.email], ['ĐIỆN THOẠI', account.phone], ['WEBSITE', account.website], ['ĐỊA CHỈ', account.billingAddress], ['NHÂN VIÊN PHỤ TRÁCH', account.ownerName]];
  return `<div class="app-shell">${appSidebar('customers')}<main class="admin-content customer-content"><a class="back-link customer-back" href="/customers">← Danh sách khách hàng</a>${alertBox(state.error)}
    <header class="account-hero"><div class="account-mark">▣</div><div class="account-heading"><span class="eyebrow">CUSTOMER 360°</span><h1>${escapeHtml(account.name)}</h1><p>${escapeHtml(account.industry || 'Chưa phân loại ngành')}</p></div><span class="status-pill status-active">Khách hàng</span></header>
    <section class="account-summary-grid">${summaries.map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${escapeHtml(value || 'Chưa cập nhật')}</strong></article>`).join('')}</section>
    <section class="customer-detail-grid"><article class="table-card detail-section"><div class="detail-section-heading"><div class="icon-tile small-tile">♙</div><div><strong>Người liên hệ</strong><span>${contacts.length} liên hệ</span></div></div>
    ${contacts.length ? `<div class="related-list">${contacts.map((c) => `<div class="related-item"><div class="avatar">${initials(c.firstName)}</div><div class="related-main"><strong>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</strong><span>${escapeHtml(c.jobTitle || 'Chưa có chức vụ')}</span><small>${escapeHtml(c.email || c.phone || 'Chưa có thông tin liên hệ')}</small></div></div>`).join('')}</div>` : '<p class="empty-state">Chưa có người liên hệ.</p>'}</article>
    <article class="table-card detail-section"><div class="detail-section-heading"><div class="icon-tile small-tile">◇</div><div><strong>Cơ hội kinh doanh</strong><span>${deals.length} cơ hội gần đây</span></div></div>
    ${deals.length ? `<div class="related-list">${deals.map((d) => `<div class="related-item deal-item"><div class="related-main"><strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.stage)} · ${escapeHtml(d.probability)}%</span></div><strong>${escapeHtml(d.currency)} ${Number(d.amount).toLocaleString('vi-VN')}</strong></div>`).join('')}</div>` : '<p class="empty-state">Chưa có cơ hội kinh doanh.</p>'}</article>
    <article class="table-card detail-section activity-section"><div class="detail-section-heading"><div class="icon-tile small-tile">◷</div><div><strong>Lịch sử tương tác</strong><span>${activities.length} hoạt động gần đây</span></div></div>
    ${activities.length ? `<div class="timeline">${activities.map((a) => `<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${escapeHtml(a.subject)}</strong><span>${escapeHtml(a.type)} · ${escapeHtml(new Date(a.occurredAt).toLocaleString('vi-VN'))}</span>${a.details ? `<p>${escapeHtml(a.details)}</p>` : ''}</div></div>`).join('')}</div>` : '<p class="empty-state">Chưa có lịch sử tương tác.</p>'}</article></section></main></div>`;
}
async function loadCustomers() {
  const key = `${state.customerView}|${state.customerPage}|${state.customerSearch}|${state.customerStatus}`;
  if (customerRequest === key) return;
  customerRequest = key;
  try {
    const params = new URLSearchParams({ page: String(state.customerPage), pageSize: '10', search: state.customerSearch });
    if (state.customerView === 'leads' && state.customerStatus) params.set('status', state.customerStatus);
    const data = await api(`/customers/${state.customerView}?${params}`);
    if (customerRequest !== key) return;
    state.customerItems = data.items;
    state.customerTotal = data.total;
    state.error = '';
  } catch (error) {
    if (customerRequest === key) state.error = error.message;
  }
  if (route() === '/customers') render();
}
async function loadDetail(id) {
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
    root.innerHTML = dealsPage();
    if (state.dealsLoaded && window.mountDealBoard) {
      unmountDealBoard = window.mountDealBoard(document.getElementById('deal-board-root'), {
        deals: state.deals,
        onStageChange: updateDealStage,
        onHistory: async (deal) => (await api(`/deals/${encodeURIComponent(deal.id)}/history`)).history,
      });
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
      if (!target || !confirm(`Xóa tài khoản ${target.email}?`)) break;
      try {
        await api(`/admin/users/${id}`, { method: 'DELETE' });
        state.notice = `Đã xóa ${target.email}.`;
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
    case 'page-prev':
      if (state.customerPage > 1) { state.customerPage -= 1; customerRequest = ''; render(); }
      break;
    case 'page-next':
      if (state.customerPage < Math.ceil(state.customerTotal / 10)) { state.customerPage += 1; customerRequest = ''; render(); }
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
    clearTimeout(customerDebounce);
    customerDebounce = setTimeout(() => { render(); void loadCustomers(); }, 250);
  }
});
root.addEventListener('change', async (event) => {
  const input = event.target;
  if (input.dataset.input === 'customer-status') {
    state.customerStatus = input.value;
    state.customerPage = 1;
    customerRequest = '';
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
    } catch (error) { state.error = error.message; }
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
      render();
    } else if (form.dataset.form === 'convert') {
      const result = await api(`/leads/${state.converting.id}/convert`, { method: 'POST', body: JSON.stringify({ accountName: data.accountName }) });
      state.converting = null;
      customerRequest = '';
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

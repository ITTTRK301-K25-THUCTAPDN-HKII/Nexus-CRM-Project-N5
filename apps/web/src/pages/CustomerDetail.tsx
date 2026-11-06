import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, ContactRound, Handshake, Mail, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../api';
import { CustomerSidebar } from './Customers';

interface AccountDetail {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string | null;
  ownerName: string;
  createdAt: string;
}

interface RelatedContact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
}

interface RelatedDeal {
  id: number;
  name: string;
  amount: number;
  currency: string;
  stage: string;
  probability: number;
  expectedCloseDate: string | null;
}

interface RelatedActivity {
  id: number;
  type: string;
  subject: string;
  details: string | null;
  occurredAt: string;
}

interface DetailResponse {
  account: AccountDetail;
  contacts: RelatedContact[];
  deals: RelatedDeal[];
  activities: RelatedActivity[];
}

export function CustomerDetail() {
  const { id } = useParams();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<DetailResponse>(`/customers/accounts/${id}`)
      .then(({ data }) => { if (active) setDetail(data); })
      .catch((requestError: unknown) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  return (
    <CustomerSidebar>
      <main className="admin-content customer-content">
        <Link className="back-link customer-back" to="/customers"><ArrowLeft size={16} /> Danh sách khách hàng</Link>
        {error && <div className="alert error customer-alert" role="alert">{error}</div>}
        {loading && <div className="loading-screen customer-loading">Đang tải hồ sơ khách hàng...</div>}
        {!loading && detail && <>
          <header className="account-hero">
            <div className="account-mark"><Building2 size={26} /></div>
            <div className="account-heading"><span className="eyebrow">CUSTOMER 360°</span><h1>{detail.account.name}</h1><p>{detail.account.industry || 'Chưa phân loại ngành'}</p></div>
            <span className="status-pill status-active">Khách hàng</span>
          </header>

          <section className="account-summary-grid">
            <article className="summary-card"><span>EMAIL</span><strong><Mail size={15} />{detail.account.email || 'Chưa cập nhật'}</strong></article>
            <article className="summary-card"><span>ĐIỆN THOẠI</span><strong><Phone size={15} />{detail.account.phone || 'Chưa cập nhật'}</strong></article>
            <article className="summary-card"><span>WEBSITE</span><strong>{detail.account.website || 'Chưa cập nhật'}</strong></article>
            <article className="summary-card"><span>ĐỊA CHỈ</span><strong>{detail.account.billingAddress || 'Chưa cập nhật'}</strong></article>
            <article className="summary-card"><span>NHÂN VIÊN PHỤ TRÁCH</span><strong>{detail.account.ownerName}</strong></article>
          </section>

          <section className="customer-detail-grid">
            <article className="table-card detail-section">
              <div className="detail-section-heading"><div className="icon-tile small-tile"><ContactRound size={17} /></div><div><strong>Người liên hệ</strong><span>{detail.contacts.length} liên hệ</span></div></div>
              {detail.contacts.length ? <div className="related-list">{detail.contacts.map((contact) => <div className="related-item" key={contact.id}><div className="avatar">{contact.firstName.slice(0, 1).toUpperCase()}</div><div className="related-main"><strong>{contact.firstName} {contact.lastName}</strong><span>{contact.jobTitle || 'Chưa có chức vụ'}</span><small>{contact.email || contact.phone || 'Chưa có thông tin liên hệ'}</small></div></div>)}</div> : <p className="empty-state">Chưa có người liên hệ.</p>}
            </article>

            <article className="table-card detail-section">
              <div className="detail-section-heading"><div className="icon-tile small-tile"><Handshake size={17} /></div><div><strong>Cơ hội kinh doanh</strong><span>{detail.deals.length} cơ hội gần đây</span></div></div>
              {detail.deals.length ? <div className="related-list">{detail.deals.map((deal) => <div className="related-item deal-item" key={deal.id}><div className="related-main"><strong>{deal.name}</strong><span>{deal.stage} · {deal.probability}%</span></div><strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: deal.currency }).format(deal.amount)}</strong></div>)}</div> : <p className="empty-state">Chưa có cơ hội kinh doanh.</p>}
            </article>

            <article className="table-card detail-section activity-section">
              <div className="detail-section-heading"><div className="icon-tile small-tile"><CalendarDays size={17} /></div><div><strong>Lịch sử tương tác</strong><span>{detail.activities.length} hoạt động gần đây</span></div></div>
              {detail.activities.length ? <div className="timeline">{detail.activities.map((activity) => <div className="timeline-item" key={activity.id}><span className="timeline-dot" /><div><strong>{activity.subject}</strong><span>{activity.type} · {new Date(activity.occurredAt).toLocaleString('vi-VN')}</span>{activity.details && <p>{activity.details}</p>}</div></div>)}</div> : <p className="empty-state">Chưa có lịch sử tương tác.</p>}
            </article>
          </section>
        </>}
        {!loading && !detail && !error && <div className="empty-state">Không tìm thấy hồ sơ khách hàng.</div>}
      </main>
    </CustomerSidebar>
  );
}

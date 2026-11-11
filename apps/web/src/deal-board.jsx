import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';

const COLUMNS = [
  { id: 'LEAD', title: 'Lead' },
  { id: 'PROPOSAL', title: 'Đề xuất' },
  { id: 'NEGOTIATION', title: 'Thương lượng' },
  { id: 'WON', title: 'Thành công' },
  { id: 'LOST', title: 'Thất bại' },
];

// Quy đổi tên stage cũ trong database về cột LEAD trên màn hình.
function getBoardStage(stage) {
  return ['PROSPECTING', 'QUALIFICATION', 'LEAD'].includes(stage) ? 'LEAD' : stage;
}

// Mỗi card tự đăng ký khả năng kéo, còn nội dung giữ theo component card hiện tại.
function DraggableDeal({ deal, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(deal.id) });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <div ref={setNodeRef} style={style} className={isDragging ? 'deal-dragging' : ''} {...listeners} {...attributes}>{children}</div>;
}

// Mỗi cột nhận card được thả vào và cung cấp stage đích cho DndContext.
function DealColumn({ column, deals, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return <section ref={setNodeRef} className={`deal-column ${isOver ? 'deal-column-over' : ''}`} aria-label={`${column.title}: ${deals.length} Deal`}>
    <header className="deal-column-header"><h2>{column.title}</h2><span>{deals.length}</span></header>
    <div className="deal-column-cards">{children}</div>
  </section>;
}

// Component board quản lý dữ liệu cục bộ để card đổi cột ngay khi thả.
function DealBoard({ deals: initialDeals, onStageChange }) {
  const [deals, setDeals] = useState(initialDeals);
  const [toast, setToast] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [savingMove, setSavingMove] = useState(false);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Đồng bộ lại danh sách khi app tải lại dữ liệu từ API.
  useEffect(() => setDeals(initialDeals), [initialDeals]);

  // Cập nhật card ngay, gửi dữ liệu lên API và rollback nếu server từ chối.
  async function saveStageChange(deal, nextStage, details = {}) {
    const oldDeals = deals;
    const optimisticDeals = deals.map((item) => item.id === deal.id ? {
      ...item,
      stage: nextStage,
      ...(details.closedAmount ? { closedAmount: Number(details.closedAmount), closedDate: details.closedDate } : {}),
      ...(details.lostReason ? { lostReason: details.lostReason } : {}),
    } : item);
    setDeals(optimisticDeals);
    setToast(null);
    try {
      const result = await onStageChange(deal, nextStage, details);
      setDeals((current) => current.map((item) => item.id === deal.id ? {
        ...item,
        stage: result.stage,
        version: result.version,
        closedAmount: result.closedAmount ?? item.closedAmount,
        closedDate: result.closedDate ?? item.closedDate,
        lostReason: result.lostReason ?? item.lostReason,
      } : item));
    } catch (error) {
      setDeals(oldDeals);
      // Toast tự biến mất sau vài giây; card đã được trả về cột cũ ở trên.
      setToast({ id: Date.now(), text: error.message || 'Không thể cập nhật trạng thái Deal.' });
    }
  }

  // LOST/WON cần xác nhận thông tin nghiệp vụ trước khi gọi hàm cập nhật stage.
  async function confirmMove(event) {
    event.preventDefault();
    if (!pendingMove || savingMove) return;
    const form = new FormData(event.currentTarget);
    const details = pendingMove.stage === 'LOST'
      ? { lostReason: String(form.get('lostReason') || '').trim() }
      : { closedAmount: String(form.get('closedAmount') || '').trim(), closedDate: String(form.get('closedDate') || '') };
    if (pendingMove.stage === 'LOST' && !details.lostReason) return;
    if (pendingMove.stage === 'WON' && (!Number.isFinite(Number(details.closedAmount)) || Number(details.closedAmount) <= 0 || !details.closedDate)) return;
    const move = pendingMove;
    setPendingMove(null);
    setSavingMove(true);
    await saveStageChange(move.deal, move.stage, details);
    setSavingMove(false);
  }

  // Khi thả vào cột đóng Deal, mở form xác nhận thay vì lưu stage ngay.
  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || pendingMove || savingMove) return;
    const deal = deals.find((item) => String(item.id) === String(active.id));
    const nextStage = String(over.id);
    if (!deal || !COLUMNS.some((column) => column.id === nextStage)) return;
    if (getBoardStage(deal.stage) === nextStage) return;
    if (nextStage === 'LOST' || nextStage === 'WON') {
      const today = new Date();
      const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      setPendingMove({ deal, stage: nextStage, today: localDate });
      return;
    }
    void saveStageChange(deal, nextStage);
  }

  // Tự đóng Toast cũ để thông báo lỗi không che bảng lâu.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    {toast && <div key={toast.id} className="deal-toast" role="alert" aria-live="assertive"><span className="deal-toast-mark">!</span><span>{toast.text}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button></div>}
    {pendingMove && <div className="deal-modal-backdrop"><form className="deal-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="deal-modal-title" onSubmit={confirmMove}>
      <button type="button" className="deal-modal-close" aria-label="Đóng" onClick={() => setPendingMove(null)}>×</button>
      <span className="eyebrow">XÁC NHẬN CẬP NHẬT DEAL</span>
      <h2 id="deal-modal-title">{pendingMove.stage === 'LOST' ? 'Lý do thất bại' : 'Xác nhận hợp đồng'}</h2>
      <p className="muted">{pendingMove.deal.name}</p>
      {pendingMove.stage === 'LOST' ? <label className="deal-modal-field">Lý do LOST <textarea name="lostReason" rows="4" maxLength="1000" required autoFocus placeholder="Nhập lý do Deal thất bại..." /></label> : <>
        <p className="deal-modal-hint">Giá trị dự kiến: {Number(pendingMove.deal.amount || 0).toLocaleString('vi-VN')} {pendingMove.deal.currency || 'VND'}</p>
        <label className="deal-modal-field">Giá trị hợp đồng thực tế<input name="closedAmount" type="number" min="0.01" step="0.01" defaultValue={pendingMove.deal.amount || ''} required autoFocus /></label>
        <label className="deal-modal-field">Ngày chốt thực tế<input name="closedDate" type="date" defaultValue={pendingMove.today} required /></label>
      </>}
      <div className="deal-modal-actions"><button type="button" className="secondary-button" onClick={() => setPendingMove(null)}>Hủy</button><button type="submit" className="primary-button compact">{pendingMove.stage === 'LOST' ? 'Xác nhận LOST' : 'Xác nhận WON'}</button></div>
    </form></div>}
    <div className="deal-board" aria-label="Bảng Deal gồm năm trạng thái">
      {COLUMNS.map((column) => {
        const columnDeals = deals.filter((deal) => getBoardStage(deal.stage) === column.id);
        return <DealColumn key={column.id} column={column} deals={columnDeals}>
          {columnDeals.map((deal) => <DraggableDeal key={deal.id} deal={deal}>
            <article className="deal-card">
              <div className="deal-card-heading"><strong>{deal.name}</strong><span className="deal-id">#{deal.id}</span></div>
              <div className="deal-customer"><span className="deal-field-label">KHÁCH HÀNG</span><span>{deal.accountName || 'Chưa liên kết khách hàng'}</span></div>
              <div className="deal-amount"><span className="deal-field-label">{deal.stage === 'WON' ? 'GIÁ TRỊ HỢP ĐỒNG' : 'GIÁ TRỊ DEAL'}</span><strong>{Number(deal.closedAmount ?? deal.amount ?? 0).toLocaleString('vi-VN')} {deal.currency || 'VND'}</strong></div>
              <span className={`deal-date-badge ${deal.expectedCloseDate ? 'date-upcoming' : 'date-empty'}`}>{deal.expectedCloseDate ? `Chốt: ${new Date(`${String(deal.expectedCloseDate).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN')}` : 'Chưa có ngày chốt'}</span>
              <div className="deal-owner"><span className="avatar deal-avatar" aria-hidden="true">{(deal.ownerName || '?').split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()}</span><span><small>Phụ trách</small><strong>{deal.ownerName || 'Chưa phân công'}</strong></span></div>
            </article>
          </DraggableDeal>)}
        </DealColumn>;
      })}
    </div>
  </DndContext>;
}

// Flask app.js gọi hàm này để mount React vào trang Deal hiện có.
window.mountDealBoard = (element, props) => {
  const reactRoot = createRoot(element);
  reactRoot.render(<DealBoard {...props} />);
  return () => reactRoot.unmount();
};

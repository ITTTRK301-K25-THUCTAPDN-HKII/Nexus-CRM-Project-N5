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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Đồng bộ lại danh sách khi app tải lại dữ liệu từ API.
  useEffect(() => setDeals(initialDeals), [initialDeals]);

  // Xử lý lúc thả: cập nhật UI trước, gọi API sau; nếu lỗi thì phục hồi trạng thái cũ.
  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const deal = deals.find((item) => String(item.id) === String(active.id));
    const nextStage = String(over.id);
    if (!deal || !COLUMNS.some((column) => column.id === nextStage)) return;
    const previousStage = getBoardStage(deal.stage);
    if (previousStage === nextStage) return;

    const oldDeals = deals;
    const optimisticDeals = deals.map((item) => item.id === deal.id ? { ...item, stage: nextStage } : item);
    setDeals(optimisticDeals);
    setToast(null);
    try {
      await onStageChange(deal, nextStage);
    } catch (error) {
      setDeals(oldDeals);
      // Toast tự biến mất sau vài giây; card đã được trả về cột cũ ở trên.
      setToast({ id: Date.now(), text: error.message || 'Không thể cập nhật trạng thái Deal.' });
    }
  }

  // Tự đóng Toast cũ để thông báo lỗi không che bảng lâu.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    {toast && <div key={toast.id} className="deal-toast" role="alert" aria-live="assertive"><span className="deal-toast-mark">!</span><span>{toast.text}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setToast(null)}>×</button></div>}
    <div className="deal-board" aria-label="Bảng Deal gồm năm trạng thái">
      {COLUMNS.map((column) => {
        const columnDeals = deals.filter((deal) => getBoardStage(deal.stage) === column.id);
        return <DealColumn key={column.id} column={column} deals={columnDeals}>
          {columnDeals.map((deal) => <DraggableDeal key={deal.id} deal={deal}>
            <article className="deal-card">
              <div className="deal-card-heading"><strong>{deal.name}</strong><span className="deal-id">#{deal.id}</span></div>
              <div className="deal-customer"><span className="deal-field-label">KHÁCH HÀNG</span><span>{deal.accountName || 'Chưa liên kết khách hàng'}</span></div>
              <div className="deal-amount"><span className="deal-field-label">GIÁ TRỊ DEAL</span><strong>{Number(deal.amount || 0).toLocaleString('vi-VN')} {deal.currency || 'VND'}</strong></div>
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

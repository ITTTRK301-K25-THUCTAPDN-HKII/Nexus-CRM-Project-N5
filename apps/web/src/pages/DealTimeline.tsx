import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import { api, getErrorMessage } from '../api';

interface Deal {
  id: number;
  name: string;
  amount: number;
  currency: string;
  stage: string;
  probability: number;
}

interface HistoryEntry {
  id: number;
  previousStage: string | null;
  newStage: string | null;
  previousAmount: number | string | null;
  newAmount: number | string | null;
  note: string | null;
  changedAt: string;
  changedByName: string | null;
}

interface DealHistoryResponse {
  deal: Pick<Deal, 'id' | 'name'>;
  history: HistoryEntry[];
}

const stageLabels: Record<string, string> = {
  PROSPECTING: 'Tìm kiếm khách hàng',
  QUALIFICATION: 'Đánh giá cơ hội',
  PROPOSAL: 'Đề xuất giải pháp',
  NEGOTIATION: 'Đàm phán',
  WON: 'Thành công',
  LOST: 'Thất bại',
};

function formatAmount(value: number | string | null, currency: string): string {
  if (value === null) return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amount);
}

function describeHistory(entry: HistoryEntry, currency: string): string {
  const changes: string[] = [];
  if (entry.previousStage !== null || entry.newStage !== null) {
    if (entry.previousStage === null) {
      changes.push(`Deal được tạo ở giai đoạn ${stageLabels[entry.newStage ?? ''] ?? entry.newStage}`);
    } else if (entry.newStage === null) {
      changes.push(`Rời giai đoạn ${stageLabels[entry.previousStage] ?? entry.previousStage}`);
    } else {
      changes.push(`${stageLabels[entry.previousStage] ?? entry.previousStage} → ${stageLabels[entry.newStage] ?? entry.newStage}`);
    }
  }
  if (entry.previousAmount !== null || entry.newAmount !== null) {
    changes.push(entry.previousAmount === null
      ? `Giá trị ban đầu ${formatAmount(entry.newAmount, currency)}`
      : `${formatAmount(entry.previousAmount, currency)} → ${formatAmount(entry.newAmount, currency)}`);
  }
  return changes.join(' · ') || entry.note || 'Thông tin Deal được cập nhật';
}

export function DealTimeline({ deal }: { deal: Deal }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function toggleTimeline() {
    const shouldExpand = !expanded;
    setExpanded(shouldExpand);
    if (!shouldExpand || history !== null || loading) return;

    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<DealHistoryResponse>(`/deals/${deal.id}/history`);
      setHistory(data.history);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setExpanded(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="related-item deal-history-card">
      <div className="deal-history-summary">
        <div className="related-main">
          <strong>{deal.name}</strong>
          <span>{stageLabels[deal.stage] ?? deal.stage} · {deal.probability}%</span>
        </div>
        <strong className="deal-amount">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: deal.currency }).format(deal.amount)}</strong>
      </div>
      <button
        className="deal-history-toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => void toggleTimeline()}
      >
        <Clock3 size={14} />
        {expanded ? 'Ẩn lịch sử' : 'Xem lịch sử'}
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {error && <p className="deal-history-error" role="alert">{error}</p>}
      {expanded && loading && <p className="deal-history-empty">Đang tải lịch sử dịch chuyển...</p>}
      {expanded && history && (
        <div className="deal-history-timeline">
          {history.length === 0 && <p className="deal-history-empty">Chưa có lịch sử dịch chuyển Deal.</p>}
          {history.map((entry) => (
            <div className="deal-history-event" key={entry.id}>
              <span className="deal-history-dot" />
              <div>
                <strong>{describeHistory(entry, deal.currency)}</strong>
                <span>{new Date(entry.changedAt).toLocaleString('vi-VN')}{entry.changedByName ? ` · ${entry.changedByName}` : ''}</span>
                {entry.note && <p>{entry.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

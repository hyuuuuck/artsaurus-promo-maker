import { QrCode } from "lucide-react";

type QrPurposePanelProps = {
  qrTargetType: string;
  qrTargetUrl: string;
  onChange: (patch: { qrTargetType?: string; qrTargetUrl?: string }) => void;
};

export function QrPurposePanel({ qrTargetType, qrTargetUrl, onChange }: QrPurposePanelProps) {
  return (
    <div className="ai-poster-panel">
      <div className="ai-poster-panel-head">
        <QrCode size={18} />
        <h2>QR 목적</h2>
      </div>
      <label className="ai-field">
        <span>연결 대상</span>
        <select value={qrTargetType} onChange={(event) => onChange({ qrTargetType: event.target.value })}>
          <option value="ticket_link">예매 링크</option>
          <option value="pamphlet_link">팜플렛 링크</option>
          <option value="checkin_link">체크인 링크</option>
          <option value="artist_profile_link">아티스트 프로필</option>
          <option value="custom_url">직접 입력</option>
        </select>
      </label>
      <label className="ai-field">
        <span>직접 입력 URL</span>
        <input value={qrTargetUrl} onChange={(event) => onChange({ qrTargetUrl: event.target.value })} placeholder="https://" />
      </label>
    </div>
  );
}

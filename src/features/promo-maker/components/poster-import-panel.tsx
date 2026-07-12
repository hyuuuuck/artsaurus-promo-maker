import type { Dispatch, SetStateAction } from "react";
import { ImageIcon, Loader2, Palette } from "lucide-react";
import { posterCanvasPresets, type PosterImportSettings } from "./poster-import-settings";

type PosterImportPanelProps = {
  busy: string | null;
  settings: PosterImportSettings;
  onSettingsChange: Dispatch<SetStateAction<PosterImportSettings>>;
  onFile: (file: File | null) => void | Promise<void>;
};

export function PosterImportPanel({ busy, settings, onSettingsChange, onFile }: PosterImportPanelProps) {
  return (
    <div className="ai-poster-panel ai-poster-import-panel">
      <div className="ai-poster-panel-head">
        <Palette size={18} />
        <h2>포스터 가져오기</h2>
      </div>
      <div className="ai-field">
        <span>시작 캔버스</span>
        <div className="segmented-control compact">
          {posterCanvasPresets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={settings.preset === preset.value ? "active" : ""}
              onClick={() =>
                onSettingsChange((current) => ({
                  ...current,
                  preset: preset.value,
                  customWidth: preset.value === "custom" ? current.customWidth : preset.width,
                  customHeight: preset.value === "custom" ? current.customHeight : preset.height,
                }))
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {settings.preset === "custom" ? (
        <div className="ai-field-grid">
          <PosterImportNumberField
            label="가로 px"
            value={settings.customWidth}
            onChange={(value) => onSettingsChange((current) => ({ ...current, customWidth: clampPosterImportValue(value, 240, 3200) }))}
          />
          <PosterImportNumberField
            label="세로 px"
            value={settings.customHeight}
            onChange={(value) => onSettingsChange((current) => ({ ...current, customHeight: clampPosterImportValue(value, 240, 3200) }))}
          />
        </div>
      ) : null}
      <div className="ai-field">
        <span>포스터 배치</span>
        <div className="segmented-control compact">
          {(["contain", "cover"] as const).map((fit) => (
            <button key={fit} type="button" className={settings.fit === fit ? "active" : ""} onClick={() => onSettingsChange((current) => ({ ...current, fit }))}>
              {fit === "contain" ? "전체 보이기" : "꽉 채우기"}
            </button>
          ))}
        </div>
      </div>
      <label className="ai-upload-box ai-poster-import-box">
        {busy === "poster-import" ? <Loader2 className="spin-icon" size={28} /> : <ImageIcon size={30} />}
        <strong>기존 포스터 업로드</strong>
        <span>포스터는 잠그고, 텍스트/QR/도형을 위에 추가해서 편집</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={Boolean(busy)}
          onChange={(event) => {
            void onFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </div>
  );
}

function PosterImportNumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="ai-field">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function clampPosterImportValue(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

import { Loader2, Upload } from "lucide-react";
import type { ReactNode } from "react";

type PosterUploadButtonProps = {
  busy: string | null;
  primary?: boolean;
  children: ReactNode;
  onFile: (file: File | null) => void | Promise<void>;
};

export function PosterUploadButton({ busy, primary = false, children, onFile }: PosterUploadButtonProps) {
  const className = [primary ? "ai-file-button ai-file-button-primary" : "ai-file-button", busy ? "is-disabled" : ""].filter(Boolean).join(" ");

  return (
    <label className={className}>
      {busy === "poster-import" ? <Loader2 className="spin-icon" size={16} /> : <Upload size={16} />}
      {children}
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
  );
}

"use client";

import { useEffect } from "react";

export function DocumentViewerModal({
  url,
  label,
  isPdf = false,
  onClose,
}: {
  url: string;
  label: string;
  isPdf?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${label} preview`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
      onClick={onClose}
    >
      <div className="relative flex max-h-full max-w-[1100px] flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-on-primary">{label}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill bg-surface px-3 py-1 text-[13px] text-ink hover:bg-bg-tint"
            aria-label="Close"
          >
            Close ✕
          </button>
        </div>
        {isPdf ? (
          <iframe
            src={url}
            title={`${label} preview`}
            className="h-[80vh] w-[85vw] max-w-[900px] rounded-lg bg-surface"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className="max-h-[80vh] w-auto rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}

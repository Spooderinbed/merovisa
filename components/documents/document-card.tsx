"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DocumentViewerModal } from "./document-viewer-modal";
import type { DocumentKindMeta } from "@/lib/documents/types";

interface DocumentData {
  id: string;
  originalName: string;
  fileSize: number;
}

export function DocumentCard({
  meta,
  initial,
}: {
  meta: DocumentKindMeta;
  initial: DocumentData | null;
}) {
  const [doc, setDoc] = useState<DocumentData | null>(initial);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setNotification(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", meta.kind);
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        setNotification(err.error ?? "Upload failed");
        return;
      }
      const data = await res.json();
      setDoc({
        id: data.id,
        originalName: file.name,
        fileSize: file.size,
      });
      setNotification("Uploaded");
    } catch {
      setNotification("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setNotification("Couldn't delete — please try again");
      return;
    }
    setDoc(null);
    setNotification(null);
  };

  const handleView = async () => {
    if (!doc) return;
    setFetchingUrl(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/view`);
      if (!res.ok) {
        setNotification("Could not load document");
        return;
      }
      const data = (await res.json()) as { url: string };
      setViewUrl(data.url);
      setViewerOpen(true);
    } catch {
      setNotification("Could not load document");
    } finally {
      setFetchingUrl(false);
    }
  };

  const fileSize = doc ? `${(doc.fileSize / 1024).toFixed(0)} KB` : null;

  return (
    <>
      <div
        className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors duration-fast ease-calm ${
          doc ? "border-primary bg-surface" : "border-line bg-bg-tint"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] text-ink">{meta.label}</span>
          {doc && (
            <span className="rounded-pill bg-strong/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-strong">
              Uploaded
            </span>
          )}
        </div>

        {doc && (
          <p className="truncate font-mono text-[12px] text-ink-faint">
            {doc.originalName} · {fileSize}
          </p>
        )}

        {notification && <p className="text-[13px] text-ink-soft">{notification}</p>}

        <div className="mt-1 flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant={doc ? "ghost" : "primary"}
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            loadingLabel="Uploading"
          >
            {doc ? "Re-upload" : "Upload"}
          </Button>
          {doc && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleView}
              loading={fetchingUrl}
              loadingLabel="Loading"
            >
              View
            </Button>
          )}
          {doc && (
            <Button size="sm" variant="quiet" onClick={handleDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {doc && viewerOpen && viewUrl && (
        <DocumentViewerModal
          url={viewUrl}
          label={meta.label}
          isPdf={/\.pdf$/i.test(doc.originalName)}
          onClose={() => { setViewerOpen(false); setViewUrl(null); }}
        />
      )}
    </>
  );
}

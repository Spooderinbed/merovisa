"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentKindMeta } from "@/lib/documents/types";

interface DocumentData {
  id: string;
  status: "extracted" | "failed" | "stored";
  originalName: string;
  fileSize: number;
  extractedData: Record<string, unknown> | null;
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
        status: data.status,
        originalName: file.name,
        fileSize: file.size,
        extractedData: data.extracted_data,
      });
      if (data.status === "extracted") {
        setNotification("Data extracted and saved to your profile");
      } else if (data.status === "failed") {
        setNotification("Could not read this document — try a clearer photo");
      } else {
        setNotification("Document stored");
      }
    } catch {
      setNotification("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDoc(null);
    setNotification(null);
  };

  const fileSize = doc ? `${(doc.fileSize / 1024).toFixed(0)} KB` : null;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors duration-150 ease-calm ${
        doc ? "border-primary bg-surface" : "border-line bg-bg-tint"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] text-ink">{meta.label}</span>
        {doc && (
          <span
            className={`rounded-pill px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
              doc.status === "extracted"
                ? "bg-strong/10 text-strong"
                : doc.status === "failed"
                  ? "bg-reach/10 text-reach"
                  : "bg-ink-faint/10 text-ink-faint"
            }`}
          >
            {doc.status === "extracted" ? "Extracted" : doc.status === "failed" ? "Failed" : "Stored"}
          </span>
        )}
      </div>

      {doc && (
        <p className="truncate font-mono text-[12px] text-ink-faint">
          {doc.originalName} · {fileSize}
        </p>
      )}

      {doc?.status === "extracted" && doc.extractedData && (
        <p className="text-[13px] text-ink-soft">{formatExtracted(meta.kind, doc.extractedData)}</p>
      )}

      {notification && <p className="text-[13px] text-ink-soft">{notification}</p>}

      <div className="mt-1 flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
          disabled={uploading}
        >
          {uploading ? "Uploading…" : doc ? "Re-upload" : "Upload"}
        </Button>
        {doc && (
          <Button size="sm" variant="quiet" onClick={handleDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function formatExtracted(kind: string, data: Record<string, unknown>): string {
  switch (kind) {
    case "ielts":
    case "pte":
    case "toefl":
      return `Overall: ${data.overall} | L: ${data.listening} | R: ${data.reading} | W: ${data.writing} | S: ${data.speaking}`;
    case "passport":
      return `${data.name ?? ""}`;
    case "bachelors-transcript":
      return `${data.institution ?? ""} · ${data.gradePercent ?? ""}%`;
    case "bank-statement":
      return `Balance: ${data.currency ?? ""} ${Number(data.balance ?? 0).toLocaleString()}`;
    case "employment-letter":
      return `${data.title ?? ""} · ${data.years ?? ""} years`;
    case "salary-slip":
      return `${data.employer ?? ""} · ${data.amount ?? ""}`;
    case "offer-letter":
      return `${data.university ?? ""} · ${data.program ?? ""}`;
    default:
      return "";
  }
}

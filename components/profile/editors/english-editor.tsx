"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface EnglishInitial {
  test?: "ielts" | "pte" | "toefl";
  overall?: number;
  listening?: number;
  reading?: number;
  writing?: number;
  speaking?: number;
  reportUploaded?: boolean;
}

const TESTS = [
  { value: "ielts", label: "IELTS" },
  { value: "pte", label: "PTE" },
  { value: "toefl", label: "TOEFL" },
];

export function EnglishEditor({ initial }: { initial: EnglishInitial }) {
  const [test, setTest] = useState<string>(initial.test ?? "");
  const [overall, setOverall] = useState<string>(initial.overall?.toString() ?? "");
  const [listening, setListening] = useState<string>(initial.listening?.toString() ?? "");
  const [reading, setReading] = useState<string>(initial.reading?.toString() ?? "");
  const [writing, setWriting] = useState<string>(initial.writing?.toString() ?? "");
  const [speaking, setSpeaking] = useState<string>(initial.speaking?.toString() ?? "");
  const [reportUploaded, setReportUploaded] = useState<boolean>(initial.reportUploaded ?? false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("saving");
    const patch: Record<string, unknown> = {};
    if (test) patch.test = test;
    if (overall) patch.overall = Number(overall);
    if (listening) patch.listening = Number(listening);
    if (reading) patch.reading = Number(reading);
    if (writing) patch.writing = Number(writing);
    if (speaking) patch.speaking = Number(speaking);
    patch.reportUploaded = reportUploaded;
    const res = await fetch("/api/profile/section", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "english", patch }),
    });
    setStatus(res.ok ? "saved" : "error");
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ee-test" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Test</label>
        <select id="ee-test" value={test} onChange={(e) => setTest(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary">
          <option value="">Select a test</option>
          {TESTS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ee-overall" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Overall score</label>
        <input id="ee-overall" type="number" min={0} max={9} step={0.5} value={overall} onChange={(e) => setOverall(e.target.value)}
          className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-listening" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Listening</label>
          <input id="ee-listening" type="number" min={0} max={9} step={0.5} value={listening} onChange={(e) => setListening(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-reading" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Reading</label>
          <input id="ee-reading" type="number" min={0} max={9} step={0.5} value={reading} onChange={(e) => setReading(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-writing" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Writing</label>
          <input id="ee-writing" type="number" min={0} max={9} step={0.5} value={writing} onChange={(e) => setWriting(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-speaking" className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">Speaking</label>
          <input id="ee-speaking" type="number" min={0} max={9} step={0.5} value={speaking} onChange={(e) => setSpeaking(e.target.value)}
            className="rounded-md border border-line-2 bg-surface px-3 py-2 text-[16px] text-ink outline-none focus:border-primary" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={reportUploaded} onChange={(e) => setReportUploaded(e.target.checked)} />
        Score report uploaded
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        {status === "saved" ? <span role="status" className="text-[14px] text-strong">Saved</span> : null}
        {status === "error" ? <span role="status" className="text-[14px] text-reach">Couldn&apos;t save — try again.</span> : null}
      </div>
    </form>
  );
}

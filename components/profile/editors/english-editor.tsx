"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { SaveFeedback, useSectionSave } from "./section-save";

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

// Overall-score scale per test (the score is stored in the test's own scale and
// converted to an IELTS band server-side). Defaults to IELTS when no test is set.
const OVERALL_SCALE: Record<string, { max: number; step: number }> = {
  ielts: { max: 9, step: 0.5 },
  pte: { max: 90, step: 1 },
  toefl: { max: 120, step: 1 },
};

export function EnglishEditor({ initial }: { initial: EnglishInitial }) {
  const [test, setTest] = useState<string>(initial.test ?? "");
  const [overall, setOverall] = useState<string>(initial.overall?.toString() ?? "");
  const [listening, setListening] = useState<string>(initial.listening?.toString() ?? "");
  const [reading, setReading] = useState<string>(initial.reading?.toString() ?? "");
  const [writing, setWriting] = useState<string>(initial.writing?.toString() ?? "");
  const [speaking, setSpeaking] = useState<string>(initial.speaking?.toString() ?? "");
  const { status, save } = useSectionSave("english");
  const overallScale = OVERALL_SCALE[test] ?? OVERALL_SCALE.ielts!;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (test) patch.test = test;
    if (overall) patch.overall = Number(overall);
    if (listening) patch.listening = Number(listening);
    if (reading) patch.reading = Number(reading);
    if (writing) patch.writing = Number(writing);
    if (speaking) patch.speaking = Number(speaking);
    await save(patch);
  };

  return (
    <form onSubmit={onSave} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ee-test" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Test</label>
        <Select id="ee-test" value={test} onChange={(e) => setTest(e.target.value)}>
          <option value="">Select a test</option>
          {TESTS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ee-overall" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Overall score</label>
        <Input id="ee-overall" type="number" min={0} max={overallScale.max} step={overallScale.step} value={overall} onChange={(e) => setOverall(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-listening" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Listening</label>
          <Input id="ee-listening" type="number" min={0} max={9} step={0.5} value={listening} onChange={(e) => setListening(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-reading" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Reading</label>
          <Input id="ee-reading" type="number" min={0} max={9} step={0.5} value={reading} onChange={(e) => setReading(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-writing" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Writing</label>
          <Input id="ee-writing" type="number" min={0} max={9} step={0.5} value={writing} onChange={(e) => setWriting(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="ee-speaking" className="font-mono text-caption uppercase tracking-wide text-ink-faint">Speaking</label>
          <Input id="ee-speaking" type="number" min={0} max={9} step={0.5} value={speaking} onChange={(e) => setSpeaking(e.target.value)} />
        </div>
      </div>
      <p className="text-small text-ink-soft">
        Have your test report? Upload it on the{" "}
        <a href="/documents" className="text-primary underline-offset-2 hover:underline">
          Documents page
        </a>{" "}
        to mark this as complete.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>Save</Button>
        <SaveFeedback status={status} />
      </div>
    </form>
  );
}

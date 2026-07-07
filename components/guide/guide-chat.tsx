"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

// Trust-first: on any failure the guide says so plainly and adds no answer — it
// never invents a fallback reply (mirrors the route's 503 honesty, MV-62).
const ERROR_MSG = "The guide couldn’t answer just now — please try again.";

/**
 * The AI-guide chat (MVP, no streaming). Each turn POSTs the question plus the
 * recent transcript to /api/guide/chat, which grounds the model in the student's
 * own assessment and MyVisa's sourced data. The reply is appended on success; a
 * failure surfaces a visible, accessible error and keeps the conversation intact.
 */
export function GuideChat() {
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    const history = messages.slice(-12); // cap context cost; the server re-grounds each turn
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/guide/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      if (!res.ok) {
        setError(ERROR_MSG);
        return;
      }
      const data = (await res.json()) as { reply?: string };
      if (!data.reply) {
        setError(ERROR_MSG);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply as string }]);
    } catch {
      setError(ERROR_MSG);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <p className="text-meta text-ink-faint">
          Ask anything about your standing — for example, “Why am I a possible match?” or “What should I
          do before I apply?” Answers come with sources and never decide for you.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <li
              key={`${m.role}-${i}`}
              className={cn(
                "animate-fade max-w-[85%] whitespace-pre-wrap rounded-xl border px-3.5 py-2.5 text-body leading-relaxed",
                m.role === "user"
                  ? "self-end border-primary/30 bg-primary/5 text-ink"
                  : "self-start border-line bg-surface text-ink",
              )}
            >
              {m.content}
            </li>
          ))}
        </ol>
      )}

      {pending ? <span className="font-mono text-small text-ink-faint">The guide is thinking…</span> : null}
      {error ? (
        <span role="alert" className="text-small text-reach">
          {error}
        </span>
      ) : null}

      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Ask about your verdict, matches, or next steps…"
          aria-label="Ask the guide a question"
          className="min-h-[44px] flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || input.trim() === ""}
          className="rounded-pill bg-primary px-5 py-2.5 text-body font-medium text-on-primary hover:bg-primary-ink disabled:opacity-50"
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

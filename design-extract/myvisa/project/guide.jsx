/* guide.jsx — calm conversational companion */

const { useState: useStateG, useRef: useRefG, useEffect: useEffectG } = React;

function Guide({ go }) {
  const [msgs, setMsgs] = useStateG([{ role: "guide", text: DB.guideIntro }]);
  const [typing, setTyping] = useStateG(false);
  const [input, setInput] = useStateG("");
  const scroller = useRefG(null);

  useEffectG(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [msgs, typing]);

  const ask = (q) => {
    if (!q.trim()) return;
    setMsgs(m => [...m, { role: "me", text: q }]);
    setInput("");
    setTyping(true);
    const reply = DB.guideReplies[q] ||
      "Good question. In the full product I'd pull this from your profile and the latest official guidance for your destination — with the source and date shown, so you can always check my work.";
    setTimeout(() => {
      setTyping(false);
      setMsgs(m => [...m, { role: "guide", text: reply }]);
    }, 900 + Math.min(reply.length * 8, 1100));
  };

  const usedPrompts = msgs.filter(m => m.role === "me").map(m => m.text);
  const remaining = DB.guidePrompts.filter(p => !usedPrompts.includes(p));

  return (
    <div className="wrap fade-in" style={{ paddingTop: 28, paddingBottom: 24, maxWidth: 800 }}>
      {/* header */}
      <div className="row gap-3 middle" style={{ marginBottom: 20 }}>
        <span className="avatar" style={{ width: 46, height: 46, background: "var(--primary)", color: "var(--on-primary)" }}><Icon name="guide" size={22} /></span>
        <div className="col">
          <span style={{ fontWeight: 500, fontSize: 19 }}>Your guide</span>
          <span className="mono row gap-2 middle"><span className="dot" style={{ background: "var(--strong)" }} /> remembers your profile · neutral, no commissions</span>
        </div>
      </div>

      {/* conversation */}
      <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "calc(100vh - 230px)", minHeight: 420 }}>
        <div ref={scroller} className="col gap-3" style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {msgs.map((m, i) => <Bubble key={i} role={m.role} text={m.text} />)}
          {typing && <Bubble role="guide" typing />}
        </div>

        {/* suggested prompts */}
        {remaining.length > 0 && (
          <div className="row gap-2" style={{ padding: "0 24px 14px", flexWrap: "wrap" }}>
            {remaining.map(p => (
              <button key={p} className="chip" style={{ cursor: "pointer" }} onClick={() => ask(p)}>{p}</button>
            ))}
          </div>
        )}

        {/* composer */}
        <div className="row gap-2 middle" style={{ padding: 16, borderTop: "1px solid var(--line)", background: "var(--surface-2)" }}>
          <input className="field" placeholder="Ask your guide anything…" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(input)} />
          <button className="btn btn-primary" style={{ borderRadius: "var(--r-sm)", padding: "13px 16px" }} onClick={() => ask(input)}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>

      <p className="mono" style={{ marginTop: 14, textAlign: "center" }}>
        Your guide explains its reasoning and shows sources. It coaches — it never writes your application for you.
      </p>
    </div>
  );
}

function Bubble({ role, text, typing }) {
  const me = role === "me";
  return (
    <div className="row rise-in" style={{ gap: 12, alignItems: "flex-start", flexDirection: me ? "row-reverse" : "row" }}>
      {!me && <span className="avatar" style={{ width: 34, height: 34, flex: "none", background: "var(--primary)", color: "var(--on-primary)" }}><Icon name="guide" size={16} /></span>}
      {me && <span className="avatar" style={{ width: 34, height: 34, flex: "none" }}>{DB.student.initials}</span>}
      <div style={{
        maxWidth: "78%",
        background: me ? "var(--primary)" : "var(--surface-2)",
        color: me ? "var(--on-primary)" : "var(--ink)",
        border: me ? "none" : "1px solid var(--line)",
        borderRadius: 14, padding: "13px 17px", fontSize: 16, lineHeight: 1.55,
      }}>
        {typing ? <TypingDots /> : text}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="row gap-1" style={{ padding: "4px 2px" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "var(--ink-faint)",
          animation: `blink 1.2s ${i * 0.18}s infinite var(--ease)`,
        }} />
      ))}
      <style>{`@keyframes blink{0%,60%,100%{opacity:.25}30%{opacity:1}}`}</style>
    </span>
  );
}

Object.assign(window, { Guide });

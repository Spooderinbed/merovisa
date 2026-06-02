/* checklist.jsx — completeness + deadlines only (no authenticity verification) */

const { useState: useStateC } = React;

function Checklist({ go }) {
  const [groups, setGroups] = useStateC(DB.checklist.groups);
  const all = groups.flatMap(g => g.items);
  const done = all.filter(i => i.done).length;
  const pct = Math.round(done / all.length * 100);

  const toggle = (id) => setGroups(gs => gs.map(g => ({
    ...g, items: g.items.map(it => it.id === id ? { ...it, done: !it.done } : it),
  })));

  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <Eyebrow icon="doc">Document checklist</Eyebrow>
      <h1 className="h1" style={{ marginTop: 12 }}>{DB.checklist.target}</h1>
      <p className="lead" style={{ marginTop: 10 }}>
        We track completeness and deadlines — not authenticity. You decide what's ready.
      </p>

      {/* progress header */}
      <div className="card card-pad col gap-3" style={{ marginTop: 24 }}>
        <div className="row between middle">
          <div className="col gap-1">
            <span style={{ fontSize: 34, fontWeight: 500 }}>{done} <span className="body" style={{ fontSize: 20 }}>of {all.length} ready</span></span>
            <span className="mono row gap-2 middle"><Icon name="clock" size={14} /> closes {DB.checklist.deadline} · {DB.checklist.weeksLeft} weeks left</span>
          </div>
          <div style={{ position: "relative", width: 76, height: 76 }}>
            <svg width="76" height="76" viewBox="0 0 76 76">
              <circle cx="38" cy="38" r="33" fill="none" stroke="var(--bg-tint)" strokeWidth="7" />
              <circle cx="38" cy="38" r="33" fill="none" stroke="var(--primary)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 33} strokeDashoffset={2 * Math.PI * 33 * (1 - pct / 100)}
                transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset .9s var(--ease)" }} />
            </svg>
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: 15 }}>{pct}%</span>
          </div>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: pct + "%", background: "var(--primary)" }} /></div>
      </div>

      {/* groups */}
      <div className="col gap-3" style={{ marginTop: 22 }}>
        {groups.map(g => {
          const gd = g.items.filter(i => i.done).length;
          return (
            <div key={g.name} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="row between middle" style={{ padding: "14px 20px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontWeight: 500 }}>{g.name}</span>
                <span className="mono">{gd}/{g.items.length}</span>
              </div>
              <div className="col">
                {g.items.map((it, i) => (
                  <button key={it.id} className="row gap-3 middle" onClick={() => toggle(it.id)}
                    style={{ padding: "15px 20px", background: "none", border: 0, textAlign: "left", borderTop: i ? "1px solid var(--line)" : "none" }}>
                    <span className="opt-mark" data-on={it.done} style={{
                      borderRadius: 7, borderColor: it.done ? "var(--primary)" : "var(--line-2)",
                      background: it.done ? "var(--primary)" : "transparent",
                    }}>
                      {it.done && <Icon name="check" size={14} style={{ color: "var(--on-primary)" }} />}
                    </span>
                    <div className="col wgrow">
                      <span style={{ fontWeight: 500, textDecoration: it.done ? "line-through" : "none", color: it.done ? "var(--ink-faint)" : "var(--ink)" }}>{it.label}</span>
                      {it.note && <span className="small" style={{ color: "var(--ink-faint)" }}>{it.note}</span>}
                    </div>
                    {!it.done && <span className="chip chip-mono">to do</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="row gap-2" style={{ marginTop: 22, padding: "14px 18px", border: "1px dashed var(--line-2)", borderRadius: "var(--r-md)" }}>
        <Icon name="shield" size={17} style={{ color: "var(--ink-faint)", marginTop: 2 }} />
        <p className="small">We check that your documents are present and on time. We don't verify authenticity — always submit genuine documents.</p>
      </div>
    </div>
  );
}

Object.assign(window, { Checklist });

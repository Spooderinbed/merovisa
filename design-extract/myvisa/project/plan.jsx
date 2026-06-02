/* plan.jsx — action plan (impact-ranked) + application timeline + visa-risk analysis */

const { useState: useStateP } = React;

function Plan({ go, data }) {
  const [tab, setTab] = useStateP("actions");
  const tabs = [["actions", "Action plan"], ["timeline", "Timeline"], ["visa", "Visa-risk analysis"]];
  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <Eyebrow icon="spark">Your plan</Eyebrow>
      <h1 className="h1" style={{ marginTop: 12 }}>The shortest path to a stronger application.</h1>
      <p className="lead" style={{ marginTop: 10 }}>Ranked by impact — each step shows which part of your case it lifts.</p>

      <div className="seg" style={{ marginTop: 24, marginBottom: 28 }}>
        {tabs.map(([k, l]) => <button key={k} data-on={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "actions" && <ActionPlan go={go} />}
      {tab === "timeline" && <Timeline />}
      {tab === "visa" && <VisaAnalysis data={data} />}
    </div>
  );
}

const IMPACT = {
  high: { label: "High impact", color: "var(--strong)", tint: "var(--strong-tint)" },
  med: { label: "Medium", color: "var(--possible)", tint: "var(--possible-tint)" },
  low: { label: "Low", color: "var(--ink-faint)", tint: "var(--bg-tint)" },
};

function ActionPlan({ go }) {
  const [items, setItems] = useStateP(DB.actionPlan);
  const done = items.filter(i => i.done).length;
  const toggle = id => setItems(its => its.map(i => i.id === id ? { ...i, done: !i.done } : i));
  // sort: not-done first, by impact
  const order = { high: 0, med: 1, low: 2 };
  const sorted = [...items].sort((a, b) => (a.done - b.done) || (order[a.impact] - order[b.impact]));

  return (
    <div className="col gap-3">
      <div className="card card-pad row between middle">
        <div className="col gap-1">
          <span style={{ fontWeight: 500, fontSize: 18 }}>{done} of {items.length} done</span>
          <span className="mono">do the high-impact ones first</span>
        </div>
        <div className="bar-track" style={{ maxWidth: 180 }}><div className="bar-fill" style={{ width: (done / items.length * 100) + "%", background: "var(--primary)" }} /></div>
      </div>

      {sorted.map(a => {
        const im = IMPACT[a.impact];
        const sm = DB.scoreMeta[a.score];
        return (
          <div key={a.id} className="card card-pad row gap-3" style={{ alignItems: "flex-start", opacity: a.done ? 0.62 : 1 }}>
            <button onClick={() => toggle(a.id)} className="opt-mark" data-on={a.done}
              style={{ marginTop: 2, borderRadius: 7, flex: "none", borderColor: a.done ? "var(--primary)" : "var(--line-2)", background: a.done ? "var(--primary)" : "transparent" }}>
              {a.done && <Icon name="check" size={14} style={{ color: "var(--on-primary)" }} />}
            </button>
            <div className="col gap-2 wgrow">
              <div className="row between middle" style={{ gap: 10 }}>
                <span style={{ fontWeight: 500, fontSize: 17, textDecoration: a.done ? "line-through" : "none" }}>{a.title}</span>
                <span className="tag" style={{ background: im.tint, color: im.color, flex: "none" }}>{im.label}</span>
              </div>
              <p className="body">{a.desc}</p>
              <div className="row gap-2 middle" style={{ flexWrap: "wrap" }}>
                <span className="chip chip-mono row gap-2 middle"><Icon name={sm.icon} size={13} /> lifts {sm.label.toLowerCase()}</span>
                <span className="chip chip-mono"><Icon name="clock" size={12} /> {a.effort}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="card card-pad row between middle" style={{ background: "var(--surface-2)", flexWrap: "wrap", gap: 12 }}>
        <span className="small row gap-2 middle" style={{ color: "var(--ink)" }}><Icon name="guide" size={17} style={{ color: "var(--primary)" }} /> Not sure where to start? Your guide will pick the next one.</span>
        <button className="btn btn-ghost btn-sm" onClick={() => go("guide")}>Ask your guide</button>
      </div>
    </div>
  );
}

function Timeline() {
  return (
    <div className="col" style={{ position: "relative", paddingLeft: 8 }}>
      {DB.timeline.map((m, i) => {
        const active = m.status === "active";
        const last = i === DB.timeline.length - 1;
        return (
          <div key={i} className="row gap-4" style={{ alignItems: "stretch" }}>
            {/* rail */}
            <div className="col middle" style={{ width: 26, flex: "none" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", marginTop: 4,
                background: active ? "var(--primary)" : "var(--surface)",
                border: `2px solid ${active ? "var(--primary)" : "var(--line-2)"}` }} />
              {!last && <span className="wgrow" style={{ width: 2, background: "var(--line-2)", marginTop: 4 }} />}
            </div>
            <div className="col gap-2" style={{ paddingBottom: last ? 0 : 26 }}>
              <span className="mono" style={{ color: active ? "var(--primary)" : "var(--ink-faint)" }}>{m.date}{active && " · now"}</span>
              <span style={{ fontWeight: 500, fontSize: 17 }}>{m.title}</span>
              <p className="body">{m.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisaAnalysis({ data }) {
  const a = Engine.visaAnalysis(data || DB.profile);
  const blocks = [
    ["Strengths", a.strengths, "check", "var(--strong)", "var(--strong-tint)"],
    ["Concerns", a.concerns, "shield", "var(--possible)", "var(--possible-tint)"],
    ["Missing information", a.missing, "doc", "var(--reach)", "var(--reach-tint)"],
  ];
  return (
    <div className="col gap-3">
      <div className="card card-pad col gap-2" style={{ background: "var(--surface-2)" }}>
        <span className="mono-up mono">How a visa officer might read your case</span>
        <p className="body" style={{ color: "var(--ink)" }}>Built from your profile and {DB.countryById("au").name}'s current rules — sourced from {DB.countryById("au").source}, checked {DB.countryById("au").updated}.</p>
      </div>
      {blocks.map(([title, items, icon, color, tint]) => (
        <div key={title} className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row gap-2 middle" style={{ padding: "13px 20px", background: tint, borderBottom: "1px solid var(--line)" }}>
            <Icon name={icon} size={17} style={{ color }} />
            <span style={{ fontWeight: 500 }}>{title}</span>
            <span className="mono" style={{ marginLeft: "auto" }}>{items.length}</span>
          </div>
          <div className="col">
            {items.length ? items.map((t, i) => (
              <div key={i} className="row gap-3 middle" style={{ padding: "13px 20px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span className="dot" style={{ background: color, flex: "none" }} />
                <span className="small" style={{ color: "var(--ink)" }}>{t}</span>
              </div>
            )) : <span className="small" style={{ padding: "13px 20px", color: "var(--ink-faint)" }}>Nothing here — nicely done.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Plan });

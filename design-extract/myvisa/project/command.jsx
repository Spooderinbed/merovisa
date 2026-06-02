/* command.jsx — the after-sign-in personal command centre
   Mission-control for one student's application: standing, today's move,
   trajectory, live instruments, incoming signals. Calm, flat, mono-labelled. */

const { useState: useStateCC } = React;

const CC_DEFAULTS = { homeCountry: "Nepal", gradeSystem: "Percentage (Nepal)", grade: 72, ielts: 7.0,
  hasGap: true, gapYears: 1, gapReasons: ["Worked or interned"], destination: "au", budget: 38000, sponsor: "Education loan" };

function CommandCentre({ go, data }) {
  const s = scoreProfile(data || CC_DEFAULTS);
  const e = Engine.computeScores(data || CC_DEFAULTS);
  const comp = Engine.completeness();
  const st = DB.student;
  const v = VERDICT[s.band];

  // the single decisive move
  const move = [...DB.actionPlan].filter(a => !a.done)
    .sort((a, b) => ({ high: 0, med: 1, low: 2 }[a.impact] - { high: 0, med: 1, low: 2 }[b.impact]))[0];

  return (
    <div className="fade-in" style={{ paddingBottom: 48 }}>
      {/* ===== greeting / status line ===== */}
      <div style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="wrap row between middle" style={{ padding: "26px 28px 24px", flexWrap: "wrap", gap: 16 }}>
          <div className="col gap-2">
            <span className="mono row gap-2 middle">
              <span className="dot" style={{ background: "var(--strong)" }} /> {greetingCC()} · {todayCC()}
            </span>
            <h1 className="h1">{greetingCC()}, {st.name.split(" ")[0]}.</h1>
            <span className="mono row gap-2 middle" style={{ flexWrap: "wrap", marginTop: 2 }}>
              <Flag emoji={s.c.flag} />
              <span style={{ color: "var(--ink-soft)" }}>{s.c.name}</span>
              <Sep /> <span style={{ color: v.color }}>{v.label}</span>
              <Sep /> {st.field} master's
              <Sep /> July 2027 intake
            </span>
          </div>
          <button className="btn btn-ghost" onClick={() => go("guide")}>
            <Icon name="guide" size={18} style={{ color: "var(--primary)" }} /> Talk to your guide
          </button>
        </div>
      </div>

      <div className="wrap" style={{ paddingTop: 24 }}>
        {/* ===== row: standing  +  today's move ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 18, alignItems: "stretch" }} className="cc-top">
          <StandingPanel s={s} e={e} go={go} />
          <div className="col gap-3">
            <TodaysMove move={move} go={go} />
            <CoPilot go={go} />
          </div>
        </div>

        {/* ===== trajectory ===== */}
        <SectionLabel n="02" label="Trajectory" hint="where you are in the journey" />
        <Trajectory go={go} />

        {/* ===== instruments ===== */}
        <SectionLabel n="03" label="Instruments" hint="every panel, at a glance" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(232px, 1fr))", gap: 14 }}>
          <Instrument icon="cap" label="Matches" go={() => go("matches")}
            readout={`${DB.universitiesFor("au").length}`} unit="universities"
            detail={`${DB.universitiesFor("au").filter(u => u.group === "strong").length} strong · ${DB.universitiesFor("au").filter(u => u.group === "possible").length} possible`} accent="var(--strong)" />
          <Instrument icon="doc" label="Checklist" go={() => go("checklist")}
            readout={checklistDone()} unit={`of ${checklistTotal()} ready`}
            detail={`closes ${DB.checklist.deadline}`} accent="var(--possible)" bar={checklistDone() / checklistTotal()} />
          <Instrument icon="user" label="Profile" go={() => go("profile")}
            readout={`${comp.pct}%`} unit="complete"
            detail={`${comp.partial} sections to finish`} accent="var(--primary)" bar={comp.pct / 100} />
          <Instrument icon="award" label="Scholarships" go={() => go("matches")}
            readout={`${DB.scholarships.length}`} unit="to apply"
            detail="merit-based · check eligibility" accent="var(--accent)" />
        </div>

        {/* ===== signals ===== */}
        <SectionLabel n="04" label="Signals" hint="new for you · sourced & dated" />
        <Signals go={go} />
      </div>
    </div>
  );
}

/* ---------- standing (the commanding focal panel) ---------- */
function StandingPanel({ s, e, go }) {
  const v = VERDICT[s.band];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="row between middle" style={{ padding: "14px 24px", borderBottom: "1px solid var(--line)" }}>
        <span className="mono-up mono row gap-2 middle"><span className="mono" style={{ color: "var(--primary)" }}>01</span> Standing</span>
        <span className="mono">illustrative · refine with a uni</span>
      </div>
      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 24, flex: 1 }} className="cc-standing">
        {/* verdict + scale */}
        <div className="col gap-3">
          <span className="mono row gap-2 middle"><Flag emoji={s.c.flag} /> {s.c.name}</span>
          <span className="display" style={{ fontSize: 46, lineHeight: 1, color: v.color }}>{v.label}</span>
          <p className="small">{v.blurb} The marker shows your overall position across the bands.</p>
          <div style={{ position: "relative", marginTop: 8 }}>
            <div className="row" style={{ height: 12, borderRadius: "var(--r-pill)", overflow: "hidden" }}>
              <div style={{ flex: 1, background: "var(--reach-tint)" }} />
              <div style={{ flex: 1, background: "var(--possible-tint)" }} />
              <div style={{ flex: 1, background: "var(--strong-tint)" }} />
            </div>
            <div style={{ position: "absolute", top: -6, left: `calc(${s.position}% - 12px)`, transition: "left 1s var(--ease)" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--surface)", border: `3px solid ${v.color}`, display: "grid", placeItems: "center" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color }} />
              </div>
            </div>
          </div>
          <div className="row between mono" style={{ marginTop: 2 }}>
            <span style={{ color: "var(--reach)" }}>Reach</span>
            <span style={{ color: "var(--possible)" }}>Possible</span>
            <span style={{ color: "var(--strong)" }}>Strong</span>
          </div>
        </div>
        <div style={{ background: "var(--line)" }} className="hide-mobile" />
        {/* instruments / sub-scores */}
        <div className="col gap-3">
          <span className="mono-up mono">Your four factors</span>
          {["academic", "financial", "visa", "profile"].map(k => (
            <div key={k} className="col gap-1">
              <div className="row between middle">
                <span className="row gap-2 middle small" style={{ fontWeight: 500, color: "var(--ink)" }}>
                  <Icon name={DB.scoreMeta[k].icon} size={15} style={{ color: "var(--ink-faint)" }} />
                  {DB.scoreMeta[k].label}
                </span>
                <span className="mono" style={{ color: VERDICT[e.bands[k]].color }}>{VERDICT[e.bands[k]].label}</span>
              </div>
              <div className="bar-track" style={{ height: 6 }}>
                <div className="bar-fill" style={{ width: e.scores[k] + "%", background: VERDICT[e.bands[k]].color }} />
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, alignSelf: "flex-start" }} onClick={() => go("results")}>
            Full breakdown <Icon name="arrowRight" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- today's single decisive move ---------- */
function TodaysMove({ move, go }) {
  if (!move) return null;
  const sm = DB.scoreMeta[move.score];
  return (
    <div className="card card-pad col gap-3" style={{ background: "var(--primary)", borderColor: "transparent", color: "var(--on-primary)", flex: 1 }}>
      <span className="mono-up mono" style={{ color: "var(--on-primary)", opacity: .7 }}>Your move today</span>
      <h3 className="h2" style={{ color: "var(--on-primary)" }}>{move.title}</h3>
      <p style={{ color: "var(--on-primary)", opacity: .9, fontSize: 15.5, lineHeight: 1.5 }}>{move.desc}</p>
      <div className="row gap-2 middle" style={{ flexWrap: "wrap", marginTop: 2 }}>
        <span className="chip chip-mono" style={{ background: "rgba(255,255,255,.14)", borderColor: "transparent", color: "var(--on-primary)" }}>
          <Icon name={sm.icon} size={13} /> lifts {sm.label.toLowerCase()}
        </span>
        <span className="chip chip-mono" style={{ background: "rgba(255,255,255,.14)", borderColor: "transparent", color: "var(--on-primary)" }}>
          <Icon name="clock" size={12} /> {move.effort}
        </span>
      </div>
      <button className="btn" style={{ background: "var(--surface)", color: "var(--primary)", marginTop: 4, alignSelf: "flex-start" }} onClick={() => go("plan")}>
        Do this now <Icon name="arrowRight" size={17} />
      </button>
    </div>
  );
}

/* ---------- ambient co-pilot ---------- */
function CoPilot({ go }) {
  return (
    <div className="card card-pad row gap-3" style={{ alignItems: "flex-start" }}>
      <span className="avatar" style={{ width: 38, height: 38, flex: "none", background: "var(--primary)", color: "var(--on-primary)" }}><Icon name="guide" size={18} /></span>
      <div className="col gap-2 wgrow">
        <span className="mono-up mono">Your guide</span>
        <p className="small" style={{ color: "var(--ink)" }}>You're in good shape for Australia. Once that report's uploaded, I'll sharpen your shortlist to a final three.</p>
        <button className="btn-quiet btn-sm row gap-2 middle" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => go("guide")}>
          Continue <Icon name="arrowRight" size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------- journey trajectory ---------- */
function Trajectory({ go }) {
  const stages = DB.timeline;
  const activeIdx = stages.findIndex(s => s.status === "active");
  return (
    <div className="card card-pad">
      <div className="cc-traj" style={{ display: "grid", gridTemplateColumns: `repeat(${stages.length}, 1fr)`, gap: 0 }}>
        {stages.map((m, i) => {
          const done = i < activeIdx, active = i === activeIdx;
          const color = active ? "var(--primary)" : done ? "var(--strong)" : "var(--line-2)";
          return (
            <div key={i} className="col gap-2" style={{ position: "relative", paddingRight: 8 }}>
              {/* connector */}
              {i < stages.length - 1 && (
                <span style={{ position: "absolute", top: 11, left: "calc(50% + 14px)", right: "calc(-50% + 14px)", height: 2,
                  background: i < activeIdx ? "var(--strong)" : "var(--line-2)" }} />
              )}
              <span style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative", zIndex: 1,
                background: active ? "var(--primary)" : done ? "var(--strong)" : "var(--surface)",
                border: `2px solid ${color}` }}>
                {done ? <Icon name="check" size={13} style={{ color: "var(--on-primary)" }} />
                  : active ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--on-primary)" }} />
                  : <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>{i + 1}</span>}
              </span>
              <span className="mono" style={{ color: active ? "var(--primary)" : "var(--ink-faint)" }}>{m.date}</span>
              <span className="small" style={{ fontWeight: 500, color: active ? "var(--ink)" : "var(--ink-soft)" }}>{m.title}</span>
            </div>
          );
        })}
      </div>
      <div className="row between middle" style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)", flexWrap: "wrap", gap: 10 }}>
        <span className="small">{stages[activeIdx]?.desc}</span>
        <button className="btn-quiet btn-sm row gap-2 middle" onClick={() => go("plan")}>Full timeline <Icon name="chevron" size={15} /></button>
      </div>
    </div>
  );
}

/* ---------- instrument tile ---------- */
function Instrument({ icon, label, readout, unit, detail, accent, bar, go }) {
  return (
    <button className="card card-pad col gap-3" onClick={go} style={{ textAlign: "left", alignItems: "stretch", cursor: "pointer" }}>
      <div className="row between middle">
        <span className="mono-up mono">{label}</span>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-tint)", color: accent, display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.02em" }}>{readout}</span>
        <span className="small" style={{ color: "var(--ink-faint)" }}>{unit}</span>
      </div>
      {bar != null && (
        <div className="bar-track" style={{ height: 5 }}><div className="bar-fill" style={{ width: (bar * 100) + "%", background: accent }} /></div>
      )}
      <div className="row between middle">
        <span className="mono">{detail}</span>
        <Icon name="arrowRight" size={15} style={{ color: "var(--ink-faint)" }} />
      </div>
    </button>
  );
}

/* ---------- signals (incoming intel, not a social feed) ---------- */
function Signals({ go }) {
  const items = DB.feed.filter(f => ["visa-update", "deadline", "scholarship", "match"].includes(f.kind));
  const meta = {
    "visa-update": ["shield", "var(--possible)", "Visa update"],
    deadline: ["clock", "var(--reach)", "Deadline"],
    scholarship: ["award", "var(--accent)", "Scholarship"],
    match: ["match", "var(--strong)", "New match"],
  };
  const route = k => (k === "visa-update" || k === "deadline") ? "destinations" : k === "match" ? "matches" : "matches";
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {items.map((it, i) => {
        const [ic, color, kind] = meta[it.kind];
        return (
          <button key={it.id} className="row gap-3 middle" onClick={() => go(route(it.kind))}
            style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: "16px 22px", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--bg-tint)", color, display: "grid", placeItems: "center", flex: "none" }}>
              <Icon name={ic} size={16} />
            </span>
            <div className="col wgrow" style={{ gap: 2 }}>
              <div className="row gap-2 middle" style={{ flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500 }}>{it.title}</span>
                {it.flag && <Flag emoji={it.flag} />}
              </div>
              <span className="small" style={{ color: "var(--ink-faint)" }}>{it.body}</span>
            </div>
            <div className="col gap-1 hide-mobile" style={{ textAlign: "right", flex: "none" }}>
              <span className="mono" style={{ color }}>{kind}</span>
              <span className="mono">{it.updated}</span>
            </div>
            <Icon name="chevron" size={16} style={{ color: "var(--ink-faint)", flex: "none" }} />
          </button>
        );
      })}
    </div>
  );
}

/* ---------- bits ---------- */
function SectionLabel({ n, label, hint }) {
  return (
    <div className="row between middle" style={{ margin: "32px 0 14px" }}>
      <span className="mono-up mono row gap-2 middle"><span style={{ color: "var(--primary)" }}>{n}</span> {label}</span>
      <span className="mono">{hint}</span>
    </div>
  );
}
function Sep() { return <span style={{ opacity: .4 }}>·</span>; }
function greetingCC() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
function todayCC() { return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }); }
function checklistDone() { return DB.checklist.groups.flatMap(g => g.items).filter(i => i.done).length; }
function checklistTotal() { return DB.checklist.groups.flatMap(g => g.items).length; }

Object.assign(window, { CommandCentre });

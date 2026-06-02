/* dashboard.jsx — logged-in home: personalized feed + the guide working */

function Dashboard({ go, data }) {
  const defaults = { homeCountry: "Nepal", gradeSystem: "Percentage (Nepal)", grade: 72, ielts: 7.0,
    hasGap: true, gapYears: 1, gapReasons: ["Worked or interned"], destination: "au", budget: 38000, sponsor: "Education loan" };
  const s = scoreProfile(data || defaults);
  const st = DB.student;
  return (
    <div className="fade-in" style={{ paddingBottom: 40 }}>
      <div className="wrap" style={{ paddingTop: 36 }}>
        {/* greeting */}
        <div className="row between middle" style={{ marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div className="col gap-1">
            <span className="mono">{greeting()} · {today()}</span>
            <h1 className="h1">Welcome back, {st.name.split(" ")[0]}.</h1>
          </div>
          <button className="btn btn-ghost" onClick={() => go("guide")}>
            <Icon name="guide" size={18} style={{ color: "var(--primary)" }} /> Talk to your guide
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 22, alignItems: "start" }}>
          {/* main feed */}
          <div className="col gap-3">
            <div className="row between middle">
              <h2 className="h3">For you</h2>
              <span className="mono row gap-2 middle"><Icon name="refresh" size={13} /> refreshed today</span>
            </div>
            {DB.feed.map(item => <FeedCard key={item.id} item={item} go={go} />)}
          </div>

          {/* sidebar */}
          <aside className="col gap-3 hide-mobile" style={{ position: "sticky", top: 82 }}>
            <SnapshotCard s={s} go={go} />
            <ActionMini go={go} />
            <CompletenessMini go={go} />
            <ChecklistMini go={go} />
            <TrustCard />
          </aside>
        </div>
      </div>
    </div>
  );
}

function FeedCard({ item, go }) {
  const prog = item.programId && DB.programById(item.programId);
  const accent = {
    "next-action": "var(--primary)", "visa-update": "var(--possible)", match: "var(--strong)",
    deadline: "var(--reach)", scholarship: "var(--accent)", guide: "var(--primary)",
  }[item.kind] || "var(--primary)";

  if (item.kind === "next-action") return (
    <div className="card card-pad col gap-3" style={{ background: "var(--primary-tint)", borderColor: "transparent" }}>
      <span className="row gap-2 middle" style={{ color: "var(--primary)", fontWeight: 500 }}>
        <Icon name="spark" size={18} /> {item.title}
      </span>
      <p style={{ color: "var(--ink)" }}>{item.body}</p>
      <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>{item.cta} <Icon name="arrowRight" size={16} /></button>
    </div>
  );

  if (item.kind === "guide") return (
    <div className="card card-pad row gap-3" style={{ alignItems: "flex-start" }}>
      <span className="avatar" style={{ background: "var(--primary)", color: "var(--on-primary)" }}><Icon name="guide" size={18} /></span>
      <div className="col gap-2 wgrow">
        <span className="mono-up mono">{item.meta}</span>
        <p style={{ color: "var(--ink)" }}>{item.body}</p>
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => go("guide")}>
          <Icon name="guide" size={15} /> Continue with your guide
        </button>
      </div>
    </div>
  );

  return (
    <div className="card card-pad col gap-3">
      <div className="row between middle">
        <span className="row gap-2 middle" style={{ fontWeight: 500 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "var(--bg-tint)", display: "grid", placeItems: "center", color: accent }}>
            <Icon name={item.icon} size={17} />
          </span>
          {item.flag && <Flag emoji={item.flag} />}
        </span>
        <span className="mono">{item.updated}</span>
      </div>
      <div className="col gap-2">
        <h3 style={{ fontSize: 18, fontWeight: 500 }}>{item.title}</h3>
        <p className="body">{item.body}</p>
      </div>
      {prog && (
        <div className="row gap-3 middle" style={{ paddingTop: 4 }}>
          <span className="chip chip-mono">{prog.tuition}</span>
          <span className="chip chip-mono">closes {prog.deadline}</span>
          <Verdict level={prog.match} />
        </div>
      )}
      <div className="row between middle" style={{ marginTop: 2 }}>
        <span className="mono">{item.meta}</span>
        <button className="btn-quiet btn-sm row gap-1 middle"
          onClick={() => item.kind === "visa-update" || item.kind === "deadline" ? go("destinations") : go("checklist")}>
          {item.kind === "match" ? "View program" : item.kind === "scholarship" ? "Check eligibility" : "Open"}
          <Icon name="chevron" size={15} />
        </button>
      </div>
    </div>
  );
}

function SnapshotCard({ s, go }) {
  const v = VERDICT[s.band];
  const sc = s.scores || { academic: s.academic, financial: s.budgetFit, visa: s.gapFit, profile: s.profileStr };
  const bd = s.bands || {};
  return (
    <div className="card card-pad col gap-3">
      <span className="mono-up mono">Your standing</span>
      <div className="row gap-2 middle">
        <Flag emoji={s.c.flag} />
        <span style={{ fontWeight: 500 }}>{s.c.name}</span>
        <span style={{ marginLeft: "auto" }}><Verdict level={s.band} /></span>
      </div>
      {["academic", "financial", "visa", "profile"].map(k => (
        <FactorBar key={k} label={DB.scoreMeta[k].label} value={sc[k]}
          level={bd[k] || (sc[k] >= 70 ? "strong" : sc[k] >= 50 ? "possible" : "reach")} />
      ))}
      <button className="btn btn-ghost btn-sm btn-full" onClick={() => go("results")}>See full result</button>
    </div>
  );
}

function ActionMini({ go }) {
  const top = [...DB.actionPlan].filter(a => !a.done)
    .sort((a, b) => ({ high: 0, med: 1, low: 2 }[a.impact] - { high: 0, med: 1, low: 2 }[b.impact]))[0];
  if (!top) return null;
  const sm = DB.scoreMeta[top.score];
  return (
    <div className="card card-pad col gap-3">
      <div className="row between middle">
        <span className="mono-up mono">Top action</span>
        <span className="tag tag-strong">High impact</span>
      </div>
      <span style={{ fontWeight: 500 }}>{top.title}</span>
      <span className="mono row gap-2 middle"><Icon name={sm.icon} size={13} /> lifts {sm.label.toLowerCase()} · {top.effort}</span>
      <button className="btn btn-primary btn-sm btn-full" onClick={() => go("plan")}>Open action plan</button>
    </div>
  );
}

function CompletenessMini({ go }) {
  const comp = Engine.completeness();
  return (
    <div className="card card-pad col gap-3">
      <div className="row between middle">
        <span className="mono-up mono">Profile</span>
        <span className="mono">{comp.pct}%</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: comp.pct + "%", background: "var(--primary)" }} /></div>
      <p className="small">{comp.partial} sections partly done — finishing them sharpens your matches.</p>
      <button className="btn btn-ghost btn-sm btn-full" onClick={() => go("profile")}>Open profile</button>
    </div>
  );
}

function ChecklistMini({ go }) {
  const all = DB.checklist.groups.flatMap(g => g.items);
  const done = all.filter(i => i.done).length;
  return (
    <div className="card card-pad col gap-3">
      <div className="row between middle">
        <span className="mono-up mono">Checklist</span>
        <span className="mono">{done}/{all.length}</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: (done / all.length * 100) + "%", background: "var(--primary)" }} /></div>
      <p className="small">{DB.checklist.target} · closes {DB.checklist.deadline}</p>
      <button className="btn btn-ghost btn-sm btn-full" onClick={() => go("checklist")}>Open checklist</button>
    </div>
  );
}

function TrustCard() {
  return (
    <div className="card card-pad col gap-2" style={{ background: "var(--surface-2)" }}>
      <Icon name="shield" size={18} style={{ color: "var(--primary)" }} />
      <p className="small" style={{ color: "var(--ink)" }}>Every visa update here is sourced from official government sites and checked daily.</p>
      <span className="mono">no agents · no hidden commissions</span>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function today() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

Object.assign(window, { Dashboard });

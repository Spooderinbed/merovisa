/* matches.jsx — university matching (grouped) + scholarships + cost estimate */

const { useState: useStateM } = React;

function Matches({ go }) {
  const [tab, setTab] = useStateM("universities");
  const tabs = [["universities", "Universities"], ["scholarships", "Scholarships"], ["costs", "Cost estimate"]];
  return (
    <div className="wrap fade-in" style={{ paddingTop: 32, paddingBottom: 50 }}>
      <Eyebrow icon="cap">Matches for {DB.countryById("au").name}</Eyebrow>
      <h1 className="h1" style={{ marginTop: 12, maxWidth: 640 }}>Where your profile fits today.</h1>
      <p className="lead" style={{ marginTop: 10 }}>Grouped against each program's published thresholds. As your profile grows, these sharpen.</p>

      <div className="seg" style={{ marginTop: 24, marginBottom: 28 }}>
        {tabs.map(([k, l]) => <button key={k} data-on={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "universities" && <Universities go={go} />}
      {tab === "scholarships" && <Scholarships />}
      {tab === "costs" && <Costs />}
    </div>
  );
}

function Universities({ go }) {
  const list = DB.universitiesFor("au");
  const groups = [
    ["strong", "Strong matches", "Your profile clears their thresholds."],
    ["possible", "Possible", "Within reach with a sharp application."],
    ["reach", "Reach", "Ambitious — keep one on your shortlist."],
  ];
  return (
    <div className="col gap-5">
      {groups.map(([g, title, sub]) => {
        const items = list.filter(u => u.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="col gap-3">
            <div className="row gap-3 middle">
              <Verdict level={g} size="lg" />
              <div className="col">
                <h3 className="h3">{title}</h3>
                <span className="small">{sub}</span>
              </div>
              <span className="mono" style={{ marginLeft: "auto" }}>{items.length}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 14 }}>
              {items.map(u => <UniCard key={u.id} u={u} />)}
            </div>
          </div>
        );
      })}
      <div className="card card-pad row between middle" style={{ flexWrap: "wrap", gap: 14, background: "var(--surface-2)" }}>
        <p className="small" style={{ maxWidth: 460, color: "var(--ink)" }}>
          A healthy shortlist is one reach, two strong. Want your guide to suggest one?
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => go("guide")}><Icon name="guide" size={16} /> Ask your guide</button>
      </div>
    </div>
  );
}

function UniCard({ u }) {
  const [saved, setSaved] = useStateM(false);
  return (
    <div className="card card-pad col gap-3" style={{ alignItems: "stretch" }}>
      <div className="row between middle">
        <div className="row gap-3 middle">
          <Flag emoji={u.flag} />
          <div className="col">
            <span style={{ fontWeight: 500 }}>{u.name}</span>
            <span className="mono">{u.city} · {u.rank}</span>
          </div>
        </div>
        <Verdict level={u.group} />
      </div>
      <hr className="hairline" />
      <span style={{ fontWeight: 500, fontSize: 15.5 }}>{u.program}</span>
      <p className="small" style={{ color: "var(--ink-faint)" }}>{u.why}</p>
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <span className="chip chip-mono">{u.tuition}</span>
        <span className="chip chip-mono">closes {u.deadline}</span>
      </div>
      <div className="row between middle" style={{ marginTop: 2 }}>
        <span className="mono">needs {u.reqGrade} · IELTS {u.reqIELTS}</span>
        <button className="btn-quiet btn-sm row gap-2 middle" onClick={() => setSaved(!saved)} style={{ color: saved ? "var(--primary)" : "var(--ink-soft)" }}>
          <Icon name={saved ? "check" : "match"} size={15} /> {saved ? "Shortlisted" : "Shortlist"}
        </button>
      </div>
    </div>
  );
}

function Scholarships() {
  return (
    <div className="col gap-3">
      {DB.scholarships.map(s => (
        <div key={s.id} className="card card-pad row gap-4" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-tint)", color: "var(--accent)", display: "grid", placeItems: "center", flex: "none" }}>
            <Icon name="award" size={22} />
          </span>
          <div className="col gap-2 wgrow" style={{ minWidth: 240 }}>
            <div className="row between middle" style={{ gap: 10 }}>
              <span style={{ fontWeight: 500, fontSize: 17 }}>{s.name}</span>
              <Verdict level={s.match} />
            </div>
            <span className="mono row gap-2 middle"><Flag emoji={s.flag} /> {s.uni} · {s.basis}</span>
            <p className="body">{s.note}</p>
          </div>
          <div className="col gap-2" style={{ textAlign: "right", minWidth: 130 }}>
            <span style={{ fontWeight: 500, color: "var(--accent)" }}>{s.amount}</span>
            <button className="btn btn-ghost btn-sm">Check eligibility</button>
          </div>
        </div>
      ))}
      <p className="mono row gap-2 middle" style={{ marginTop: 4 }}>
        <Icon name="spark" size={14} /> Add leadership & volunteering to your profile to unlock merit awards.
      </p>
    </div>
  );
}

function Costs() {
  const c = DB.costEstimate;
  const fx = 0.66;
  const yearly = c.items.reduce((a, i) => a + (i.label === "Student visa (subclass 500)" ? 0 : i.aud), 0);
  const firstYear = c.items.reduce((a, i) => a + i.aud, 0);
  const usd = (aud) => Math.round(aud * fx).toLocaleString();
  return (
    <div className="col gap-4" style={{ maxWidth: 760 }}>
      <div className="row gap-2 middle">
        <span className="mono">{c.basis}</span>
        <span className="chip chip-mono" style={{ marginLeft: "auto" }}>{c.fxNote}</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {c.items.map((it, i) => (
          <div key={it.label} className="row between middle" style={{ padding: "18px 22px", borderTop: i ? "1px solid var(--line)" : "none" }}>
            <div className="row gap-3 middle">
              <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-tint)", color: "var(--primary)", display: "grid", placeItems: "center" }}>
                <Icon name={it.icon} size={18} />
              </span>
              <div className="col">
                <span style={{ fontWeight: 500 }}>{it.label}</span>
                <span className="small" style={{ color: "var(--ink-faint)" }}>{it.note}</span>
              </div>
            </div>
            <div className="col" style={{ textAlign: "right" }}>
              <span style={{ fontWeight: 500 }}>A${it.aud.toLocaleString()}</span>
              <span className="mono">≈ US${usd(it.aud)}</span>
            </div>
          </div>
        ))}
        <div className="row between middle" style={{ padding: "20px 22px", borderTop: "1px solid var(--line)", background: "var(--primary-tint)" }}>
          <div className="col">
            <span style={{ fontWeight: 500, fontSize: 18 }}>First-year total</span>
            <span className="small" style={{ color: "var(--ink)" }}>then ≈ A${yearly.toLocaleString()} / yr ongoing</span>
          </div>
          <div className="col" style={{ textAlign: "right" }}>
            <span style={{ fontWeight: 500, fontSize: 22, color: "var(--primary)" }}>A${firstYear.toLocaleString()}</span>
            <span className="mono">≈ US${usd(firstYear)}</span>
          </div>
        </div>
      </div>
      <div className="row gap-2" style={{ padding: "14px 18px", border: "1px dashed var(--line-2)", borderRadius: "var(--r-md)" }}>
        <Icon name="coins" size={17} style={{ color: "var(--ink-faint)", marginTop: 2 }} />
        <p className="small">Your stated budget is $38,000/yr. The first year runs higher because of one-time visa and setup costs — proof of funds should cover living + first-year tuition.</p>
      </div>
    </div>
  );
}

Object.assign(window, { Matches });

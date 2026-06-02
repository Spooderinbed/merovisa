/* results.jsx — banded verdict + 4 sub-scores + unlocked outputs. Presentations: "scale" / "card". */

// kept for back-compat (dashboard snapshot) — delegates to the engine
function scoreProfile(data) {
  const e = Engine.computeScores(data);
  return {
    c: e.country, band: e.band, position: e.overall,
    academic: e.scores.academic, budgetFit: e.scores.financial,
    gapFit: e.scores.visa, profileStr: e.scores.profile,
    scores: e.scores, bands: e.bands,
  };
}

function Results({ go, data, onSave, variant = "scale" }) {
  const e = Engine.computeScores(data);
  const s = { c: e.country, band: e.band, position: e.overall };
  const v = VERDICT[s.band];

  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 36, paddingBottom: 60 }}>
      <button className="btn-quiet row gap-2 middle" onClick={() => go("wizard")} style={{ borderRadius: "var(--r-pill)", marginBottom: 22 }}>
        <Icon name="arrowLeft" size={17} /> Adjust my answers
      </button>

      <div className="row gap-2 middle" style={{ marginBottom: 8 }}>
        <Flag emoji={s.c.flag} />
        <span className="mono-up mono">Your standing for {s.c.name}</span>
      </div>

      {variant === "scale" ? <VerdictScale s={s} /> : <VerdictCard s={s} />}

      {/* four sub-scores */}
      <div className="card card-pad col gap-4" style={{ marginTop: 18 }}>
        <div className="row between middle">
          <h3 className="h3">Why this result</h3>
          <span className="mono">four factors, shown as bands</span>
        </div>
        {["academic", "financial", "visa", "profile"].map(k => (
          <FactorBar key={k} label={DB.scoreMeta[k].label} value={e.scores[k]} level={e.bands[k]}
            note={scoreNote(k, data, e)} />
        ))}
        <p className="mono" style={{ marginTop: 2 }}>We show bands, not a precise percentage — false confidence helps no one.</p>
      </div>

      {/* what saving unlocks */}
      <div className="col gap-3" style={{ marginTop: 18 }}>
        <span className="mono-up mono">What you've unlocked</span>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <UnlockTile icon="cap" title="University matches"
            value={`${DB.universitiesFor("au").filter(u => u.group === "strong").length} strong · ${DB.universitiesFor("au").filter(u => u.group === "possible").length} possible`} onSave={() => onSave(data)} />
          <UnlockTile icon="coins" title="Cost estimate" value="Tuition + living + visa" onSave={() => onSave(data)} />
          <UnlockTile icon="award" title="Scholarships" value={`${DB.scholarships.length} you can apply to`} onSave={() => onSave(data)} />
          <UnlockTile icon="spark" title="Action plan" value={`${DB.actionPlan.filter(a => a.impact === "high").length} high-impact steps`} onSave={() => onSave(data)} />
        </div>
      </div>

      {/* recent visa change alert */}
      <div className="card" style={{ marginTop: 18, padding: 0, overflow: "hidden", borderColor: "var(--line-2)" }}>
        <div className="row gap-2 middle" style={{ padding: "13px 20px", background: riskBg(s.c.risk.level), borderBottom: "1px solid var(--line)" }}>
          <Icon name="shield" size={17} style={{ color: riskColor(s.c.risk.level) }} />
          <span style={{ fontWeight: 500, color: "var(--ink)" }}>Recent visa change</span>
          <span className="chip chip-mono" style={{ marginLeft: "auto" }}>{s.c.name}</span>
        </div>
        <div className="col gap-3" style={{ padding: 20 }}>
          <span style={{ fontWeight: 500 }}>{s.c.risk.title}</span>
          <p className="body">{s.c.risk.body}</p>
          <SourceTag source={s.c.source} updated={s.c.updated} />
        </div>
      </div>

      {/* caveat */}
      <div className="row gap-2" style={{ marginTop: 18, padding: "14px 18px", border: "1px dashed var(--line-2)", borderRadius: "var(--r-md)" }}>
        <Icon name="doc" size={17} style={{ color: "var(--ink-faint)", marginTop: 2 }} />
        <p className="small">
          This is an illustrative estimate, not admissions advice. Pick a specific university to sharpen it —
          we score against that program's published thresholds.
        </p>
      </div>

      {/* CTA */}
      <div className="card card-pad col gap-3" style={{ marginTop: 24, background: "var(--primary-tint)", borderColor: "transparent" }}>
        <h3 className="h2">Keep this & unlock the full picture</h3>
        <p className="body" style={{ color: "var(--ink)" }}>
          Save your profile to open your matches, costs, scholarships, action plan and a feed
          tailored to {s.c.name}. Free — we'll never sell your details.
        </p>
        <div className="row gap-3 middle" style={{ marginTop: 4, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={() => onSave(data)}>
            Save & see everything <Icon name="arrowRight" size={18} />
          </button>
          <button className="btn btn-ghost" onClick={() => go("destinations")}>Compare destinations</button>
        </div>
      </div>
    </div>
  );
}

function scoreNote(k, data, e) {
  const c = e.country;
  if (k === "academic") return DB.gradeConversion[c.name]?.[data.gradeSystem]?.[data.grade] || `grade + IELTS ${data.ielts ?? "—"}`;
  if (k === "financial") return `$${(data.budget ?? 38000).toLocaleString()}/yr vs ${c.tuitionRange}`;
  if (k === "visa") return !data.hasGap ? "no gap · no refusals" : `${data.gapYears}yr gap · explained`;
  if (k === "profile") return `${DB.profile.work.duration} work · add more`;
  return "";
}

function UnlockTile({ icon, title, value, onSave }) {
  return (
    <button className="card card-pad col gap-2" onClick={onSave}
      style={{ textAlign: "left", cursor: "pointer", alignItems: "stretch", position: "relative" }}>
      <div className="row between middle">
        <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--primary-tint)", color: "var(--primary)", display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={18} />
        </span>
        <Icon name="lock" size={15} style={{ color: "var(--ink-faint)" }} />
      </div>
      <span style={{ fontWeight: 500 }}>{title}</span>
      <span className="small" style={{ color: "var(--ink-faint)" }}>{value}</span>
    </button>
  );
}

/* ---- presentation A: honest three-band scale with a marker ---- */
function VerdictScale({ s }) {
  const v = VERDICT[s.band];
  return (
    <div className="card card-pad rise-in">
      <div className="row gap-3 middle" style={{ marginBottom: 6 }}>
        <h1 className="display" style={{ fontSize: 52, color: v.color }}>{v.label}</h1>
      </div>
      <p className="lead" style={{ marginBottom: 26 }}>
        Based on your profile, {s.c.name} looks like a <strong style={{ color: v.color, fontWeight: 500 }}>{v.label.toLowerCase()}</strong> for you — {v.blurb.toLowerCase()}
      </p>
      <div style={{ position: "relative", marginTop: 30, marginBottom: 14 }}>
        <div className="row" style={{ height: 14, borderRadius: "var(--r-pill)", overflow: "hidden" }}>
          <div style={{ flex: 1, background: "var(--reach-tint)" }} />
          <div style={{ flex: 1, background: "var(--possible-tint)" }} />
          <div style={{ flex: 1, background: "var(--strong-tint)" }} />
        </div>
        <div style={{ position: "absolute", top: -7, left: `calc(${s.position}% - 14px)`, transition: "left 1s var(--ease)" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface)", border: `3px solid ${v.color}`, display: "grid", placeItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} />
          </div>
        </div>
      </div>
      <div className="row between mono" style={{ marginTop: 4 }}>
        <span style={{ color: "var(--reach)" }}>Reach</span>
        <span style={{ color: "var(--possible)" }}>Possible</span>
        <span style={{ color: "var(--strong)" }}>Strong match</span>
      </div>
    </div>
  );
}

/* ---- presentation B: focused verdict card ---- */
function VerdictCard({ s }) {
  const v = VERDICT[s.band];
  return (
    <div className="card card-pad rise-in" style={{ borderColor: v.color, borderWidth: 1.5 }}>
      <div className="row gap-4 middle" style={{ flexWrap: "wrap" }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", border: `4px solid ${v.color}`, background: v.tint, display: "grid", placeItems: "center", flex: "none" }}>
          <Icon name={s.band === "strong" ? "check" : s.band === "possible" ? "spark" : "pin"} size={36} style={{ color: v.color }} />
        </div>
        <div className="wgrow" style={{ minWidth: 220 }}>
          <Verdict level={s.band} size="lg" />
          <h1 className="h1" style={{ marginTop: 12 }}>{s.c.name} is a {v.label.toLowerCase()} for you</h1>
          <p className="body" style={{ marginTop: 8 }}>{v.blurb} Four factors drove this — see them below.</p>
        </div>
      </div>
    </div>
  );
}

function riskColor(l) { return l === "info" ? "var(--primary)" : l === "warning" ? "var(--possible)" : "var(--reach)"; }
function riskBg(l) { return l === "info" ? "var(--primary-tint)" : l === "warning" ? "var(--possible-tint)" : "var(--reach-tint)"; }

Object.assign(window, { Results, scoreProfile, riskColor, riskBg });

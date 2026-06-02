/* home.jsx — logged-out marketing home */

function Home({ go }) {
  return (
    <div className="fade-in">
      {/* trust strip */}
      <div style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="wrap row center middle gap-2" style={{ height: 38 }}>
          <Icon name="shield" size={14} style={{ color: "var(--primary)" }} />
          <span className="mono">No agents · no hidden commissions · we never steer you toward whoever pays us</span>
        </div>
      </div>

      {/* hero */}
      <section className="wrap" style={{ paddingTop: 72, paddingBottom: 24 }}>
        <div style={{ maxWidth: 760 }}>
          <Eyebrow>For students applying abroad</Eyebrow>
          <h1 className="display" style={{ marginTop: 20 }}>
            An honest answer before<br />you pay anyone.
          </h1>
          <p className="lead measure" style={{ marginTop: 22 }}>
            Can I get in? What will it really cost? What's my visa risk? See where you
            stand in about two minutes — free, and no sign-up to start.
          </p>
          <div className="row gap-3 middle" style={{ marginTop: 32, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={() => go("wizard")}>
              Check your eligibility <Icon name="arrowRight" size={18} />
            </button>
            <span className="small row gap-2 middle">
              <Icon name="clock" size={16} style={{ color: "var(--ink-faint)" }} />
              About 2 minutes · no account needed
            </span>
          </div>
        </div>

        {/* preview of feed + guide working */}
        <div style={{ marginTop: 64 }}>
          <HeroPreview go={go} />
        </div>
      </section>

      {/* feature tiles */}
      <section className="wrap" style={{ marginTop: 80 }}>
        <Eyebrow>What you get</Eyebrow>
        <h2 className="h1" style={{ marginTop: 14, maxWidth: 600 }}>Three quiet tools, no clutter.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginTop: 36 }}>
          <Tile icon="shield" title="Eligibility & checklist"
            body="A banded verdict — strong, possible, or reach — built from official thresholds, plus a document checklist with real deadlines." />
          <Tile icon="guide" title="An AI guide that remembers you"
            body="Not a popup bot. A calm companion that powers a feed of matches, visa updates for your country, and your next best step." />
          <Tile icon="doc" title="SOP coach"
            body="Coaching on your own draft — structure, clarity, how you explain a study gap. A coach, never a ghostwriter." badge="Soon" />
        </div>
      </section>

      {/* how it works */}
      <section className="wrap" style={{ marginTop: 88 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {[
              ["1", "Tell us about you", "Where you're from, your grades in your own grade system, your budget. One question at a time."],
              ["2", "See where you stand", "A banded verdict with the factors that drove it — academic fit, budget, and how your gap reads."],
              ["3", "Build your case", "Track applications, work the checklist, and let your guide keep your visa info fresh."],
            ].map(([n, t, b], i) => (
              <div key={n} style={{ padding: 30, borderRight: i < 2 ? "1px solid var(--line)" : "none" }}>
                <span className="mono" style={{ color: "var(--primary)", fontSize: 22, fontWeight: 500 }}>{n}</span>
                <h3 className="h3" style={{ marginTop: 14 }}>{t}</h3>
                <p className="body" style={{ marginTop: 8 }}>{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* trust / no-agents */}
      <section className="wrap-narrow" style={{ marginTop: 96, textAlign: "center" }}>
        <Eyebrow icon="shield">Trust is the product</Eyebrow>
        <h2 className="h1" style={{ marginTop: 16 }}>We sit before the consultancy, not in place of one.</h2>
        <p className="lead" style={{ marginTop: 18 }}>
          Every recommendation shows the factors behind it. Every visa rule shows where it
          came from and when we last checked. If we ever earn referral revenue, you'll see it
          said plainly — right where it's relevant.
        </p>
        <div className="row center gap-3 middle" style={{ marginTop: 30, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-lg" onClick={() => go("wizard")}>Check your eligibility</button>
          <button className="btn btn-ghost btn-lg" onClick={() => go("destinations")}>Browse destinations</button>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon, title, body, badge }) {
  return (
    <div className="card card-pad col gap-3" style={{ minHeight: 200 }}>
      <div className="row between middle">
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-tint)", color: "var(--primary)", display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={22} />
        </span>
        {badge && <span className="chip chip-mono">{badge}</span>}
      </div>
      <h3 className="h3" style={{ marginTop: 4 }}>{title}</h3>
      <p className="body">{body}</p>
    </div>
  );
}

/* a quiet, honest preview of the product surface */
function HeroPreview({ go }) {
  return (
    <div className="card rise-in" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row between middle" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
        <span className="row gap-2 middle small" style={{ fontWeight: 500, color: "var(--ink)" }}>
          <Icon name="guide" size={16} style={{ color: "var(--primary)" }} /> Your feed, once you're in
        </span>
        <span className="mono">preview</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr" }}>
        {/* left: feed cards */}
        <div className="col gap-3" style={{ padding: 22, borderRight: "1px solid var(--line)" }}>
          <div className="card card-pad col gap-2" style={{ background: "var(--primary-tint)", borderColor: "transparent" }}>
            <span className="row gap-2 middle" style={{ color: "var(--primary)", fontWeight: 500 }}>
              <Icon name="spark" size={17} /> Your next best step
            </span>
            <p className="small" style={{ color: "var(--ink)" }}>Add your IELTS report to unlock 3 more matches and sharpen your Australia verdict.</p>
          </div>
          <div className="card card-pad col gap-2">
            <div className="row between middle">
              <span className="row gap-2 middle small" style={{ fontWeight: 500, color: "var(--ink)" }}><Flag emoji="🇦🇺" /> Visa update</span>
              <Verdict level="strong" />
            </div>
            <p className="small">Australia's Genuine Student rules — your work gap is an asset here, not a liability.</p>
          </div>
        </div>
        {/* right: guide */}
        <div className="col gap-3" style={{ padding: 22, background: "var(--surface-2)" }}>
          <span className="mono-up mono">Your guide</span>
          <div className="card card-pad" style={{ background: "var(--surface)" }}>
            <p className="small" style={{ color: "var(--ink)" }}>
              You're in good shape for Australia. The highest-impact thing right now is documenting your work gap — want to do it together?
            </p>
          </div>
          <div className="col gap-2">
            {["Is my gap a problem?", "How much must I show?"].map(q => (
              <div key={q} className="chip" style={{ justifyContent: "flex-start" }}>{q}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home });

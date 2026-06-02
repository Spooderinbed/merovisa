/* destination.jsx — destinations index + per-country detail */

const { useState: useStateD } = React;

function Destinations({ go }) {
  const [active, setActive] = useStateD(null);
  if (active) return <CountryDetail c={DB.countryById(active)} back={() => setActive(null)} go={go} />;

  return (
    <div className="wrap fade-in" style={{ paddingTop: 36, paddingBottom: 40 }}>
      <Eyebrow icon="map">Destinations</Eyebrow>
      <h1 className="h1" style={{ marginTop: 12, maxWidth: 640 }}>Six countries, done well — depth and freshness over breadth.</h1>
      <p className="lead" style={{ marginTop: 12 }}>Visa rules, real costs, and what you'll need. Every page shows where the data came from and when we last checked.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 16, marginTop: 32 }}>
        {DB.countries.map(c => (
          <button key={c.id} className="card card-pad col gap-3" onClick={() => setActive(c.id)}
            style={{ textAlign: "left", cursor: "pointer", alignItems: "stretch" }}>
            <div className="row between middle">
              <div className="row gap-3 middle">
                <Flag emoji={c.flag} />
                <span style={{ fontWeight: 500, fontSize: 19 }}>{c.name}</span>
              </div>
              <Verdict level={c.match} />
            </div>
            <p className="body">{c.tagline}</p>
            <hr className="hairline" />
            <div className="row between mono">
              <span className="row gap-1 middle"><Icon name="coins" size={13} /> {c.tuitionRange}</span>
              <span className="row gap-1 middle"><Icon name="refresh" size={13} /> {c.updated}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CountryDetail({ c, back, go }) {
  return (
    <div className="wrap fade-in" style={{ paddingTop: 28, paddingBottom: 50 }}>
      <button className="btn-quiet row gap-2 middle" onClick={back} style={{ borderRadius: "var(--r-pill)", marginBottom: 22 }}>
        <Icon name="arrowLeft" size={17} /> All destinations
      </button>

      {/* hero */}
      <div className="row gap-4 middle" style={{ flexWrap: "wrap", marginBottom: 8 }}>
        <span className="flag" style={{ width: 52, height: 38, fontSize: 26 }}>{c.flag}</span>
        <div className="wgrow" style={{ minWidth: 200 }}>
          <h1 className="display" style={{ fontSize: 46 }}>{c.name}</h1>
        </div>
        <Verdict level={c.match} size="lg" />
      </div>
      <p className="lead" style={{ maxWidth: 620 }}>{c.tagline}</p>
      <div style={{ marginTop: 14 }}><SourceTag source={c.source} updated={c.updated} /></div>

      {/* visa risk alert */}
      <div className="card" style={{ marginTop: 26, padding: 0, overflow: "hidden" }}>
        <div className="row gap-2 middle" style={{ padding: "13px 20px", background: riskBg(c.risk.level), borderBottom: "1px solid var(--line)" }}>
          <Icon name="shield" size={17} style={{ color: riskColor(c.risk.level) }} />
          <span style={{ fontWeight: 500 }}>Current visa note</span>
        </div>
        <div className="col gap-2" style={{ padding: 20 }}>
          <span style={{ fontWeight: 500 }}>{c.risk.title}</span>
          <p className="body">{c.risk.body}</p>
        </div>
      </div>

      {/* facts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 18 }}>
        <Fact icon="coins" label="Tuition" value={c.tuitionRange} />
        <Fact icon="pin" label="Living cost" value={c.livingRange} />
        <Fact icon="lock" label="Financial proof" value={c.financialProof} />
        <Fact icon="briefcase" label="Work rights" value={c.workRights} />
        <Fact icon="cap" label="Post-study" value={c.postStudy} />
        <Fact icon="refresh" label="Last checked" value={`${c.updated} · ${c.source}`} mono />
      </div>

      {/* required documents */}
      <div className="card card-pad col gap-3" style={{ marginTop: 18 }}>
        <h3 className="h3">What you'll need</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {c.docs.map(d => (
            <div key={d} className="row gap-2 middle">
              <span className="dot" style={{ background: "var(--primary)" }} />
              <span className="small" style={{ color: "var(--ink)" }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="card card-pad row between middle" style={{ marginTop: 18, flexWrap: "wrap", gap: 16, background: "var(--primary-tint)", borderColor: "transparent" }}>
        <div className="col gap-1">
          <span style={{ fontWeight: 500, fontSize: 18 }}>Check your standing for {c.name}</span>
          <span className="small" style={{ color: "var(--ink)" }}>Two minutes, no sign-up to start.</span>
        </div>
        <button className="btn btn-primary" onClick={() => go("wizard")}>Check eligibility <Icon name="arrowRight" size={17} /></button>
      </div>
    </div>
  );
}

function Fact({ icon, label, value, mono }) {
  return (
    <div className="card card-pad col gap-2">
      <span className="row gap-2 middle mono-up mono"><Icon name={icon} size={14} style={{ color: "var(--primary)" }} /> {label}</span>
      <span style={{ fontWeight: 500, fontSize: mono ? 13 : 16, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>{value}</span>
    </div>
  );
}

Object.assign(window, { Destinations });

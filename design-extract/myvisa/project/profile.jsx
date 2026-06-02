/* profile.jsx — comprehensive profile hub + completeness meter */

const { useState: useStateProf } = React;

const STATUS = {
  done: { label: "Complete", color: "var(--strong)", tint: "var(--strong-tint)", icon: "check" },
  partial: { label: "Partial", color: "var(--possible)", tint: "var(--possible-tint)", icon: "spark" },
  empty: { label: "Not started", color: "var(--ink-faint)", tint: "var(--bg-tint)", icon: "doc" },
};

function Profile({ go }) {
  const [open, setOpen] = useStateProf(null);
  const comp = Engine.completeness();
  const secs = DB.profileSections;

  return (
    <div className="wrap fade-in" style={{ paddingTop: 32, paddingBottom: 50 }}>
      <Eyebrow icon="user">Your profile</Eyebrow>
      <h1 className="h1" style={{ marginTop: 12, maxWidth: 620 }}>The fuller your profile, the sharper everything gets.</h1>
      <p className="lead" style={{ marginTop: 10 }}>Every section you complete improves your matches, scores and visa case. Add what you can, when you can.</p>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 22, marginTop: 28, alignItems: "start" }}>
        {/* completeness */}
        <aside className="card card-pad col gap-4 hide-mobile" style={{ position: "sticky", top: 82 }}>
          <span className="mono-up mono">Completeness</span>
          <div className="row gap-4 middle">
            <div style={{ position: "relative", width: 84, height: 84, flex: "none" }}>
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r="36" fill="none" stroke="var(--bg-tint)" strokeWidth="8" />
                <circle cx="42" cy="42" r="36" fill="none" stroke="var(--primary)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 36} strokeDashoffset={2 * Math.PI * 36 * (1 - comp.pct / 100)}
                  transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .9s var(--ease)" }} />
              </svg>
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 500, fontFamily: "var(--font-mono)", fontSize: 17 }}>{comp.pct}%</span>
            </div>
            <div className="col gap-1">
              <span className="small"><strong style={{ color: "var(--strong)", fontWeight: 500 }}>{comp.done}</strong> complete</span>
              <span className="small"><strong style={{ color: "var(--possible)", fontWeight: 500 }}>{comp.partial}</strong> partial</span>
              <span className="small"><strong style={{ color: "var(--ink-faint)", fontWeight: 500 }}>{comp.empty}</strong> not started</span>
            </div>
          </div>
          <hr className="hairline" />
          <p className="small">Finishing your <strong style={{ fontWeight: 500 }}>partial</strong> sections is the fastest lift right now.</p>
          <button className="btn btn-primary btn-sm btn-full" onClick={() => go("plan")}>See what to do next</button>
        </aside>

        {/* sections */}
        <div className="col gap-2">
          {secs.map(sec => {
            const st = STATUS[sec.status];
            const isOpen = open === sec.key;
            return (
              <div key={sec.key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button className="row gap-3 middle" onClick={() => setOpen(isOpen ? null : sec.key)}
                  style={{ width: "100%", padding: "16px 20px", background: "none", border: 0, textAlign: "left" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: st.tint, color: st.color, display: "grid", placeItems: "center", flex: "none" }}>
                    <Icon name={sec.icon} size={18} />
                  </span>
                  <div className="col wgrow">
                    <span style={{ fontWeight: 500 }}>{sec.title}</span>
                    <span className="small" style={{ color: "var(--ink-faint)" }}>{sec.summary}</span>
                  </div>
                  <span className="tag" style={{ background: st.tint, color: st.color, flex: "none" }}>{st.label}</span>
                  <Icon name="chevronDown" size={18} style={{ color: "var(--ink-faint)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }} />
                </button>
                {isOpen && (
                  <div className="col gap-3 rise-in" style={{ padding: "4px 20px 20px 70px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                      {sec.fields.map(([label, value], i) => (
                        <div key={i} className="col" style={{ gap: 2 }}>
                          <span className="mono">{label}</span>
                          <span className="small" style={{ color: value === "—" || /not |^No$/i.test(value) ? "var(--ink-faint)" : "var(--ink)", fontWeight: 500 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {sec.status !== "done" && (
                      <button className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }}>
                        <Icon name="spark" size={15} /> {sec.status === "empty" ? "Add this section" : "Complete this section"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Profile });

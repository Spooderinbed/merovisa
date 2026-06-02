/* components.jsx — shared primitives & chrome */

const { useState } = React;

/* ---------- logo ---------- */
function Logo({ onClick }) {
  return (
    <button onClick={onClick} className="row gap-2 middle" style={{ background: "none", border: 0, padding: 0 }}>
      <span className="logo-mark"><Icon name="cap" size={17} /></span>
      <span style={{ fontWeight: 500, fontSize: 18, letterSpacing: "-0.02em", color: "var(--ink)" }}>
        MyVisa
      </span>
    </button>
  );
}

/* ---------- verdict band config ---------- */
const VERDICT = {
  strong:   { label: "Strong match",  cls: "tag-strong",   color: "var(--strong)",   tint: "var(--strong-tint)",   blurb: "Your profile fits well." },
  possible: { label: "Possible",      cls: "tag-possible", color: "var(--possible)", tint: "var(--possible-tint)", blurb: "Achievable with care." },
  reach:    { label: "Reach",         cls: "tag-reach",    color: "var(--reach)",    tint: "var(--reach-tint)",    blurb: "Ambitious for now." },
};

function Verdict({ level, size = "md" }) {
  const v = VERDICT[level] || VERDICT.possible;
  const dot = <span className="dot" style={{ background: v.color }} />;
  return <span className={"tag " + v.cls} style={size === "lg" ? { fontSize: 15, padding: "7px 15px" } : null}>{dot}{v.label}</span>;
}

/* ---------- factor bar ---------- */
function FactorBar({ label, value, level = "strong", note }) {
  const color = VERDICT[level]?.color || "var(--primary)";
  return (
    <div className="col gap-2">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span style={{ fontSize: 15.5, fontWeight: 500 }}>{label}</span>
        {note && <span className="small" style={{ color: "var(--ink-faint)" }}>{note}</span>}
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: value + "%", background: color }} />
      </div>
    </div>
  );
}

/* ---------- flag pill ---------- */
function Flag({ emoji }) {
  return <span className="flag">{emoji}</span>;
}

/* ---------- theme toggle ---------- */
function ThemeToggle({ dark, onToggle }) {
  return (
    <button className="btn-quiet" onClick={onToggle} aria-label="Toggle theme"
      style={{ borderRadius: "var(--r-pill)", width: 40, height: 40, padding: 0, display: "grid", placeItems: "center" }}>
      <Icon name={dark ? "sun" : "moon"} size={19} />
    </button>
  );
}

/* ---------- top app bar ---------- */
function AppBar({ view, go, loggedIn, dark, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const navItems = loggedIn
    ? [["dashboard", "Home"], ["matches", "Matches"], ["plan", "My plan"], ["profile", "Profile"], ["guide", "Guide"], ["destinations", "Destinations"]]
    : [["how", "How it works"], ["destinations", "Destinations"], ["trust", "Why trust us"]];

  return (
    <header className="appbar">
      <div className="wrap row between" style={{ height: 66 }}>
        <div className="row gap-4 middle">
          <Logo onClick={() => go(loggedIn ? "dashboard" : "home")} />
          <nav className="row gap-4 middle hide-mobile" style={{ marginLeft: 8 }}>
            {navItems.map(([k, label]) => (
              <button key={k} className="navlink" data-active={view === k}
                style={{ background: "none", border: 0 }}
                onClick={() => go(loggedIn && (k === "how" || k === "trust") ? "home" : k)}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="row gap-2 middle">
          <ThemeToggle dark={dark} onToggle={onToggleTheme} />
          {loggedIn ? (
            <>
              <button className="btn-quiet hide-mobile" style={{ borderRadius: "var(--r-pill)", width: 40, height: 40, padding: 0, display: "grid", placeItems: "center" }}>
                <Icon name="bell" size={19} />
              </button>
              <div className="avatar" title={DB.student.name}>{DB.student.initials}</div>
            </>
          ) : (
            <>
              <button className="btn btn-quiet hide-mobile" onClick={() => go("auth")}>Sign in</button>
              <button className="btn btn-primary btn-sm" onClick={() => go("wizard")}>Check eligibility</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- footer with trust line ---------- */
function Footer({ go }) {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 80, background: "var(--surface)" }}>
      <div className="wrap" style={{ padding: "40px 28px 48px" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 24 }}>
          <div className="col gap-3" style={{ maxWidth: 340 }}>
            <Logo onClick={() => go("home")} />
            <p className="small">An honest reality check before you pay anyone. No agents, no hidden commissions.</p>
          </div>
          <div className="row gap-5" style={{ flexWrap: "wrap" }}>
            <FootCol title="Product" links={["Eligibility", "Destinations", "AI guide", "SOP coach"]} />
            <FootCol title="Trust" links={["How we score", "Our data sources", "Why no agents", "Privacy"]} />
            <FootCol title="Company" links={["About", "Contact", "Careers"]} />
          </div>
        </div>
        <hr className="hairline" style={{ margin: "32px 0 20px" }} />
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="mono row gap-2 middle">
            <Icon name="shield" size={14} style={{ color: "var(--primary)" }} />
            {DB.trustLine}
          </span>
          <span className="mono">© 2026 MyVisa</span>
        </div>
      </div>
    </footer>
  );
}
function FootCol({ title, links }) {
  return (
    <div className="col gap-2">
      <span className="mono-up mono" style={{ marginBottom: 4 }}>{title}</span>
      {links.map(l => <a key={l} className="small" style={{ color: "var(--ink-soft)" }} href="#">{l}</a>)}
    </div>
  );
}

/* ---------- section heading ---------- */
function Eyebrow({ children, icon }) {
  return (
    <span className="row gap-2 middle mono-up mono" style={{ color: "var(--primary)" }}>
      {icon && <Icon name={icon} size={14} />}{children}
    </span>
  );
}

/* ---------- source / freshness micro-label (transparency) ---------- */
function SourceTag({ source, updated }) {
  return (
    <span className="row gap-2 middle mono" style={{ flexWrap: "wrap" }}>
      <Icon name="refresh" size={13} />
      <span>updated {updated}</span>
      <span style={{ opacity: .5 }}>·</span>
      <a href="#" className="row gap-1 middle" style={{ color: "var(--primary)" }}>
        {source}<Icon name="external" size={12} />
      </a>
    </span>
  );
}

Object.assign(window, { Logo, Verdict, VERDICT, FactorBar, Flag, ThemeToggle, AppBar, Footer, Eyebrow, SourceTag });

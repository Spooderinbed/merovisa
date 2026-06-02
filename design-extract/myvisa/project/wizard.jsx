/* wizard.jsx — eligibility onboarding. Two layouts: one-per-screen ("steps") and "grouped". */

const { useState: useStateW } = React;

const HOME_COUNTRIES = [
  { v: "Nepal", flag: "🇳🇵" }, { v: "India", flag: "🇮🇳" },
  { v: "Nigeria", flag: "🇳🇬" }, { v: "Pakistan", flag: "🇵🇰" },
  { v: "Bangladesh", flag: "🇧🇩" }, { v: "Other", flag: "🌐" },
];
const GRADE_SYSTEMS = {
  Nepal: ["Percentage (Nepal)", "CGPA-4"],
  India: ["Percentage (India)", "CGPA-10"],
  Nigeria: ["CGPA-5", "Percentage"],
  default: ["Percentage", "CGPA-4", "CGPA-10", "CGPA-5"],
};
const LEVELS = ["Higher secondary (+2)", "Bachelor's degree", "Master's degree"];
const GAP_REASONS = [
  ["briefcase", "Worked or interned"],
  ["doc", "Retook or improved exams"],
  ["user", "Health or family reasons"],
  ["spark", "Started something of my own"],
];
const SPONSORS = ["Self-funded", "Parents / family", "Education loan", "Mixed"];
const GOALS = [
  ["match", "Permanent residency", "Settle long-term after study"],
  ["coins", "Lowest total cost", "Best value for money"],
  ["cap", "Highest-ranked university", "Prestige and brand"],
  ["clock", "Fastest admission", "Start as soon as possible"],
  ["briefcase", "Best employment outcomes", "Strong job prospects"],
  ["spark", "Research opportunities", "Academic and research depth"],
];

function Wizard({ go, onComplete, layout = "steps", initial }) {
  const [data, setData] = useStateW(initial || {
    homeCountry: "Nepal", level: "Bachelor's degree",
    gradeSystem: "Percentage (Nepal)", grade: 72,
    englishStatus: "Taken", ielts: 7.0,
    hasGap: true, gapYears: 1, gapReasons: ["Worked or interned"],
    destination: "au", budget: 38000, sponsor: "Education loan",
    goal: "Permanent residency",
  });
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  if (layout === "grouped") return <WizardGrouped {...{ data, set, go, onComplete }} />;
  return <WizardSteps {...{ data, set, go, onComplete }} />;
}

/* ============ one-decision-per-screen ============ */
function WizardSteps({ data, set, go, onComplete }) {
  const [step, setStep] = useStateW(0);
  // gap detail screen only shows if hasGap
  const steps = [
    "home", "education", "english", "gap", ...(data.hasGap ? ["gapDetail"] : []),
    "destination", "budget", "goal",
  ];
  const total = steps.length;
  const key = steps[step];
  const next = () => step < total - 1 ? setStep(step + 1) : onComplete(data);
  const back = () => step > 0 ? setStep(step - 1) : go("home");

  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 40, paddingBottom: 80, minHeight: "calc(100vh - 66px)" }}>
      {/* progress */}
      <div className="row between middle" style={{ marginBottom: 36 }}>
        <button className="btn-quiet row gap-2 middle" onClick={back} style={{ borderRadius: "var(--r-pill)" }}>
          <Icon name="arrowLeft" size={17} /> Back
        </button>
        <span className="mono">step {step + 1} of {total}</span>
      </div>
      <ProgressDots total={total} current={step} />

      <div key={key} className="rise-in" style={{ marginTop: 40 }}>
        <StepBody k={key} data={data} set={set} />
      </div>

      <div className="row between middle" style={{ marginTop: 44 }}>
        <button className="btn-quiet" onClick={() => go("home")}>Save & exit</button>
        <button className="btn btn-primary btn-lg" onClick={next}>
          {step === total - 1 ? <>See where I stand <Icon name="arrowRight" size={18} /></> : <>Continue <Icon name="arrowRight" size={18} /></>}
        </button>
      </div>
    </div>
  );
}

function ProgressDots({ total, current }) {
  return (
    <div className="row gap-2" style={{ width: "100%" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="bar-track" style={{ height: 5, background: i <= current ? "var(--primary)" : "var(--bg-tint)", transition: "background .3s var(--ease)" }} />
      ))}
    </div>
  );
}

/* ============ shared step bodies ============ */
function StepBody({ k, data, set }) {
  if (k === "home") return (
    <StepShell title="Where are you from?" sub="This sets your grade scale and which visa rules we show you.">
      <div className="col gap-2">
        {HOME_COUNTRIES.map(c => (
          <button key={c.v} className="opt" data-sel={data.homeCountry === c.v}
            onClick={() => { set("homeCountry", c.v); set("gradeSystem", (GRADE_SYSTEMS[c.v] || GRADE_SYSTEMS.default)[0]); }}>
            <Flag emoji={c.flag} />
            <span className="wgrow" style={{ fontWeight: 500 }}>{c.v}</span>
            <Mark on={data.homeCountry === c.v} />
          </button>
        ))}
      </div>
    </StepShell>
  );

  if (k === "education") return (
    <StepShell title="Your education" sub="Enter your result in your own grade system — we convert it for each destination.">
      <FieldLabel>Latest level completed</FieldLabel>
      <div className="col gap-2" style={{ marginBottom: 24 }}>
        {LEVELS.map(l => (
          <button key={l} className="opt" data-sel={data.level === l} onClick={() => set("level", l)}>
            <Icon name="cap" size={19} style={{ color: data.level === l ? "var(--primary)" : "var(--ink-faint)" }} />
            <span className="wgrow" style={{ fontWeight: 500 }}>{l}</span>
            <Mark on={data.level === l} />
          </button>
        ))}
      </div>
      <FieldLabel>Grade system</FieldLabel>
      <div className="seg" style={{ marginBottom: 22, flexWrap: "wrap" }}>
        {(GRADE_SYSTEMS[data.homeCountry] || GRADE_SYSTEMS.default).map(g => (
          <button key={g} data-on={data.gradeSystem === g} onClick={() => set("gradeSystem", g)}>{g}</button>
        ))}
      </div>
      <FieldLabel>Your latest result</FieldLabel>
      <GradeInput system={data.gradeSystem} value={data.grade} onChange={v => set("grade", v)} />
    </StepShell>
  );

  if (k === "english") {
    const taken = data.englishStatus === "Taken";
    return (
      <StepShell title="English proficiency" sub="Most destinations need proof of English. Even a planned test helps us tailor your matches.">
        <FieldLabel>Where are you with an English test?</FieldLabel>
        <div className="seg" style={{ marginBottom: taken ? 24 : 0 }}>
          {["Not taken", "Booked", "Taken"].map(s => (
            <button key={s} data-on={data.englishStatus === s} onClick={() => set("englishStatus", s)}>{s}</button>
          ))}
        </div>
        {taken && (
          <div className="card card-pad col gap-4">
            <FieldLabel>IELTS overall band (or equivalent)</FieldLabel>
            <div className="row center" style={{ alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 500 }}>{Number(data.ielts).toFixed(1)}</span>
              <span className="body">/ 9.0</span>
            </div>
            <input type="range" className="slider" min="4" max="9" step="0.5"
              value={data.ielts} onChange={e => set("ielts", +e.target.value)} />
            <p className="small" style={{ textAlign: "center", color: "var(--ink-faint)" }}>You can add per-section scores later in your profile.</p>
          </div>
        )}
      </StepShell>
    );
  }

  if (k === "gap") return (
    <StepShell title="Any gap in your studies?" sub="A gap is completely normal. Explaining it well actually strengthens your visa case.">
      <div className="col gap-2">
        {[["No gap", false], ["Yes, there's a gap", true]].map(([label, val]) => (
          <button key={label} className="opt" data-sel={data.hasGap === val} onClick={() => set("hasGap", val)}>
            <span className="wgrow" style={{ fontWeight: 500 }}>{label}</span>
            <Mark on={data.hasGap === val} />
          </button>
        ))}
      </div>
    </StepShell>
  );

  if (k === "gapDetail") return (
    <StepShell title="What were you doing?" sub="Pick all that apply. We'll help you turn this into a clear statement later.">
      <FieldLabel>How long was the gap?</FieldLabel>
      <div className="seg" style={{ marginBottom: 24 }}>
        {[1, 2, 3].map(y => (
          <button key={y} data-on={data.gapYears === y} onClick={() => set("gapYears", y)}>{y} {y === 1 ? "year" : "years"}{y === 3 ? "+" : ""}</button>
        ))}
      </div>
      <FieldLabel>Reasons</FieldLabel>
      <div className="col gap-2">
        {GAP_REASONS.map(([ic, label]) => {
          const on = data.gapReasons.includes(label);
          return (
            <button key={label} className="opt" data-sel={on}
              onClick={() => set("gapReasons", on ? data.gapReasons.filter(r => r !== label) : [...data.gapReasons, label])}>
              <Icon name={ic} size={19} style={{ color: on ? "var(--primary)" : "var(--ink-faint)" }} />
              <span className="wgrow" style={{ fontWeight: 500 }}>{label}</span>
              <span className="opt-mark" style={{ borderRadius: 6 }}>{on && <Icon name="check" size={14} style={{ color: "var(--on-primary)" }} />}</span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );

  if (k === "destination") return (
    <StepShell title="Where do you want to study?" sub="You can compare others later — pick the one you're most curious about.">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {DB.countries.map(c => (
          <button key={c.id} className="opt" data-sel={data.destination === c.id} onClick={() => set("destination", c.id)} style={{ padding: "16px 18px" }}>
            <Flag emoji={c.flag} />
            <span className="wgrow" style={{ fontWeight: 500 }}>{c.name}</span>
            <Mark on={data.destination === c.id} />
          </button>
        ))}
      </div>
    </StepShell>
  );

  if (k === "budget") {
    const c = DB.countryById(data.destination);
    return (
      <StepShell title="Your yearly budget" sub="Tuition plus living costs, per year, in USD. A rough figure is fine.">
        <div className="card card-pad col gap-4">
          <div className="row center" style={{ alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 44, fontWeight: 500, letterSpacing: "-0.02em" }}>${data.budget.toLocaleString()}</span>
            <span className="body">/ year</span>
          </div>
          <input type="range" className="slider" min="8000" max="80000" step="1000"
            value={data.budget} onChange={e => set("budget", +e.target.value)} />
          <div className="row between mono">
            <span>$8k</span><span>$80k</span>
          </div>
          <p className="small row gap-2 middle" style={{ justifyContent: "center", color: "var(--ink-faint)" }}>
            <Icon name="coins" size={15} /> Typical for {c.name}: {c.tuitionRange.replace(" / yr", "")} tuition + living
          </p>
        </div>
        <div style={{ marginTop: 24 }}>
          <FieldLabel>How will you fund this?</FieldLabel>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {SPONSORS.map(s => (
              <button key={s} className="chip" data-sel={data.sponsor === s} onClick={() => set("sponsor", s)}
                style={{ cursor: "pointer", borderColor: data.sponsor === s ? "var(--primary)" : "var(--line-2)",
                  background: data.sponsor === s ? "var(--primary-tint)" : "var(--surface)",
                  color: data.sponsor === s ? "var(--primary)" : "var(--ink-soft)" }}>{s}</button>
            ))}
          </div>
        </div>
      </StepShell>
    );
  }

  if (k === "goal") return (
    <StepShell title="What matters most to you?" sub="This shapes how we rank your matches — the same profile sorts differently for different goals.">
      <div className="col gap-2">
        {GOALS.map(([ic, label, sub]) => (
          <button key={label} className="opt" data-sel={data.goal === label} onClick={() => set("goal", label)}>
            <Icon name={ic} size={20} style={{ color: data.goal === label ? "var(--primary)" : "var(--ink-faint)" }} />
            <div className="col wgrow">
              <span style={{ fontWeight: 500 }}>{label}</span>
              <span className="small" style={{ color: "var(--ink-faint)" }}>{sub}</span>
            </div>
            <Mark on={data.goal === label} />
          </button>
        ))}
      </div>
    </StepShell>
  );
  return null;
}

function StepShell({ title, sub, children }) {
  return (
    <div className="col gap-3">
      <h2 className="h1">{title}</h2>
      <p className="lead" style={{ marginBottom: 14 }}>{sub}</p>
      {children}
    </div>
  );
}
function FieldLabel({ children }) {
  return <span className="mono-up mono" style={{ display: "block", marginBottom: 10 }}>{children}</span>;
}
function Mark({ on }) {
  return <span className="opt-mark">{on && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--on-primary)" }} />}</span>;
}

function GradeInput({ system, value, onChange }) {
  const isPct = system.toLowerCase().includes("percent");
  const max = isPct ? 100 : system.includes("10") ? 10 : system.includes("5") ? 5 : 4;
  const unit = isPct ? "%" : `/ ${max}`;
  return (
    <div className="card card-pad col gap-4">
      <div className="row center" style={{ alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 44, fontWeight: 500 }}>{isPct ? value : (value / 100 * max).toFixed(2)}</span>
        <span className="body">{unit}</span>
      </div>
      <input type="range" className="slider" min={isPct ? 40 : 0} max={isPct ? 100 : 100} step="1"
        value={isPct ? value : value} onChange={e => onChange(+e.target.value)} />
      <p className="small" style={{ textAlign: "center", color: "var(--ink-faint)" }}>
        Drag to your latest {isPct ? "percentage" : "grade"} — you can refine it later.
      </p>
    </div>
  );
}

/* ============ grouped layout (single screen) ============ */
function WizardGrouped({ data, set, go, onComplete }) {
  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <button className="btn-quiet row gap-2 middle" onClick={() => go("home")} style={{ borderRadius: "var(--r-pill)", marginBottom: 24 }}>
        <Icon name="arrowLeft" size={17} /> Back
      </button>
      <Eyebrow>Eligibility check</Eyebrow>
      <h2 className="h1" style={{ marginTop: 12 }}>A few things about you</h2>
      <p className="lead" style={{ marginTop: 12, marginBottom: 32 }}>Everything on one page — no result is hidden behind sign-up.</p>

      <div className="col gap-3">
        <GroupCard n="1" title="Where you're from">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {HOME_COUNTRIES.map(c => (
              <button key={c.v} className="opt" data-sel={data.homeCountry === c.v} style={{ padding: "12px 14px" }}
                onClick={() => { set("homeCountry", c.v); set("gradeSystem", (GRADE_SYSTEMS[c.v] || GRADE_SYSTEMS.default)[0]); }}>
                <Flag emoji={c.flag} /><span style={{ fontWeight: 500, fontSize: 15 }}>{c.v}</span>
              </button>
            ))}
          </div>
        </GroupCard>

        <GroupCard n="2" title="Your education">
          <div className="seg" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            {LEVELS.map(l => <button key={l} data-on={data.level === l} onClick={() => set("level", l)}>{l}</button>)}
          </div>
          <div className="seg" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            {(GRADE_SYSTEMS[data.homeCountry] || GRADE_SYSTEMS.default).map(g =>
              <button key={g} data-on={data.gradeSystem === g} onClick={() => set("gradeSystem", g)}>{g}</button>)}
          </div>
          <GradeInput system={data.gradeSystem} value={data.grade} onChange={v => set("grade", v)} />
        </GroupCard>

        <GroupCard n="3" title="Study gap">
          <div className="seg" style={{ marginBottom: data.hasGap ? 16 : 0 }}>
            {[["No gap", false], ["Yes", true]].map(([l, v]) => <button key={l} data-on={data.hasGap === v} onClick={() => set("hasGap", v)}>{l}</button>)}
          </div>
          {data.hasGap && (
            <div className="col gap-2">
              {GAP_REASONS.map(([ic, label]) => {
                const on = data.gapReasons.includes(label);
                return <button key={label} className="opt" data-sel={on} style={{ padding: "12px 16px" }}
                  onClick={() => set("gapReasons", on ? data.gapReasons.filter(r => r !== label) : [...data.gapReasons, label])}>
                  <Icon name={ic} size={18} style={{ color: on ? "var(--primary)" : "var(--ink-faint)" }} /><span className="wgrow" style={{ fontWeight: 500 }}>{label}</span>
                  <span className="opt-mark" style={{ borderRadius: 6 }}>{on && <Icon name="check" size={13} style={{ color: "var(--on-primary)" }} />}</span></button>;
              })}
            </div>
          )}
        </GroupCard>

        <GroupCard n="4" title="Destination">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {DB.countries.map(c => (
              <button key={c.id} className="opt" data-sel={data.destination === c.id} style={{ padding: "12px 14px" }} onClick={() => set("destination", c.id)}>
                <Flag emoji={c.flag} /><span style={{ fontWeight: 500, fontSize: 15 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </GroupCard>

        <GroupCard n="5" title="Yearly budget (USD)">
          <div className="row center" style={{ alignItems: "baseline", gap: 4, marginBottom: 16 }}>
            <span style={{ fontSize: 34, fontWeight: 500 }}>${data.budget.toLocaleString()}</span><span className="body">/ year</span>
          </div>
          <input type="range" className="slider" min="8000" max="80000" step="1000" value={data.budget} onChange={e => set("budget", +e.target.value)} />
        </GroupCard>
      </div>

      <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 28 }} onClick={() => onComplete(data)}>
        See where I stand <Icon name="arrowRight" size={18} />
      </button>
    </div>
  );
}

function GroupCard({ n, title, children }) {
  return (
    <div className="card card-pad">
      <div className="row gap-2 middle" style={{ marginBottom: 16 }}>
        <span className="mono" style={{ color: "var(--primary)", fontSize: 15 }}>{n}</span>
        <h3 className="h3">{title}</h3>
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { Wizard });

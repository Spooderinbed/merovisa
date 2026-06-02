/* app.jsx — router, theme, tweaks */

const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "verdictStyle": "scale",
  "wizardLayout": "steps",
  "primary": "teal",
  "font": "Hanken Grotesk",
  "dark": false,
  "fontScale": 17,
  "homeLayout": "command"
}/*EDITMODE-END*/;

const PRIMARY_PRESETS = {
  teal:  { c: "#0f5e54", ink: "#0c4a42", on: "#fcfdfb", dc: "#4eb39f", dink: "#6fc4b2", don: "#08231f" },
  green: { c: "#1f6d4a", ink: "#185639", on: "#fcfdfb", dc: "#5bbd8c", dink: "#7bcda4", don: "#072019" },
  blue:  { c: "#1b4f72", ink: "#143b56", on: "#fcfdfb", dc: "#5b9bc9", dink: "#7fb3d6", don: "#08202e" },
  plum:  { c: "#5b3a6e", ink: "#472d56", on: "#fcfdfb", dc: "#a984c0", dink: "#bb9bce", don: "#1e1226" },
};

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function applyTheme(t) {
  const root = document.documentElement;
  root.setAttribute("data-theme", t.dark ? "dark" : "light");
  const p = PRIMARY_PRESETS[t.primary] || PRIMARY_PRESETS.teal;
  const c = t.dark ? p.dc : p.c, ink = t.dark ? p.dink : p.ink, on = t.dark ? p.don : p.on;
  root.style.setProperty("--primary", c);
  root.style.setProperty("--primary-ink", ink);
  root.style.setProperty("--on-primary", on);
  root.style.setProperty("--primary-tint", hexA(c, t.dark ? 0.16 : 0.08));
  root.style.setProperty("--primary-tint-2", hexA(c, t.dark ? 0.28 : 0.16));
  root.style.setProperty("--font-sans", `'${t.font}', system-ui, sans-serif`);
  document.body.style.fontSize = t.fontScale + "px";
}

const FONT_MAP = {
  "Hanken Grotesk": "Hanken+Grotesk:wght@400;500",
  "Figtree": "Figtree:wght@400;500",
  "Instrument Sans": "Instrument+Sans:wght@400;500",
  "Newsreader": "Newsreader:wght@400;500",
};
function ensureFont(name) {
  if (!FONT_MAP[name]) return;
  const id = "gf-" + name.replace(/\W/g, "");
  if (document.getElementById(id)) return;
  const l = document.createElement("link");
  l.id = id; l.rel = "stylesheet";
  l.href = `https://fonts.googleapis.com/css2?family=${FONT_MAP[name]}&display=swap`;
  document.head.appendChild(l);
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useStateApp("home");
  const [profile, setProfile] = useStateApp(null);
  const [loggedIn, setLoggedIn] = useStateApp(false);

  useEffectApp(() => { ensureFont(t.font); applyTheme(t); }, [t.dark, t.primary, t.font, t.fontScale]);

  const go = (v) => { setView(v); window.scrollTo({ top: 0 }); };
  const toggleTheme = () => setTweak("dark", !t.dark);

  const standalonePages = { wizard: 1, results: 1, auth: 1 };
  const showChrome = !standalonePages[view] || loggedIn === "force"; // wizard/results/auth are focused
  const isMarketing = !loggedIn && (view === "home" || view === "destinations");

  let page;
  if (view === "home") page = <Home go={go} />;
  else if (view === "wizard") page = <Wizard go={go} layout={t.wizardLayout} initial={profile}
    onComplete={(d) => { setProfile(d); go("results"); }} />;
  else if (view === "results") page = <Results go={go} data={profile} variant={t.verdictStyle}
    onSave={(d) => { setProfile(d); go("auth"); }} />;
  else if (view === "auth") page = <Auth go={go} onAuthed={() => { setLoggedIn(true); go("dashboard"); }} />;
  else if (view === "dashboard") page = t.homeLayout === "feed"
    ? <Dashboard go={go} data={profile} />
    : <CommandCentre go={go} data={profile} />;
  else if (view === "guide") page = <Guide go={go} />;
  else if (view === "checklist") page = <Checklist go={go} />;
  else if (view === "matches") page = <Matches go={go} />;
  else if (view === "plan") page = <Plan go={go} data={profile} />;
  else if (view === "profile") page = <Profile go={go} />;
  else if (view === "destinations") page = <Destinations go={go} />;
  else page = <Home go={go} />;

  // chrome rules: always show appbar except on the focused wizard/results/auth flow
  const focused = standalonePages[view];

  return (
    <>
      {!focused && <AppBar view={view} go={go} loggedIn={loggedIn} dark={t.dark} onToggleTheme={toggleTheme} />}
      {focused && <FocusBar go={go} dark={t.dark} onToggleTheme={toggleTheme} />}
      <main>{page}</main>
      {(view === "home" || view === "destinations" || view === "checklist") && <Footer go={go} />}

      <TweaksPanel>
        <TweakSection label="Presentation" />
        <TweakRadio label="Sign-in home" value={t.homeLayout}
          options={["command", "feed"]} onChange={v => setTweak("homeLayout", v)} />
        <TweakRadio label="Verdict style" value={t.verdictStyle}
          options={["scale", "card"]} onChange={v => setTweak("verdictStyle", v)} />
        <TweakRadio label="Wizard layout" value={t.wizardLayout}
          options={["steps", "grouped"]} onChange={v => setTweak("wizardLayout", v)} />
        <TweakSection label="Theme" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={v => setTweak("dark", v)} />
        <TweakColor label="Primary" value={PRIMARY_PRESETS[t.primary].c}
          options={Object.values(PRIMARY_PRESETS).map(p => p.c)}
          onChange={(hex) => {
            const key = Object.keys(PRIMARY_PRESETS).find(k => PRIMARY_PRESETS[k].c === hex);
            setTweak("primary", key || "teal");
          }} />
        <TweakSection label="Type" />
        <TweakSelect label="Typeface" value={t.font}
          options={Object.keys(FONT_MAP)} onChange={v => setTweak("font", v)} />
        <TweakSlider label="Base size" value={t.fontScale} min={15} max={19} step={1} unit="px"
          onChange={v => setTweak("fontScale", v)} />
      </TweaksPanel>
    </>
  );
}

/* minimal top bar for the focused eligibility flow */
function FocusBar({ go, dark, onToggleTheme }) {
  return (
    <header className="appbar">
      <div className="wrap row between" style={{ height: 60 }}>
        <Logo onClick={() => go("home")} />
        <div className="row gap-3 middle">
          <span className="mono row gap-2 middle hide-mobile"><Icon name="shield" size={13} style={{ color: "var(--primary)" }} /> no sign-up to start</span>
          <ThemeToggle dark={dark} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

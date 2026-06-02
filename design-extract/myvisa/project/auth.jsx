/* auth.jsx — lightweight save prompt, offered only after a result */

const { useState: useStateA } = React;

function Auth({ go, onAuthed }) {
  const [email, setEmail] = useStateA("");
  const [sent, setSent] = useStateA(false);
  return (
    <div className="wrap-narrow fade-in" style={{ paddingTop: 64, paddingBottom: 80, maxWidth: 460 }}>
      <div className="col gap-2" style={{ alignItems: "center", textAlign: "center", marginBottom: 28 }}>
        <span className="logo-mark" style={{ width: 44, height: 44, borderRadius: 12 }}><Icon name="cap" size={24} /></span>
        <h2 className="h1" style={{ marginTop: 12 }}>Save your result</h2>
        <p className="lead">We'll keep your verdict and checklist safe so you can pick up where you left off. No spam, no agents calling you.</p>
      </div>

      <div className="card card-pad col gap-3">
        <div className="col gap-2">
          <span className="mono-up mono">Email</span>
          <input className="field" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-lg btn-full" onClick={() => onAuthed()}>
          Create account & save <Icon name="arrowRight" size={18} />
        </button>
        <div className="row gap-3 middle" style={{ margin: "4px 0" }}>
          <hr className="hairline wgrow" /><span className="mono">or</span><hr className="hairline wgrow" />
        </div>
        <button className="btn btn-ghost btn-full" onClick={() => onAuthed()}>
          <Icon name="user" size={18} /> Continue with Google
        </button>
        <p className="small row gap-2 middle" style={{ justifyContent: "center", color: "var(--ink-faint)", marginTop: 4 }}>
          <Icon name="lock" size={14} /> Your profile is private. We never sell your data.
        </p>
      </div>

      <button className="btn-quiet btn-full" style={{ marginTop: 14 }} onClick={() => go("results")}>Back to my result</button>
    </div>
  );
}

Object.assign(window, { Auth });

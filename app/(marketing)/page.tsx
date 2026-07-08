import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HeroMarker } from "@/components/marketing/hero-marker";
import { Reveal } from "@/components/marketing/reveal";
import { VerdictPanel } from "@/components/marketing/verdict-panel";
import { PlanSteps } from "@/components/marketing/plan-steps";
import { DocumentsChecklist } from "@/components/marketing/documents-checklist";
import { GuideThread } from "@/components/marketing/guide-thread";
import { FreshnessTable } from "@/components/marketing/freshness-table";
import { SparkleCta } from "@/components/marketing/sparkle-cta";
import "./landing.css";

export default async function HomePage() {
  // Signed-in users skip the marketing landing; drop them on the dashboard.
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mv-landing">
      {/* hidden SVG filter for the hand-drawn hero marker (§4.1) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
        <filter id="hero-rough" x="-10%" y="-10%" width="120%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-top">
            <div className="eyebrow">For students applying abroad</div>
            <h1>An honest answer before you <HeroMarker>pay anyone.</HeroMarker></h1>
            <p className="sub">Where do you actually stand academically, financially, and on visa risk?</p>
            <p className="prov">Built on official Home Affairs and university data. Every figure shows its source and date.</p>
            <div className="cta-row">
              <Link className="cta" href="/assess">Check your eligibility <span className="arw">→</span></Link>
              <span className="meta">9 quick questions · no account needed</span>
            </div>
          </div>

          <div className="stage"><VerdictPanel /></div>

          <div className="proof">
            <div className="pf"><span className="dot" />Official Home Affairs & university data</div>
            <div className="pf"><span className="dot" />Every figure sourced and dated</div>
            <div className="pf"><span className="dot" />Free, no sign-up to start</div>
          </div>
        </div>
      </section>

      {/* PLAN */}
      <section className="psec" id="how">
        <div className="wrap">
          <div className="split">
            <div className="s-copy">
              <div className="section-eyebrow">From verdict to plan</div>
              <h2>The answer becomes a plan.</h2>
              <p className="s-lede">Not a generic to-do list. A sequenced path built from your verdict, one step live at a time.</p>
              <Link className="lnk" href="/assess">See a sample plan <span className="arw">→</span></Link>
            </div>
            <Reveal><PlanSteps /></Reveal>
          </div>
        </div>
      </section>

      {/* DOCUMENTS */}
      <section className="psec" id="what">
        <div className="wrap">
          <div className="split rev">
            <div className="s-copy">
              <div className="section-eyebrow">Documents</div>
              <h2>Every requirement, sourced.</h2>
              <p className="s-lede">Your verdict becomes a per-program checklist. As you tick things off, the readiness bar moves with you.</p>
              <Link className="lnk" href="/assess">See the checklist <span className="arw">→</span></Link>
            </div>
            <Reveal><DocumentsChecklist /></Reveal>
          </div>
        </div>
      </section>

      {/* GUIDE */}
      <section className="psec">
        <div className="wrap">
          <div className="split">
            <div className="s-copy">
              <div className="section-eyebrow">The guide</div>
              <h2>A guide that remembers you.</h2>
              <p className="s-lede">Ask the awkward questions you&apos;d hesitate to ask an agent. Answers are grounded in your own numbers, with the source attached.</p>
              <Link className="lnk" href="/assess">Meet the guide <span className="arw">→</span></Link>
            </div>
            <Reveal><GuideThread /></Reveal>
          </div>
        </div>
      </section>

      {/* FRESHNESS */}
      <section className="fresh">
        <div className="wrap">
          <Reveal className="fh">
            <div className="section-eyebrow" style={{ textAlign: "center" }}>Sourced & dated</div>
            <h2>Every figure shows its source and date.</h2>
            <p className="lede">Here, the numbers a consultancy quotes from memory carry their origin and a verified date you can check.</p>
          </Reveal>
          <Reveal><FreshnessTable /></Reveal>
          <p className="foot">If a figure ages past its check date, we re-verify it before you see it.</p>
        </div>
      </section>

      {/* CLOSE */}
      <section className="close">
        <div className="wrap">
          <Reveal>
            <h2>Know, instead of hoping.</h2>
            <SparkleCta>Check your eligibility</SparkleCta>
            <p className="meta">9 quick questions · no account needed · free</p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

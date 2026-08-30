import Link from "next/link";
import type {
  VisaRiskBand,
  VisaRiskFactor,
  VisaRiskFactorState,
  VisaRiskRead,
} from "@/lib/judgement/visa-risk";

/**
 * The visa-risk read (MV-198, spec §3 "Visa-risk read" and §4's `visa-risk-panel.tsx`
 * row) — the other half of the decision strip, and the answer the whole consultancy
 * version is sold on. `case-decision-strip.tsx` reserved this slot in MV-183 and said
 * PR 7 would fill it "and does not have to relitigate where the answer goes". This is
 * PR 7's panel.
 *
 * ## Why this does NOT use `VerdictPill`, though the inventory says to
 *
 * Spec §4 lists `verdict-pill.tsx` as "Reuse for visa read", and
 * `submittability-panel.tsx` deliberately avoided it on the ground that it "is
 * reserved for the VISA band". Both were written before the judgement contract
 * existed, and the contract turns out to make the reuse wrong in one specific way.
 *
 * `VerdictPill` renders `VERDICT_LABELS`, whose `strong` label is **"Strong match"** —
 * an ADMISSIONS claim, about whether a university will take the student. MV-198's
 * criterion 1 measured that the engine's overall verdict is admissions-shaped and
 * answers nothing about whether the visa holds; that is the entire reason this read
 * exists. A visa band wearing "Strong match" would put the admissions claim back on
 * the surface, in the one region built to keep the two apart.
 *
 * So the COLOURS are reused verbatim — same three tint/ink token pairs `VerdictPill`
 * uses — and the WORDS follow spec §3, which asks for "Strong, Possible, or Reach"
 * and never says "match". The divergence is one line of vocabulary, not a new visual
 * language, and it is carried on the card for the founder rather than assumed.
 *
 * ## What this panel may claim, and what it may not
 *
 * It reads a derived judgement over the case's profile and NOTHING else. Four of the
 * six refusal factors the research names are modelled; two are not, and both say so
 * on the surface rather than being dropped:
 *
 * - **Source-of-funds credibility** is a row, permanently `Not assessed`. The trap it
 *   closes is that `fundingSource` IS populated, so the data looks covered — but a
 *   declared funding type is not evidence the money is genuine.
 * - **Provider risk level** is stated as not held, in one line. The research counts
 *   "the evidence gap named" as part of the capability, so omitting it silently would
 *   fail the read even with every other row right.
 *
 * ## No score, ever
 *
 * `scoreVisa` returns a raw 0–100 value and the model never re-exports it. Nothing
 * here renders a number, a percentage, a bar, a gauge or a radial — spec §3: "Do not
 * use a score, radial chart, gauge, or decorative factor bars." The band word is the
 * carrier and the tint is the echo, the same rule the lodgement panel follows.
 *
 * ## Three states carry no band at all
 *
 * `no-linked-student` (spec §3's unlinked-case rule), `insufficient-data` and
 * `unavailable`. The last is the one that matters most: a failed read must SAY it
 * failed. Rendering nothing would read to a counsellor as "this case has no visa
 * concerns" rather than "we could not find out".
 */

/** Exactly `VerdictPill`'s contrast-tuned pairs. Same colours, honest words. */
const BAND_TONE: Record<VisaRiskBand, string> = {
  strong: "bg-strong-tint text-strong",
  possible: "bg-possible-tint text-possible-ink",
  reach: "bg-reach-tint text-reach",
};

const BAND_WORD: Record<VisaRiskBand, string> = {
  strong: "Strong",
  possible: "Possible",
  reach: "Reach",
};

/**
 * The word is what carries each row's meaning; the tint only echoes it. Four words
 * for four states, and `Not assessed` is deliberately distinct from every other one —
 * it is neither a pass nor a fail, and collapsing it into either would claim an
 * answer nobody computed.
 */
const STATE_WORD: Record<VisaRiskFactorState, string> = {
  positive: "Strength",
  neutral: "Neutral",
  risk: "Risk",
  "not-modelled": "Not assessed",
};

const STATE_TONE: Record<VisaRiskFactorState, string> = {
  positive: "text-strong",
  neutral: "text-ink-soft",
  risk: "text-reach",
  "not-modelled": "text-ink-faint",
};

export function VisaRiskPanel({ read, base }: { read: VisaRiskRead; base: string }) {
  return (
    <section
      aria-label="Visa read"
      className="flex flex-col gap-3 rounded-lg border border-line p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-caption uppercase tracking-wide text-ink-faint">Visa read</h2>
        {read.state === "read" ? (
          <span
            data-testid="visa-risk-band"
            className={`inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption ${BAND_TONE[read.band]}`}
          >
            {BAND_WORD[read.band]}
          </span>
        ) : null}
      </div>

      <Body read={read} />

      {/* The read is derived from the profile, so the profile is where a counsellor
          who disagrees with a row goes to change it. */}
      <Link
        href={`${base}/profile`}
        className="w-fit text-meta text-primary underline underline-offset-4"
      >
        Open profile
      </Link>
    </section>
  );
}

function Body({ read }: { read: VisaRiskRead }) {
  if (read.state === "no-linked-student") {
    // Spec §3, "Unlinked case", in its own words. A consultancy can fill a case's
    // profile itself, so this is not "no data" — it is "no student has stood behind
    // this data", which is a different and more important thing to say.
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[52ch] text-body text-ink">
          Not available — no linked student profile.
        </p>
        <p className="max-w-[52ch] text-caption text-ink-soft">
          Link the student&apos;s account before relying on a visa read.
        </p>
      </div>
    );
  }

  if (read.state === "insufficient-data") {
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[52ch] text-body text-ink">
          Not enough recorded on this profile to read the visa risk.
        </p>
        <p className="max-w-[52ch] text-caption text-ink-soft">
          An empty profile is not a weak one, so no band is shown.
        </p>
      </div>
    );
  }

  if (read.state === "unavailable") {
    return (
      <div className="flex flex-col gap-1">
        <p className="max-w-[52ch] text-body text-ink">
          We couldn&apos;t read this case&apos;s profile.
        </p>
        <p className="max-w-[52ch] text-caption text-ink-soft">
          This is not a statement about this case — please try again in a moment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[52ch] text-body text-ink">{read.conclusion}</p>

      {read.blocker === null ? null : (
        <p data-testid="visa-risk-blocker" className="max-w-[52ch] text-meta text-ink-soft">
          Blocking item: <span className="font-medium text-ink">{read.blocker.label}</span>
        </p>
      )}

      <ul className="flex flex-col gap-2.5">
        {read.factors.map((f) => (
          <Row key={f.key} factor={f} />
        ))}
      </ul>

      {read.notHeld.map((line) => (
        <p key={line} className="max-w-[52ch] text-caption text-ink-soft">
          {line}
        </p>
      ))}

      <p className="max-w-[52ch] text-caption text-ink-faint">
        Rules {read.ruleVersion}, config {read.configVersion}.
      </p>
    </div>
  );
}

function Row({ factor }: { factor: VisaRiskFactor }) {
  return (
    <li data-testid="visa-risk-row" data-factor={factor.key} className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-control font-medium text-ink">{factor.label}</span>
        <span
          data-testid="visa-risk-row-state"
          className={`text-caption ${STATE_TONE[factor.state]}`}
        >
          {STATE_WORD[factor.state]}
        </span>
      </div>
      <p className="max-w-[52ch] text-meta text-ink-soft">{factor.sentence}</p>
      {factor.source ? (
        <a
          href={factor.source.url}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-caption text-primary underline underline-offset-4"
        >
          {factor.source.lastVerified
            ? `Source, verified ${factor.source.lastVerified}`
            : "Source"}
        </a>
      ) : null}
    </li>
  );
}

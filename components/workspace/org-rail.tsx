import Link from "next/link";

/**
 * The organization rail (spec §1): which consultancy you are in, and the four
 * places inside it.
 *
 * ROLE-AWARENESS HERE IS PRESENTATION, NOT A GATE. Every destination re-decides
 * against the database when it loads, and RLS decides again underneath
 * (`lib/cases/README.md` §3). What the rail owes the reader is honesty in the other
 * direction: a link to a page that will answer `notFound()` is worse than no link,
 * so Settings is railed for the owner alone (canonical divergence #1 keeps the
 * tenant's own name and slug with the owner, not the admin).
 *
 * All four destinations exist today. Documents, Visa read and Activity are
 * deliberately absent until their routes ship — spec §1: never publish dead
 * "Coming soon" links.
 *
 * Day view, All cases and Team are unconditional because all three staff roles hold
 * them: `case.list` gives a counsellor a narrower queue rather than none (cell 7),
 * and cell 4's roster read is `read · read · read · read` — the correction MV-180
 * makes on the team page itself.
 *
 * ORIENTATION: one horizontal row at every width. Spec §1 asks for a vertical rail
 * above `md` collapsing to a row below it, and MV-181 was where that would have
 * happened — it re-homes the CASE routes onto a grid the frame owns, which is the
 * work a vertical rail needs at the organization level too.
 *
 * It was measured and declined, and the measurement is the reason. A vertical org
 * rail takes 184px plus its gutter off every route's content column, and the two
 * rails would then nest: `[organizationId]` rail, then the case frame's own section
 * rail, then content — three columns inside 1120px. The Day view's dense queue is
 * the surface that pays. Measured live on 2026-08-18 with five seeded rows and the
 * assignee column shown:
 *
 * | content column | queue table | result |
 * |---|---|---|
 * | 1080px (today) | needs 1062px | fits; every row 64px |
 * | 896px (one rail) | needs 1004px | scrolls sideways; rows grow to 79px |
 * | 712px (two rails) | needs 1004px | scrolls sideways; rows grow to 79px |
 *
 * Spec §2 asks for 56–64px rows and no horizontal scrolling on the queue, so a
 * vertical rail trades the product's primary surface for a rail orientation.
 * Widening the shell past 1120px would buy the room back, but that is a whole-app
 * decision rather than a side effect of a case-frame slice. Recorded on the MV-181
 * dossier as a deviation carried forward, not closed.
 *
 * The row scrolls rather than wraps on a narrow phone, and there is no second
 * fixed bottom bar — which is what spec §1 asks for below `md`.
 */

export interface OrgRailProps {
  organizationId: string;
  organizationName: string;
  /** Cell 2 — the tenant's identity is the owner's, never the admin's. */
  canManageSettings: boolean;
  /** True only when the actor has somewhere else to go; see the layout. */
  canSwitchOrganization: boolean;
}

export function OrgRail({
  organizationId,
  organizationName,
  canManageSettings,
  canSwitchOrganization,
}: OrgRailProps) {
  const base = `/workspace/${organizationId}`;
  const links = [
    { href: base, label: "Day view" },
    { href: `${base}/students`, label: "All cases" },
    { href: `${base}/team`, label: "Team" },
    ...(canManageSettings ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];

  return (
    <div className="border-b border-line bg-bg-tint">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Tenant clarity: the organization being worked in is named on every
              route inside it, so "which consultancy is this?" is never a guess. */}
          <span className="text-control font-medium text-ink">{organizationName}</span>
          {canSwitchOrganization ? (
            <Link href="/workspace" className="text-meta text-primary underline underline-offset-4">
              Switch organization
            </Link>
          ) : null}
        </p>

        <nav
          aria-label="Organization"
          className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-pill px-3 py-1 text-control text-ink-soft transition-colors duration-fast ease-calm hover:bg-bg hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

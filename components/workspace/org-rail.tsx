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
 * above `md` collapsing to a row below it; a vertical rail has to own the content
 * column's grid, and every workspace page currently centres its own
 * `max-w-[1120px]` container. Re-homing all of them belongs with MV-181's case-frame
 * refit, not here — recorded on the MV-180 dossier rather than left as a silent
 * deviation. The row scrolls rather than wraps on a narrow phone, and there is no
 * second fixed bottom bar.
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

import type { User } from "@supabase/supabase-js";
import { Logo } from "@/components/layout/logo";
import { UserPill } from "@/components/layout/user-pill";

/**
 * The consultancy workspace's banner (spec §1). Deliberately NOT `AppBar`: that
 * component's app variant carries the student navigation — Home, Guide, Matches,
 * My plan, Documents — which is the wrong description of someone processing other
 * people's cases.
 *
 * What it keeps from the student chrome is the mark and `UserPill`, and the pill is
 * load-bearing rather than decorative: its menu is the way back out of the
 * workspace to the actor's own dashboard, profile, and sign-out. Nothing else here
 * links to the student side.
 *
 * The current organization is NOT rendered here, and that is a constraint rather
 * than a choice: a parent layout cannot read a child segment's `params`, so the
 * tenant's name is rendered by `OrgRail` — the segment that owns
 * `[organizationId]` — in the chrome block immediately below this bar.
 */
export function WorkspaceTopBar({ user }: { user: User | null }) {
  return (
    <header className="border-b border-line bg-bg">
      <div className="mx-auto flex h-[66px] w-full max-w-[1120px] items-center justify-between px-5">
        <div className="flex items-baseline gap-3">
          <Logo href="/workspace" />
          <span className="hidden text-meta text-ink-faint sm:inline">Consultancy workspace</span>
        </div>
        {user ? <UserPill user={user} /> : null}
      </div>
    </header>
  );
}

import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { InviteAcceptPanel } from "@/components/invitations/invite-accept-panel";

/**
 * MV-194 — the address `invitationLink()` has pointed at since slice 1 (Stage 5 slice 2).
 *
 * `/invite/<token>` is spelled in exactly one place — `lib/invitations/token.ts` — and this
 * route is the other end of it. The path is NOT re-spelled here beyond the directory name
 * the App Router requires, and `tests/invitations/token-secrecy.test.ts` pins that.
 *
 * ## This page is deliberately bare, and the bareness is a security property
 *
 * Its URL carries a live bearer credential. That is unavoidable — the link a counsellor
 * pastes into a chat message IS the token — but it drags in obligations no functional test
 * would fail without:
 *
 *   * **No third-party scripts, no external images, no outbound links.** Every request this
 *     page makes is to our own origin. The fonts are `next/font/google`, which Next
 *     self-hosts at build time, so even they are first-party at runtime.
 *   * **`Referrer-Policy: no-referrer`**, set for `/invite/:token*` in `next.config.ts`.
 *     Without it, the URL — and therefore the token — rides in the `Referer` of every
 *     request the page makes.
 *   * **`noindex, nofollow`**, in the page metadata AND as an `X-Robots-Tag`, because an
 *     invitation URL in a search index is an invitation anyone can accept.
 *
 * PostHog is the one third-party script the root layout brings, and it cannot be removed
 * from a nested route — a root layout always renders. It is handled where it can actually be
 * closed: `lib/analytics/redact-url.ts` now redacts the `/invite/<token>` path segment out
 * of every URL property, which is the only fix that also covers `$referrer` and
 * `$session_entry_url` on the pages the student visits AFTERWARDS.
 *
 * ## The token is withheld from the CLIENT COMPONENT until there is a session — decision B
 *
 * A signed-out visitor gets `token={null}`, so the credential is in no hidden input, no data
 * attribute, and no client component's props. They see "sign in to continue" and nothing
 * else: not whether the invitation exists, not which consultancy sent it, not who it names.
 * Erring toward showing less is the card's instruction and it costs nothing — the student
 * already knows who invited them, because that person sent them the link.
 *
 * **AND ONE THING THIS DOES NOT ACHIEVE, MEASURED RATHER THAN ASSUMED.** An earlier draft of
 * this comment claimed the token was therefore absent from the RSC payload. It is not. The
 * served HTML carries it twice inside Next's own router state — once as the path segments
 * `["", "invite", "<token>"]` and once as the `[token]` dynamic param — and no page code puts
 * it there or can take it out. That is not a disclosure — the browser holding the document is
 * the browser that just typed the URL, and a cache can only ever hold it under a URL that
 * already contains the credential — but it is worth knowing before anyone reasons about this
 * page's HTML as if it were credential-free. (`no-store` was tried and does not take; see
 * `next.config.ts` for the measurement.)
 *
 * Withholding it from the client component is still worth doing. It keeps the credential out
 * of every surface a future edit could widen — a form value, a `data-` attribute, an error
 * boundary's props — none of which are constrained by the fact that Next already knows it.
 *
 * ## Nothing is accepted by loading this page
 *
 * Acceptance is a POST to `/api/invitations/accept`. A GET that spent a single-use
 * credential would be spent by a link preview, a prefetcher, or an antivirus scanner
 * opening the URL out of the student's inbox before they ever saw it.
 */

export const metadata: Metadata = {
  title: "Your invitation — MeroVisa",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Rendered per request, never cached. The page's answer depends on the session, and a cached
 * `/invite/<token>` shell shared between visitors is a shell built for somebody else.
 */
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 pb-20 pt-16">
      <Card padding="lg">
        <InviteAcceptPanel
          // Withheld until the visitor has proven who they are. The value is theirs either
          // way — it is in their address bar — but a page that hands it back into client JS
          // for a visitor who has proven nothing has widened the credential's surface for no
          // gain at all.
          token={signedIn ? token : null}
          email={data.user?.email ?? null}
        />
      </Card>
    </main>
  );
}

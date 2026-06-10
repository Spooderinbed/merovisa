"use client";

import { useEffect } from "react";
import { identify, track } from "@/lib/analytics/events";

// Module scope = once per full page load, not on every client-side navigation
// between app pages.
let sent = false;

/** Mounted from the signed-in shell: identifies by Supabase UUID (only) and fires signed_in. */
export function IdentifyUser({ userId }: { userId: string }) {
  useEffect(() => {
    if (sent) return;
    sent = true;
    identify(userId);
    track("signed_in");
  }, [userId]);
  return null;
}

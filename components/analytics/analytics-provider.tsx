"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Initializes PostHog once on the client. Renders nothing. Without
 * NEXT_PUBLIC_POSTHOG_KEY (dev/test/CI) it is a silent no-op — no init, no
 * network. Autocapture and session recording stay off by policy: the explicit
 * catalog in lib/analytics/events.ts is the only event surface.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      autocapture: false,
      disable_session_recording: true,
      // "history_change" so App Router client navigations count as pageviews.
      capture_pageview: "history_change",
      respect_dnt: true,
    });
  }, []);
  return null;
}

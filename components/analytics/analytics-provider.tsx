"use client";

import { useEffect } from "react";
import { sanitizeAnalyticsProperties } from "@/lib/analytics/redact-url";

/**
 * Initializes PostHog once on the client. Renders nothing. Without
 * NEXT_PUBLIC_POSTHOG_KEY (dev/test/CI) it is a silent no-op — no init, no
 * network. The posthog-js bundle (~50–160KB) is dynamically imported only after
 * the key check passes, so anonymous visitors (incl. every marketing page) never
 * download it and it stays off the initial client chunk (MV-98). Autocapture and
 * session recording stay off by policy: the explicit catalog in
 * lib/analytics/events.ts is the only event surface.
 *
 * `sanitize_properties` strips free-text search terms out of the URL properties
 * before anything leaves the browser. It lives HERE rather than on the one page
 * that has a search box, so a future search surface is covered by construction —
 * see lib/analytics/redact-url.ts for why the premise the spec captured pageviews
 * on ("routes carry no sensitive params") stopped being true.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        autocapture: false,
        disable_session_recording: true,
        // The third DOM-scraping collector, and the one that was left unset. An
        // absent `capture_heatmaps` is not "off": posthog-js falls back to
        // `_enabledServerSide`, a PostHog project-settings toggle someone can
        // flip in a dashboard with no code change and no deploy. It also outruns
        // `sanitize_properties` by shape — `$heatmap_data` is an object KEYED by
        // window.location.href, and the sanitizer rewrites values, not keys — so
        // a searched student's name would leave the browser intact.
        capture_heatmaps: false,
        // "history_change" so App Router client navigations count as pageviews.
        capture_pageview: "history_change",
        sanitize_properties: (properties) => sanitizeAnalyticsProperties(properties),
        respect_dnt: true,
      });
    });
  }, []);
  return null;
}

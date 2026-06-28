/**
 * Pre-hydration theme initialiser (MV-43).
 *
 * Rendered as a blocking inline <script> at the very top of <body>, so it runs
 * BEFORE React hydrates and before first paint. It reads the OS colour-scheme
 * preference and flips the `data-theme` attribute (and `color-scheme` for native
 * controls) on <html>, activating the dark token block that already lives in
 * globals.css. Running pre-paint avoids a flash of the wrong theme.
 *
 * Constraints that shape this as a hand-written string, not normal module code:
 * - It executes before any bundle loads, so it must be fully self-contained and
 *   dependency-free.
 * - The <html> element carries `suppressHydrationWarning`, so React leaves the
 *   attribute this script writes in place instead of reverting it to the SSR
 *   default during hydration.
 * - Wrapped in try/catch: a missing or throwing matchMedia simply leaves the
 *   server default (data-theme="light") untouched — dark mode is progressive
 *   enhancement, never a hard dependency.
 */
export const THEME_INIT_SCRIPT =
  '(function(){try{var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=d?"dark":"light";var e=document.documentElement;e.setAttribute("data-theme",t);e.style.colorScheme=t;}catch(e){}})();';

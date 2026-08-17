"use client";

import { useEffect } from "react";

/**
 * The Day view's only client boundary (spec §1): `/` focuses search, `j`/`k`
 * move focus between visible case links, Escape leaves the search box. Enter
 * needs NO code — the shortcuts move real focus onto real `<a>` elements, so
 * Enter is native link activation. Everything is additive on top of complete
 * Tab navigation; no ARIA grid, no roving tabindex.
 */

const LINK_SELECTOR = "[data-case-queue-link]";
const SEARCH_SELECTOR = "[data-case-queue-search]";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function CaseQueueShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "/") {
        // "unless focus is already inside a control" — typing a slash into any
        // input must stay a slash.
        if (isEditable(event.target)) return;
        const search = document.querySelector<HTMLInputElement>(SEARCH_SELECTOR);
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      if (event.key === "Escape") {
        // Leaves the box; never silently removes active filters.
        if (event.target instanceof HTMLInputElement && event.target.matches(SEARCH_SELECTOR)) {
          event.target.blur();
        }
        return;
      }

      if (event.key !== "j" && event.key !== "k") return;
      if (isEditable(event.target)) return;
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR));
      if (links.length === 0) return;
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next =
        event.key === "j"
          ? Math.min(current + 1, links.length - 1)
          : current <= 0
            ? 0
            : current - 1;
      event.preventDefault();
      links[next]?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

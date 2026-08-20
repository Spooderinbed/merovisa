"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The retry an `error.tsx` "Try again" button needs (MV-184).
 *
 * ## Why `reset()` alone is not a retry
 *
 * `reset()` re-renders the boundary's subtree from the router cache. When the throw
 * came from a CLIENT component that is enough — the component runs again. Every
 * boundary in this app guards SERVER components, and their output is a cached
 * payload: re-rendering replays the same failed payload, the same error is thrown,
 * and the button visibly does nothing. `router.refresh()` is what invalidates that
 * payload and re-runs the server read.
 *
 * Both are needed, in this order, inside one transition: the refresh fetches a fresh
 * payload and `reset()` clears the boundary so the subtree can mount it. Splitting
 * them across two renders lets the boundary re-open on the stale payload first.
 *
 * This lives in one place on purpose. It is a one-line difference between a retry
 * that works and a retry that lies, and it is invisible in review — five boundaries
 * each holding their own copy is five chances to get it wrong.
 */
export function useRouteRetry(reset: () => void): () => void {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };
}

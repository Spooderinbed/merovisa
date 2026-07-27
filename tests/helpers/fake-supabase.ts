import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type FakeResult = { data: unknown; error: unknown };

// PostgREST query builders are chainable AND awaitable (thenable). This stub returns
// itself for every chain method and resolves to `result` when awaited or when a
// terminal (.single/.maybeSingle) is called. `calls` records (method, args) for asserts.
//
// Pass an ARRAY to script a caller that issues several sequential queries (e.g. the
// purge job's select-then-delete): each resolution consumes the next entry, and the
// last one repeats. A single object behaves as before — every query sees it.
export function fakeSupabase(result: FakeResult | FakeResult[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = Array.isArray(result) ? result : [result];
  let consumed = 0;
  const nextResult = (): FakeResult => {
    const entry = queue[Math.min(consumed++, queue.length - 1)];
    if (!entry) throw new Error("fakeSupabase was given an empty result queue");
    return entry;
  };
  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  for (const m of ["insert", "update", "upsert", "select", "eq", "is", "gt", "lt", "in", "order", "limit", "delete"]) {
    builder[m] = record(m);
  }
  builder.single = vi.fn(() => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve(nextResult());
  });
  builder.maybeSingle = vi.fn(() => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(nextResult());
  });
  builder.then = (resolve: (r: FakeResult) => unknown) => resolve(nextResult());

  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder;
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

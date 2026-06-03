import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type FakeResult = { data: unknown; error: unknown };

// PostgREST query builders are chainable AND awaitable (thenable). This stub returns
// itself for every chain method and resolves to `result` when awaited or when a
// terminal (.single/.maybeSingle) is called. `calls` records (method, args) for asserts.
export function fakeSupabase(result: FakeResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  for (const m of ["insert", "update", "upsert", "select", "eq", "is", "gt", "order"]) {
    builder[m] = record(m);
  }
  builder.single = vi.fn(() => {
    calls.push({ method: "single", args: [] });
    return Promise.resolve(result);
  });
  builder.maybeSingle = vi.fn(() => {
    calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(result);
  });
  builder.then = (resolve: (r: FakeResult) => unknown) => resolve(result);

  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return builder;
  });

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

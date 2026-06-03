import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
const createClient = vi.hoisted(() => vi.fn(() => ({ tag: "admin-client" })));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

describe("createSupabaseAdminClient", () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD };
    createClient.mockClear();
  });
  afterEach(() => {
    process.env = OLD;
  });

  it("throws when env vars are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseAdminClient()).toThrow(/service/i);
  });

  it("builds a client with the service-role key and no session persistence", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    const client = createSupabaseAdminClient();
    expect(client).toEqual({ tag: "admin-client" });
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "service-key",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});

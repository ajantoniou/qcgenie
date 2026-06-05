import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve("supabase/schema.sql"), "utf8");

describe("Supabase schema", () => {
  it("enables RLS on every public application table", () => {
    for (const table of [
      "workspaces",
      "workspace_members",
      "api_keys",
      "uploads",
      "qc_jobs",
      "qc_flags",
      "qc_job_events",
      "qc_artifacts",
      "webhook_endpoints",
      "webhook_deliveries",
      "usage_ledger"
    ]) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("uses workspace membership policies instead of unsafe user metadata claims", () => {
    expect(schema).toContain("create table if not exists public.workspace_members");
    expect(schema).toContain("references auth.users(id)");
    expect(schema).toContain("wm.user_id = (select auth.uid())");
    expect(schema).not.toContain("user_metadata");
    expect(schema).not.toContain("raw_user_meta_data");
  });

  it("keeps secret-bearing tables server-only by default", () => {
    expect(schema).toContain("comment on table public.api_keys is 'Server-only API key metadata.");
    expect(schema).toContain("comment on table public.webhook_endpoints is 'Server-only webhook endpoint metadata.");
    expect(schema).not.toMatch(/create policy .* on public\\.api_keys/is);
    expect(schema).not.toMatch(/create policy .* on public\\.webhook_endpoints/is);
  });
});

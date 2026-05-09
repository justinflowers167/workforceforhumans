// Phase 14 §B (2026-05-09): unit tests for refresh-jobs.
//
// refresh-jobs is the daily cron pipeline: fetch USAJobs across 8 keyword
// buckets in parallel → dedup → optionally filter through Claude Haiku →
// upsert via the upsert_usajobs RPC.
//
// Test scope: secret auth, USAJobs creds gate, empty fetch, happy path
// with Claude filter, degraded pass-through (no Anthropic key).

Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("ANTHROPIC_API_KEY", "test-anthropic-key");
Deno.env.set("USAJOBS_AUTH_KEY", "test-usajobs-key");
Deno.env.set("USAJOBS_USER_AGENT", "test@x.com");
Deno.env.set("REFRESH_SECRET", "test-refresh-secret");

import { assertEquals } from "std/assert";
import { anthropicMessage, jsonResponse, setupTest } from "../_test/mocks.ts";
import { handle } from "./index.ts";

function refreshReq(secret: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-refresh-secret"] = secret;
  return new Request("https://x/refresh-jobs", { method: "POST", headers, body: "{}" });
}

// One USAJobs item for happy-path tests. Returned identically for all 8
// buckets — the function's MatchedObjectId dedup collapses to one
// candidate, which keeps the test simple.
function fakeUSAJobsItem(id = "111111111") {
  return {
    MatchedObjectId: id,
    MatchedObjectDescriptor: {
      PositionTitle: "Program Analyst",
      PositionLocation: [{ CityName: "Washington", CountrySubDivisionCode: "DC", LocationName: "Washington, DC" }],
      PositionLocationDisplay: "Washington, DC",
      PositionRemuneration: [{ MinimumRange: "100000", MaximumRange: "120000", RateIntervalCode: "PA" }],
      UserArea: { Details: { JobSummary: "Federal program analyst supporting DoD." } },
      QualificationSummary: "BS in business or related.",
      PositionSchedule: [{ Name: "Full-Time" }],
      JobGrade: [{ Code: "GS11" }],
      ApplyURI: ["https://apply.example.gov/123"],
      PositionURI: "https://example.gov/jobs/123",
      PublicationStartDate: "2026-05-01T00:00:00",
    },
  };
}

function usajobsResponse(items: unknown[]): Response {
  return jsonResponse({ SearchResult: { SearchResultItems: items } });
}

// ─── Auth: missing secret ────────────────────────────────────────────
Deno.test("missing x-refresh-secret returns 401", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(refreshReq(null));
    assertEquals(resp.status, 401);
    const body = await resp.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    t.restore();
  }
});

// ─── Auth: wrong secret ──────────────────────────────────────────────
Deno.test("wrong x-refresh-secret returns 401 (timing-safe compare)", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(refreshReq("wrong-secret"));
    assertEquals(resp.status, 401);
  } finally {
    t.restore();
  }
});

// ─── Missing USAJobs creds ───────────────────────────────────────────
Deno.test("missing USAJobs creds returns 500", async () => {
  // Override USAJOBS_AUTH_KEY to empty to trigger the creds-missing path.
  const t = setupTest({
    env: { USAJOBS_AUTH_KEY: "", USAJOBS_USER_AGENT: "" },
    routes: [],
    strictFetch: false,
  });
  try {
    const resp = await handle(refreshReq("test-refresh-secret"));
    assertEquals(resp.status, 500);
    const body = await resp.json();
    assertEquals(body.error, "USAJobs credentials not configured");
  } finally {
    t.restore();
  }
});

// ─── Empty USAJobs fetch ─────────────────────────────────────────────
Deno.test("empty USAJobs fetch returns 200 with note", async () => {
  const t = setupTest({
    routes: [
      { match: "data.usajobs.gov", handler: () => usajobsResponse([]) },
    ],
  });
  try {
    const resp = await handle(refreshReq("test-refresh-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.considered, 0);
    assertEquals(body.filtered, 0);
    assertEquals(body.inserted, 0);
    assertEquals(body.note, "empty fetch");
  } finally {
    t.restore();
  }
});

// ─── Happy path with Claude filter ───────────────────────────────────
Deno.test("happy path with Claude filter inserts via upsert_usajobs RPC", async () => {
  let claudeCalls = 0;
  let rpcInserted: unknown[] | null = null;
  const t = setupTest({
    routes: [
      {
        match: "data.usajobs.gov",
        handler: () => usajobsResponse([fakeUSAJobsItem("111111111")]),
      },
      {
        match: "anthropic.com",
        handler: () => {
          claudeCalls++;
          // Claude keeps the one job, tags it senior.
          return anthropicMessage(JSON.stringify({
            decisions: [
              { job_id: "111111111", keep: true, reason: "GS11 program analyst", experience_level: "senior" },
            ],
          }));
        },
      },
      {
        match: "/rest/v1/rpc/upsert_usajobs",
        handler: async (req) => {
          const bodyText = await req.text();
          const body = JSON.parse(bodyText);
          rpcInserted = body.rows;
          // PostgREST RPC returns the function's return value; upsert_usajobs returns int.
          return jsonResponse(1);
        },
      },
    ],
  });
  try {
    const resp = await handle(refreshReq("test-refresh-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.considered, 1, "ID-dedup should collapse 8 bucket fetches to 1 candidate");
    assertEquals(body.filtered, 1);
    assertEquals(body.inserted, 1);
    assertEquals(body.filter, "claude");
    assertEquals(body.degraded, false);
    assertEquals(claudeCalls, 1, "one Claude batch call for one candidate");
    assertEquals(Array.isArray(rpcInserted), true);
    assertEquals(rpcInserted!.length, 1);
    // Verify Claude's experience_level override landed in the upserted row.
    assertEquals((rpcInserted![0] as any).experience_level, "senior");
    assertEquals((rpcInserted![0] as any).source_ref, "111111111");
  } finally {
    t.restore();
  }
});

// ─── Happy path WITHOUT Claude key (degraded pass-through) ───────────
Deno.test("missing ANTHROPIC_API_KEY skips Claude filter, passes all through", async () => {
  let claudeCalled = false;
  let rpcInserted: unknown[] | null = null;
  const t = setupTest({
    env: { ANTHROPIC_API_KEY: "" },
    routes: [
      {
        match: "data.usajobs.gov",
        handler: () => usajobsResponse([fakeUSAJobsItem("222222222")]),
      },
      {
        match: "anthropic.com",
        handler: () => {
          claudeCalled = true;
          return anthropicMessage("{}");
        },
      },
      {
        match: "/rest/v1/rpc/upsert_usajobs",
        handler: async (req) => {
          const body = JSON.parse(await req.text());
          rpcInserted = body.rows;
          return jsonResponse(1);
        },
      },
    ],
  });
  try {
    const resp = await handle(refreshReq("test-refresh-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.filter, "none", "filter mode should be 'none' without Anthropic key");
    assertEquals(body.inserted, 1);
    assertEquals(claudeCalled, false, "Claude must NOT be called when ANTHROPIC_API_KEY is empty");
    assertEquals((rpcInserted![0] as any).source_ref, "222222222");
  } finally {
    t.restore();
  }
});

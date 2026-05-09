// Phase 14 §B (2026-05-09): unit tests for send-match-digest.
//
// send-match-digest is the Friday weekly cron: pulls pending match_scores
// (emailed_at IS NULL, score >= 60), groups by seeker, sends one Resend
// email per seeker, stamps emailed_at on the rows that emailed cleanly.
//
// Coverage: secret auth, no-pending fast-path, happy-path send + stamp,
// newsletter opt-out skip, Resend failure (continue).

Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("RESEND_API_KEY", "test-resend-key");
Deno.env.set("DIGEST_SECRET", "test-digest-secret");

import { assertEquals } from "std/assert";
import { jsonResponse, pgRows, setupTest } from "../_test/mocks.ts";
import { handle } from "./index.ts";

function digestReq(secret: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-digest-secret"] = secret;
  return new Request("https://x/send-match-digest", { method: "POST", headers, body: "{}" });
}

// ─── Auth: missing secret ────────────────────────────────────────────
Deno.test("missing x-digest-secret returns 401", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(digestReq(null));
    assertEquals(resp.status, 401);
    const body = await resp.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    t.restore();
  }
});

// ─── Auth: wrong secret ──────────────────────────────────────────────
Deno.test("wrong x-digest-secret returns 401 (timing-safe compare)", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(digestReq("wrong"));
    assertEquals(resp.status, 401);
  } finally {
    t.restore();
  }
});

// ─── No pending matches ──────────────────────────────────────────────
Deno.test("no pending matches returns 200 with sent: 0", async () => {
  let resendCalled = false;
  const t = setupTest({
    routes: [
      { match: "/rest/v1/match_scores", handler: () => pgRows([]) },
      { match: "api.resend.com", handler: () => { resendCalled = true; return jsonResponse({ id: "x" }, 200); } },
    ],
  });
  try {
    const resp = await handle(digestReq("test-digest-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.sent, 0);
    assertEquals(resendCalled, false, "Resend must NOT be called when there are no pending matches");
  } finally {
    t.restore();
  }
});

// ─── Happy path: 1 seeker, 2 matches → 1 email, 2 rows stamped ────────
Deno.test("happy path: groups matches by seeker, sends email, stamps emailed_at", async () => {
  let resendCalls = 0;
  let stampedIds: string[] | null = null;

  const seekerJoin = {
    id: "seeker-1",
    email: "u@x.com",
    first_name: "Justin",
    newsletter_opt_in: true,
  };
  const pending = [
    {
      id: "ms-1",
      job_seeker_id: "seeker-1",
      match_target_id: "job-1",
      score: 80,
      rationale: "Great fit.",
      growth_note: "Sharpen X.",
      match_reasons: ["skills overlap"],
      job_seekers: seekerJoin,
    },
    {
      id: "ms-2",
      job_seeker_id: "seeker-1",
      match_target_id: "job-2",
      score: 75,
      rationale: "Solid match.",
      growth_note: null,
      match_reasons: ["remote ok"],
      job_seekers: seekerJoin,
    },
  ];
  const jobs = [
    { id: "job-1", title: "Program Analyst", slug: "program-analyst", location_city: "DC", location_state: "DC", is_remote: false, pay_type: "salary", pay_min: 100000, pay_max: 130000, employers: { name: "DoD" } },
    { id: "job-2", title: "Management Analyst", slug: "mgmt-analyst", location_city: null, location_state: null, is_remote: true, pay_type: "salary", pay_min: 90000, pay_max: 120000, employers: { name: "GSA" } },
  ];

  const t = setupTest({
    routes: [
      // Order matters: jobs route is more specific (just "/rest/v1/jobs")
      // than match_scores. Substring matching: "/rest/v1/jobs" doesn't
      // overlap with "/rest/v1/match_scores", so order is forgiving here.
      {
        match: "/rest/v1/match_scores",
        handler: async (req) => {
          if (req.method === "GET") return pgRows(pending);
          if (req.method === "PATCH") {
            // The .update().in("id", sentIds) call. Capture the URL's
            // in.(...) filter to extract the stamped IDs.
            const url = new URL(req.url);
            const inFilter = url.searchParams.get("id");
            if (inFilter) {
              // PostgREST format: in.(ms-1,ms-2)
              const m = inFilter.match(/^in\.\((.+)\)$/);
              if (m) stampedIds = m[1].split(",");
            }
            return new Response(null, { status: 204 });
          }
          return new Response("unexpected", { status: 500 });
        },
      },
      { match: "/rest/v1/jobs", handler: () => pgRows(jobs) },
      {
        match: "api.resend.com",
        handler: () => {
          resendCalls++;
          return jsonResponse({ id: "email-fake" }, 200);
        },
      },
    ],
  });

  try {
    const resp = await handle(digestReq("test-digest-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.sent, 1, "one email sent (seeker grouped from 2 matches)");
    assertEquals(body.marked, 2, "both match_scores rows marked emailed_at");
    assertEquals(resendCalls, 1, "Resend called exactly once");
    assertEquals(stampedIds?.length, 2, "two IDs stamped");
    assertEquals(stampedIds?.sort(), ["ms-1", "ms-2"]);
  } finally {
    t.restore();
  }
});

// ─── Newsletter opt-out skip ─────────────────────────────────────────
Deno.test("seekers with newsletter_opt_in: false are skipped", async () => {
  let resendCalls = 0;
  const t = setupTest({
    routes: [
      {
        match: "/rest/v1/match_scores",
        handler: () => pgRows([{
          id: "ms-1",
          job_seeker_id: "seeker-1",
          match_target_id: "job-1",
          score: 80,
          rationale: "x",
          growth_note: null,
          match_reasons: [],
          job_seekers: { id: "seeker-1", email: "u@x.com", first_name: "Test", newsletter_opt_in: false },
        }]),
      },
      { match: "/rest/v1/jobs", handler: () => pgRows([]) },
      { match: "api.resend.com", handler: () => { resendCalls++; return jsonResponse({}, 200); } },
    ],
  });
  try {
    const resp = await handle(digestReq("test-digest-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.sent, 0, "opted-out seeker should not be emailed");
    assertEquals(resendCalls, 0, "Resend must NOT be called for opted-out seekers");
  } finally {
    t.restore();
  }
});

// ─── Resend failure: log and continue, do NOT stamp emailed_at ───────
Deno.test("Resend failure does NOT stamp emailed_at (allows retry next run)", async () => {
  let stampCalled = false;
  const t = setupTest({
    routes: [
      {
        match: "/rest/v1/match_scores",
        handler: (req) => {
          if (req.method === "PATCH") { stampCalled = true; return new Response(null, { status: 204 }); }
          return pgRows([{
            id: "ms-1",
            job_seeker_id: "seeker-1",
            match_target_id: "job-1",
            score: 80,
            rationale: "x",
            growth_note: null,
            match_reasons: [],
            job_seekers: { id: "seeker-1", email: "u@x.com", first_name: "Test", newsletter_opt_in: true },
          }]);
        },
      },
      { match: "/rest/v1/jobs", handler: () => pgRows([{ id: "job-1", title: "x", slug: "x", location_city: null, location_state: null, is_remote: true, pay_type: "salary", pay_min: null, pay_max: null, employers: { name: "Acme" } }]) },
      // Resend returns 500 — function should log and skip emailed_at stamp.
      { match: "api.resend.com", handler: () => jsonResponse({ error: "resend down" }, 500) },
    ],
  });
  try {
    const resp = await handle(digestReq("test-digest-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.sent, 0, "no emails sent when Resend fails");
    assertEquals(stampCalled, false, "emailed_at must NOT be stamped on Resend failure (allows retry)");
  } finally {
    t.restore();
  }
});

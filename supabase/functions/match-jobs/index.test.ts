// Phase 14 §B (2026-05-09): unit tests for match-jobs.
//
// Same shape as submit-feedback/index.test.ts:
//   - env vars set at top of file (before import) so module-level reads
//     see test values; per-test overrides via setupTest's mockEnv.
//   - mockFetch routes intercept supabase-js + Anthropic SDK HTTP calls.
//   - handle() invoked directly; no Deno.serve listener.
//
// Coverage targets: missing auth, invalid JWT, missing seeker, no jobs,
// happy path with full coach brief, malformed Claude JSON.

Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("ANTHROPIC_API_KEY", "test-anthropic-key");

import { assertEquals, assertStringIncludes } from "std/assert";
import {
  anthropicMessage,
  assertJsonResponse,
  jsonResponse,
  pgRows,
  setupTest,
} from "../_test/mocks.ts";
import { handle } from "./index.ts";

// Build a Request that match-jobs will accept. The token value doesn't
// matter for tests — auth.getUser is mocked to return a user — as long
// as the Authorization header is present.
function matchReq(token = "fake-jwt"): Request {
  return new Request("https://x/match-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: "{}",
  });
}

// PostgREST `.single()` and `.maybeSingle()` responses are bare objects,
// not arrays — supabase-js sets `Accept: application/vnd.pgrst.object+json`
// for those calls and PostgREST returns the object directly.
function pgRow(row: unknown): Response {
  return jsonResponse(row);
}

// Auth response shape — supabase-js's auth.getUser() expects this at
// /auth/v1/user, GET, with the Bearer token in headers.
function authUserResp(id: string, email: string): Response {
  return jsonResponse({
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
  });
}

// ─── OPTIONS preflight ───────────────────────────────────────────────
Deno.test("OPTIONS preflight returns 200 ok", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(
      new Request("https://x/match-jobs", { method: "OPTIONS" }),
    );
    assertEquals(resp.status, 200);
    assertEquals(await resp.text(), "ok");
  } finally {
    t.restore();
  }
});

// ─── Missing auth header ─────────────────────────────────────────────
Deno.test("missing Authorization returns 401 missing auth", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(
      new Request("https://x/match-jobs", { method: "POST", body: "{}" }),
    );
    await assertJsonResponse(resp, { status: 401, body: { error: "missing auth" } });
  } finally {
    t.restore();
  }
});

// ─── Invalid JWT (auth.getUser returns error) ────────────────────────
Deno.test("invalid JWT returns 401 unauthenticated", async () => {
  const t = setupTest({
    routes: [
      // Supabase auth returns 401 when the JWT is invalid; supabase-js
      // surfaces this as { data: null, error }. Match the live shape.
      { match: "/auth/v1/user", handler: () => jsonResponse({ message: "invalid JWT" }, 401) },
    ],
  });
  try {
    const resp = await handle(matchReq("bad-jwt"));
    await assertJsonResponse(resp, { status: 401, body: { error: "unauthenticated" } });
  } finally {
    t.restore();
  }
});

// ─── No seeker profile for the auth user ─────────────────────────────
Deno.test("missing seeker profile returns 404 no profile", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-x", "u@x.com") },
      // .single() with zero rows returns 406; supabase-js surfaces this
      // as { data: null, error }. Use 406 + empty body to match.
      {
        match: "/rest/v1/job_seekers",
        handler: () => new Response(null, {
          status: 406,
          headers: { "Content-Type": "application/json" },
        }),
      },
    ],
  });
  try {
    const resp = await handle(matchReq());
    await assertJsonResponse(resp, { status: 404, body: { error: "no profile" } });
  } finally {
    t.restore();
  }
});

// ─── Seeker exists but no active jobs ────────────────────────────────
Deno.test("zero active jobs returns 200 with empty matches", async () => {
  let anthropicCalled = false;
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-x", "u@x.com") },
      // job_seeker_skills route must come BEFORE job_seekers (substring
      // shorter; "job_seekers" doesn't contain "job_seeker_skills" but
      // we order specific-first as a habit).
      { match: "/rest/v1/job_seeker_skills", handler: () => pgRows([]) },
      { match: "/rest/v1/job_seekers", handler: () => pgRow({ id: "seeker-1", headline: null, summary: null, career_stage: null, desired_pay_min: null, desired_pay_type: null, open_to_remote: false, location_city: null, location_state: null, desired_roles: [], desired_skills: [] }) },
      { match: "/rest/v1/resumes", handler: () => pgRow(null) },
      { match: "/rest/v1/jobs", handler: () => pgRows([]) },
      { match: "anthropic.com", handler: () => { anthropicCalled = true; return anthropicMessage("{}"); } },
    ],
  });
  try {
    const resp = await handle(matchReq());
    const body = await assertJsonResponse(resp, { status: 200 }) as { ok: boolean; matches: unknown[] };
    assertEquals(body.ok, true);
    assertEquals(body.matches, []);
    assertEquals(anthropicCalled, false, "anthropic must NOT be called when there are no jobs");
  } finally {
    t.restore();
  }
});

// ─── Happy path with full coach brief ────────────────────────────────
Deno.test("happy path: returns matches with all 5 prose fields and inserts to match_scores", async () => {
  let anthropicCalled = false;
  let matchScoresInsertBody: string | null = null;
  let matchScoresDeleteCalled = false;

  const fakeMatch = {
    job_id: "job-1",
    score: 78,
    rationale: "Your federal compliance background fits this DoD analyst role.",
    reasons: ["skills overlap", "federal experience"],
    growth_note: "Sharpening earned-value-management documentation is the next edge.",
    resume_tailoring: "Lead the Acme bullet with the CMMC readiness outcome.",
    skill_gap_plan: "You bring NIST. Role wants EVM. Start with a free DAU course.",
    application_strategy: "Mirror 'program analysis' into the questionnaire verbatim.",
  };

  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-x", "u@x.com") },
      { match: "/rest/v1/job_seeker_skills", handler: () => pgRows([{ skills: { name: "Excel" } }, { skills: { name: "NIST" } }]) },
      { match: "/rest/v1/job_seekers", handler: () => pgRow({
        id: "seeker-1",
        headline: "Senior Federal Compliance",
        summary: "20 years in IT compliance",
        career_stage: "senior",
        desired_pay_min: 110000,
        desired_pay_type: "salary",
        open_to_remote: true,
        location_city: "Denver",
        location_state: "CO",
        desired_roles: ["program analyst"],
        desired_skills: ["EVM"],
      }) },
      { match: "/rest/v1/resumes", handler: () => pgRow({
        raw_text: "Justin Flowers — Federal IT Compliance Lead at Acme...",
        parsed_json: { name: "Justin Flowers", experience: [{ company: "Acme", role: "Lead" }] },
      }) },
      { match: "/rest/v1/jobs", handler: () => pgRows([{
        id: "job-1",
        title: "Program Analyst",
        description: "DoD program analyst role.",
        requirements: "EVM, federal compliance",
        nice_to_have: null,
        location_city: "Washington",
        location_state: "DC",
        is_remote: false,
        employment_type: "full-time",
        experience_level: "senior",
        pay_type: "salary",
        pay_min: 100000,
        pay_max: 150000,
      }]) },
      { match: "/rest/v1/job_skills", handler: () => pgRows([
        { job_id: "job-1", skills: { name: "AI tooling fluency", is_ai_skill: true } },
      ]) },
      { match: "anthropic.com", handler: () => {
        anthropicCalled = true;
        return anthropicMessage(JSON.stringify({ matches: [fakeMatch] }));
      } },
      // match_scores DELETE then INSERT — discriminate on method.
      {
        match: "/rest/v1/match_scores",
        handler: async (req) => {
          if (req.method === "DELETE") {
            matchScoresDeleteCalled = true;
            return new Response(null, { status: 204 });
          }
          if (req.method === "POST") {
            matchScoresInsertBody = await req.text();
            return jsonResponse([{ id: "ms-1" }], 201);
          }
          return new Response("unexpected method", { status: 500 });
        },
      },
    ],
  });

  try {
    const resp = await handle(matchReq());
    const body = await assertJsonResponse(resp, { status: 200 }) as { ok: boolean; matches: typeof fakeMatch[] };
    assertEquals(body.ok, true);
    assertEquals(body.matches.length, 1);
    assertEquals(body.matches[0].job_id, "job-1");
    assertEquals(body.matches[0].score, 78);
    assertEquals(anthropicCalled, true, "anthropic must be called when jobs exist");
    assertEquals(matchScoresDeleteCalled, true, "match_scores delete must run before insert");
    assertEquals(typeof matchScoresInsertBody, "string", "match_scores insert must be called");

    // Verify the insert payload carries all 5 prose fields from Claude.
    const inserted = JSON.parse(matchScoresInsertBody!);
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    assertEquals(row.job_seeker_id, "seeker-1");
    assertEquals(row.match_target_id, "job-1");
    assertEquals(row.score, 78);
    assertStringIncludes(row.rationale, "federal compliance");
    assertStringIncludes(row.growth_note, "earned-value");
    assertStringIncludes(row.resume_tailoring, "Acme");
    assertStringIncludes(row.skill_gap_plan, "EVM");
    assertStringIncludes(row.application_strategy, "questionnaire");
  } finally {
    t.restore();
  }
});

// ─── focus_ai_skill allowlist (2026-08-02) ───────────────────────────
// The model picks one AI skill per match and member.html joins on it to
// show training. A slug outside the curated vocabulary finds no training
// and renders identically to "no skill chosen", so a hallucinated value
// would be invisible in the UI and painful to trace. These two cases pin
// the normalization on both sides of the allowlist.

function focusSkillTest(name: string, modelValue: unknown, expected: string | null) {
  Deno.test(`focus_ai_skill: ${name}`, async () => {
    let insertBody: string | null = null;
    const fakeMatch = {
      job_id: "job-1",
      score: 71,
      rationale: "Your analyst background transfers.",
      reasons: ["skills overlap"],
      growth_note: "Adding prompt engineering is the next edge.",
      resume_tailoring: "Lead with the reporting automation outcome.",
      skill_gap_plan: "You bring analysis. Start with a free prompting course.",
      application_strategy: "Mirror the JD language into the questionnaire.",
      focus_ai_skill: modelValue,
    };

    const t = setupTest({
      routes: [
        { match: "/auth/v1/user", handler: () => authUserResp("user-x", "u@x.com") },
        { match: "/rest/v1/job_seeker_skills", handler: () => pgRows([{ skills: { name: "Excel" } }]) },
        { match: "/rest/v1/job_seekers", handler: () => pgRow({ id: "seeker-1", headline: "Analyst" }) },
        { match: "/rest/v1/resumes", handler: () => pgRow({ raw_text: "Analyst resume", parsed_json: {} }) },
        { match: "/rest/v1/jobs", handler: () => pgRows([{ id: "job-1", title: "Program Analyst" }]) },
        { match: "/rest/v1/job_skills", handler: () => pgRows([]) },
        { match: "anthropic.com", handler: () => anthropicMessage(JSON.stringify({ matches: [fakeMatch] })) },
        {
          match: "/rest/v1/match_scores",
          handler: async (req) => {
            if (req.method === "DELETE") return new Response(null, { status: 204 });
            if (req.method === "POST") {
              insertBody = await req.text();
              return jsonResponse([{ id: "ms-1" }], 201);
            }
            return new Response("unexpected method", { status: 500 });
          },
        },
      ],
    });

    try {
      const resp = await handle(matchReq());
      await assertJsonResponse(resp, { status: 200 });
      const inserted = JSON.parse(insertBody!);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      assertEquals(row.focus_ai_skill, expected);
    } finally {
      t.restore();
    }
  });
}

focusSkillTest("curated slug is stored", "prompt-engineering", "prompt-engineering");
focusSkillTest("casing and whitespace are normalized", "  Prompt-Engineering  ", "prompt-engineering");
focusSkillTest("slug outside the vocabulary degrades to null", "vibe-coding", null);
focusSkillTest("explicit null stays null", null, null);
focusSkillTest("omitted field stays null", undefined, null);

// ─── Malformed Claude JSON ───────────────────────────────────────────
Deno.test("malformed Claude response returns 500", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-x", "u@x.com") },
      { match: "/rest/v1/job_seeker_skills", handler: () => pgRows([]) },
      { match: "/rest/v1/job_seekers", handler: () => pgRow({ id: "seeker-1", headline: null, summary: null, career_stage: null, desired_pay_min: null, desired_pay_type: null, open_to_remote: false, location_city: null, location_state: null, desired_roles: [], desired_skills: [] }) },
      { match: "/rest/v1/resumes", handler: () => pgRow(null) },
      { match: "/rest/v1/jobs", handler: () => pgRows([{ id: "job-1", title: "x", description: "", requirements: null, nice_to_have: null, location_city: null, location_state: null, is_remote: false, employment_type: "full-time", experience_level: "mid-level", pay_type: "salary", pay_min: null, pay_max: null }]) },
      { match: "/rest/v1/job_skills", handler: () => pgRows([]) },
      // Claude response with no JSON object at all — handle() throws,
      // outer catch returns 500.
      { match: "anthropic.com", handler: () => anthropicMessage("definitely not JSON") },
    ],
  });
  try {
    const resp = await handle(matchReq());
    await assertJsonResponse(resp, { status: 500, body: { error: "Matching failed. Please try again." } });
  } finally {
    t.restore();
  }
});

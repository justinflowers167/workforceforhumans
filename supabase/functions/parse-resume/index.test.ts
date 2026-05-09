// Phase 14 §B (2026-05-09): unit tests for parse-resume.
//
// Coverage scope: auth gates, body validation, resume lookup, forbidden
// path, happy path (with raw_text — skips storage download), malformed
// Claude response. The PDF/DOCX storage paths are NOT covered here —
// they need a different mock surface (supabase storage API endpoints
// not REST) and represent a smaller fraction of real traffic. Those
// can land in a follow-up if we want full coverage.

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

function parseReq(body: unknown, token = "fake-jwt"): Request {
  return new Request("https://x/parse-resume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function pgRow(row: unknown): Response {
  return jsonResponse(row);
}

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
      new Request("https://x/parse-resume", { method: "OPTIONS" }),
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
      new Request("https://x/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: "r1" }),
      }),
    );
    await assertJsonResponse(resp, { status: 401, body: { error: "missing auth" } });
  } finally {
    t.restore();
  }
});

// ─── Invalid JWT ─────────────────────────────────────────────────────
Deno.test("invalid JWT returns 401 unauthenticated", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => jsonResponse({ message: "invalid JWT" }, 401) },
    ],
  });
  try {
    const resp = await handle(parseReq({ resume_id: "r1" }, "bad-jwt"));
    await assertJsonResponse(resp, { status: 401, body: { error: "unauthenticated" } });
  } finally {
    t.restore();
  }
});

// ─── Missing resume_id ───────────────────────────────────────────────
Deno.test("missing resume_id returns 400", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-1", "u@x.com") },
    ],
  });
  try {
    const resp = await handle(parseReq({}));
    await assertJsonResponse(resp, { status: 400, body: { error: "missing resume_id" } });
  } finally {
    t.restore();
  }
});

// ─── Resume not found ────────────────────────────────────────────────
Deno.test("resume_id with no match returns 404", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-1", "u@x.com") },
      // .single() with zero rows → 406
      {
        match: "/rest/v1/resumes",
        handler: () => new Response(null, { status: 406, headers: { "Content-Type": "application/json" } }),
      },
    ],
  });
  try {
    const resp = await handle(parseReq({ resume_id: "missing-resume-id" }));
    await assertJsonResponse(resp, { status: 404, body: { error: "resume not found" } });
  } finally {
    t.restore();
  }
});

// ─── Forbidden (resume belongs to different auth user) ───────────────
Deno.test("resume owned by different auth user returns 403 forbidden", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-A", "a@x.com") },
      {
        match: "/rest/v1/resumes",
        handler: () => pgRow({
          id: "r1",
          job_seeker_id: "seeker-B",
          source: "paste",
          raw_text: "irrelevant",
          file_path: null,
          // join shape — auth_user_id under nested job_seekers
          job_seekers: { auth_user_id: "user-B" },
        }),
      },
    ],
  });
  try {
    const resp = await handle(parseReq({ resume_id: "r1" }));
    await assertJsonResponse(resp, { status: 403, body: { error: "forbidden" } });
  } finally {
    t.restore();
  }
});

// ─── Happy path with raw_text ────────────────────────────────────────
Deno.test("happy path: raw_text resume, full DB sync, returns parsed + review", async () => {
  let anthropicCalled = false;
  // Track which DB endpoints were hit so we can assert the full sync ran.
  const hits = {
    resumesUpdate: 0,
    jobSeekersUpdate: 0,
    skillsSelect: 0,
    skillsInsert: 0,
    jobSeekerSkillsDelete: 0,
    jobSeekerSkillsInsert: 0,
  };

  const fakeParsed = {
    full_name: "Justin Flowers",
    headline: "Senior Federal Compliance",
    summary: "20 years in IT compliance and federal program management.",
    location_city: "Denver",
    location_state: "CO",
    email: "u@x.com",
    phone: null,
    experience: [{ title: "Lead", company: "Acme", start: "2010", end: null, highlights: ["led migration"] }],
    education: [{ credential: "BS", institution: "CU", year: "2005" }],
    skills_have: ["nist", "evm", "program management"],
    skills_want: ["ai-tooling-fluency"],
    desired_roles: ["program analyst", "management analyst"],
    career_stage: "senior",
  };
  const fakeReview = {
    strengths: ["strong federal frame"],
    gaps: ["AI fluency"],
    rewrites: [{ original: "did things", improved: "owned X outcome", why: "outcomes punchier" }],
    market_notes: "Federal mid-senior demand is healthy.",
    ats_tips: ["mirror JD keywords"],
  };

  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-1", "u@x.com") },
      // Resume lookup returns the row owned by this auth user.
      // Note: the SAME route handles the subsequent UPDATEs (PATCH method).
      // Discriminate on method.
      {
        match: "/rest/v1/resumes",
        handler: async (req) => {
          if (req.method === "GET") {
            return pgRow({
              id: "r1",
              job_seeker_id: "seeker-1",
              source: "paste",
              raw_text: "Justin Flowers — Federal IT Compliance Lead at Acme. Led NIST/CMMC readiness, ran $5m program portfolios across 12 data centers.",
              file_path: null,
              job_seekers: { auth_user_id: "user-1" },
            });
          }
          if (req.method === "PATCH") {
            hits.resumesUpdate++;
            return new Response(null, { status: 204 });
          }
          return new Response("unexpected", { status: 500 });
        },
      },
      // job_seekers UPDATE
      {
        method: "PATCH",
        match: "/rest/v1/job_seekers",
        handler: () => {
          hits.jobSeekersUpdate++;
          return new Response(null, { status: 204 });
        },
      },
      // skills GET (existing) + POST (new) — order matters for substring,
      // but "skills" is shorter than "job_seeker_skills", so put the
      // job_seeker_skills route BEFORE skills.
      {
        match: "/rest/v1/job_seeker_skills",
        handler: (req) => {
          if (req.method === "DELETE") {
            hits.jobSeekerSkillsDelete++;
            return new Response(null, { status: 204 });
          }
          if (req.method === "POST") {
            hits.jobSeekerSkillsInsert++;
            return jsonResponse([], 201);
          }
          return new Response("unexpected", { status: 500 });
        },
      },
      {
        match: "/rest/v1/skills",
        handler: (req) => {
          if (req.method === "GET") {
            hits.skillsSelect++;
            // Pretend "nist" already exists with id 100; "evm" + "program management" are new.
            return pgRows([{ id: 100, name: "nist" }]);
          }
          if (req.method === "POST") {
            hits.skillsInsert++;
            // Return the inserted rows with new ids.
            return pgRows([
              { id: 101, name: "evm" },
              { id: 102, name: "program management" },
            ]);
          }
          return new Response("unexpected", { status: 500 });
        },
      },
      {
        match: "anthropic.com",
        handler: () => {
          anthropicCalled = true;
          return anthropicMessage(JSON.stringify({ parsed: fakeParsed, review: fakeReview }));
        },
      },
    ],
  });

  try {
    const resp = await handle(parseReq({ resume_id: "r1" }));
    const body = await assertJsonResponse(resp, { status: 200 }) as { ok: boolean; parsed: typeof fakeParsed; review: typeof fakeReview };
    assertEquals(body.ok, true);
    assertEquals(body.parsed.full_name, "Justin Flowers");
    assertStringIncludes(body.review.market_notes, "Federal");
    assertEquals(anthropicCalled, true, "anthropic must be called");

    // Two resume PATCHes (set parsed + flip others' is_current) — the
    // is_current=false sweep runs even when there's only one resume row,
    // so we expect 2 hits.
    assertEquals(hits.resumesUpdate >= 2, true, `expected >= 2 resume PATCHes, got ${hits.resumesUpdate}`);
    // job_seekers patched once (parsed has multiple seeker fields)
    assertEquals(hits.jobSeekersUpdate, 1, `expected 1 job_seekers PATCH, got ${hits.jobSeekersUpdate}`);
    // skills selected once, inserted once (2 new skills)
    assertEquals(hits.skillsSelect, 1, `expected 1 skills SELECT, got ${hits.skillsSelect}`);
    assertEquals(hits.skillsInsert, 1, `expected 1 skills INSERT, got ${hits.skillsInsert}`);
    // job_seeker_skills delete + insert
    assertEquals(hits.jobSeekerSkillsDelete, 1, `expected 1 job_seeker_skills DELETE, got ${hits.jobSeekerSkillsDelete}`);
    assertEquals(hits.jobSeekerSkillsInsert, 1, `expected 1 job_seeker_skills INSERT, got ${hits.jobSeekerSkillsInsert}`);
  } finally {
    t.restore();
  }
});

// ─── Malformed Claude JSON ───────────────────────────────────────────
Deno.test("malformed Claude response returns 500", async () => {
  const t = setupTest({
    routes: [
      { match: "/auth/v1/user", handler: () => authUserResp("user-1", "u@x.com") },
      {
        match: "/rest/v1/resumes",
        handler: (req) => {
          if (req.method === "GET") {
            return pgRow({
              id: "r1",
              job_seeker_id: "seeker-1",
              source: "paste",
              raw_text: "Justin Flowers — short resume body to trigger parse, longer than 40 chars total fine.",
              file_path: null,
              job_seekers: { auth_user_id: "user-1" },
            });
          }
          return new Response(null, { status: 204 });
        },
      },
      // No JSON object in Claude output → handle throws → outer catch returns 500.
      { match: "anthropic.com", handler: () => anthropicMessage("definitely not JSON") },
    ],
  });
  try {
    const resp = await handle(parseReq({ resume_id: "r1" }));
    await assertJsonResponse(resp, { status: 500, body: { error: "Resume could not be parsed. Please try again." } });
  } finally {
    t.restore();
  }
});

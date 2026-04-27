// Phase 11 §B (2026-04-28): unit tests for submit-feedback.
//
// Strategy: env vars are set at the TOP of this file (before the import)
// so module-level Deno.env.get(...) reads see test values. Each test
// then stubs globalThis.fetch via mockFetch(...) to intercept the
// supabase-js + Anthropic SDK HTTP calls. The handler is invoked
// directly via the exported `handle(req)` — no Deno.serve listener.

// MUST run before the import below — module-load reads env once.
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
// ANTHROPIC_API_KEY left unset by default; individual tests override.

import { assertEquals, assertStringIncludes } from "std/assert";
import {
  anthropicMessage,
  assertJsonResponse,
  jsonResponse,
  pgRows,
  setupTest,
} from "../_test/mocks.ts";
import { handle } from "./index.ts";

function feedbackReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://x/submit-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ─── OPTIONS preflight ────────────────────────────────────────────────
Deno.test("OPTIONS preflight returns 200 ok", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(
      new Request("https://x/submit-feedback", { method: "OPTIONS" }),
    );
    assertEquals(resp.status, 200);
    assertEquals(await resp.text(), "ok");
  } finally {
    t.restore();
  }
});

// ─── Method guard ─────────────────────────────────────────────────────
Deno.test("GET returns 405", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(new Request("https://x/submit-feedback", { method: "GET" }));
    await assertJsonResponse(resp, { status: 405, body: { error: "method not allowed" } });
  } finally {
    t.restore();
  }
});

// ─── Honeypot ─────────────────────────────────────────────────────────
Deno.test("honeypot submission returns 200 ok with no DB writes", async () => {
  const t = setupTest({ routes: [], strictFetch: true });
  try {
    const resp = await handle(feedbackReq({ hp: "bot", message: "spam", page_path: "/x" }));
    await assertJsonResponse(resp, { status: 200, body: { ok: true } });
    assertEquals(t.fetchCalls.length, 0, "honeypot path must not hit any URL");
  } finally {
    t.restore();
  }
});

// ─── Validation: invalid JSON body ────────────────────────────────────
Deno.test("invalid JSON body returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: true });
  try {
    const resp = await handle(
      new Request("https://x/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    await assertJsonResponse(resp, { status: 400, body: { error: "invalid JSON body" } });
  } finally {
    t.restore();
  }
});

// ─── Validation: page_path required ───────────────────────────────────
Deno.test("missing page_path returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: true });
  try {
    const resp = await handle(feedbackReq({ message: "valid message body" }));
    await assertJsonResponse(resp, { status: 400, body: { error: "page_path required" } });
  } finally {
    t.restore();
  }
});

// ─── Validation: message length ───────────────────────────────────────
Deno.test("message under 5 chars returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: true });
  try {
    const resp = await handle(feedbackReq({ page_path: "/x", message: "hi" }));
    const body = await assertJsonResponse(resp, { status: 400 }) as { error: string };
    assertStringIncludes(body.error, "5-2000 characters");
  } finally {
    t.restore();
  }
});

Deno.test("message over 2000 chars returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: true });
  try {
    const resp = await handle(feedbackReq({ page_path: "/x", message: "x".repeat(2001) }));
    const body = await assertJsonResponse(resp, { status: 400 }) as { error: string };
    assertStringIncludes(body.error, "5-2000 characters");
  } finally {
    t.restore();
  }
});

// ─── Happy path (no Anthropic key) ────────────────────────────────────
Deno.test("happy path without ANTHROPIC_API_KEY skips Claude triage and inserts", async () => {
  let feedbackInsertBody: unknown = null;
  const t = setupTest({
    routes: [
      // Rate-limit count check (HEAD/GET with count=exact header)
      {
        match: "feedback_rate_limits",
        handler: (req) => {
          if (req.method === "POST") {
            return jsonResponse([], 201);
          }
          // GET / HEAD: empty array but with count=0 in PostgREST headers.
          // supabase-js .select with count:'exact', head:true reads
          // Content-Range header for the count; we return 0/0 here.
          return new Response(null, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": "0-0/0",
            },
          });
        },
      },
      // Feedback insert
      {
        method: "POST",
        match: "/rest/v1/feedback",
        handler: async (req) => {
          feedbackInsertBody = await req.text();
          return jsonResponse([{ id: "fb1" }], 201);
        },
      },
    ],
  });
  try {
    const resp = await handle(
      feedbackReq({
        page_path: "/jobs",
        category: "bug",
        message: "the search filter broke after I selected three states",
      }),
    );
    await assertJsonResponse(resp, { status: 200, body: { ok: true } });
    assertEquals(typeof feedbackInsertBody, "string", "feedback insert must have been called");
    const sent = JSON.parse(feedbackInsertBody as string);
    // supabase-js wraps single-row inserts in an array sometimes; handle both.
    const row = Array.isArray(sent) ? sent[0] : sent;
    assertEquals(row.page_path, "/jobs");
    assertEquals(row.category, "bug");
    assertEquals(row.claude_summary, null);
    assertEquals(row.claude_priority, null);
  } finally {
    t.restore();
  }
});

// ─── Happy path with Claude triage ────────────────────────────────────
Deno.test("happy path with ANTHROPIC_API_KEY stamps claude_summary + claude_priority", async () => {
  let feedbackInsertBody: unknown = null;
  let anthropicCalled = false;
  const t = setupTest({
    env: { ANTHROPIC_API_KEY: "test-anthropic-key" },
    routes: [
      {
        match: "feedback_rate_limits",
        handler: (req) => {
          if (req.method === "POST") return jsonResponse([], 201);
          return new Response(null, {
            status: 200,
            headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
          });
        },
      },
      {
        match: "anthropic.com",
        handler: () => {
          anthropicCalled = true;
          return anthropicMessage(
            JSON.stringify({ summary: "search filter broken on multi-state select", priority: "p1" }),
          );
        },
      },
      {
        method: "POST",
        match: "/rest/v1/feedback",
        handler: async (req) => {
          feedbackInsertBody = await req.text();
          return jsonResponse([{ id: "fb2" }], 201);
        },
      },
    ],
  });
  try {
    const resp = await handle(
      feedbackReq({
        page_path: "/jobs",
        category: "bug",
        message: "filter stops working when I pick three states at once",
      }),
    );
    await assertJsonResponse(resp, { status: 200, body: { ok: true } });
    assertEquals(anthropicCalled, true, "anthropic must be called when key present");
    const sent = JSON.parse(feedbackInsertBody as string);
    const row = Array.isArray(sent) ? sent[0] : sent;
    assertEquals(row.claude_priority, "p1");
    assertStringIncludes(row.claude_summary as string, "search filter");
  } finally {
    t.restore();
  }
});

// ─── Rate limit ────────────────────────────────────────────────────────
Deno.test("returns 429 when rate-limit count >= 5", async () => {
  let anthropicCalled = false;
  const t = setupTest({
    env: { ANTHROPIC_API_KEY: "test-anthropic-key" },
    routes: [
      {
        match: "feedback_rate_limits",
        handler: () => {
          // Return Content-Range "0-4/5" — 5 rows in window, hits the cap.
          return new Response(null, {
            status: 200,
            headers: { "Content-Type": "application/json", "Content-Range": "0-4/5" },
          });
        },
      },
      {
        match: "anthropic.com",
        handler: () => {
          anthropicCalled = true;
          return anthropicMessage("{}");
        },
      },
    ],
  });
  try {
    const resp = await handle(
      feedbackReq({
        page_path: "/jobs",
        message: "this is a real complaint that should be rate-limited",
      }),
    );
    assertEquals(resp.status, 429);
    const body = await resp.json();
    assertStringIncludes(body.error, "rate limited");
    assertEquals(anthropicCalled, false, "anthropic must NOT be called when rate-limited");
  } finally {
    t.restore();
  }
});

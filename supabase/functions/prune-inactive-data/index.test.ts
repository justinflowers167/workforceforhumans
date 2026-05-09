// Phase 14 §B (2026-05-09): unit tests for prune-inactive-data.
//
// Two modes share one secret:
//   - Cron path (default body): retention sweep. Resumes >24mo + inactive
//     seeker are deleted (storage + DB). match_scores >12mo are deleted.
//   - Admin path ({"mode":"delete_resumes_by_ids","resume_ids":[...]}):
//     targeted cleanup with 100-id cap.
//
// Coverage: secret auth, both modes' happy paths, the active-seeker
// safety branch, the admin-mode validation gates.

Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("PRUNE_SECRET", "test-prune-secret");

import { assertEquals, assertStringIncludes } from "std/assert";
import { jsonResponse, pgRows, setupTest } from "../_test/mocks.ts";
import { handle } from "./index.ts";

function pruneReq(secret: string | null, body: unknown = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-prune-secret"] = secret;
  return new Request("https://x/prune-inactive-data", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// PostgREST DELETE with count=exact returns 200/204 with Content-Range
// header indicating count. Use 0 or 1 for the test response.
function deleteWithCount(count: number): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Content-Type": "application/json",
      "Content-Range": `0-${Math.max(0, count - 1)}/${count}`,
    },
  });
}

// supabase-js auth.admin.getUserById response shape — wraps user object.
function authAdminUserResp(authId: string, lastSignInAt: string | null): Response {
  return jsonResponse({
    id: authId,
    aud: "authenticated",
    role: "authenticated",
    email: "u@x.com",
    last_sign_in_at: lastSignInAt,
    app_metadata: {},
    user_metadata: {},
  });
}

// Storage.remove response — array of removed objects.
function storageRemoveResp(paths: string[]): Response {
  return jsonResponse(paths.map((p) => ({ name: p, bucket_id: "resumes" })));
}

// ─── Auth: missing secret ────────────────────────────────────────────
Deno.test("missing x-prune-secret returns 401", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(pruneReq(null));
    assertEquals(resp.status, 401);
    const body = await resp.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    t.restore();
  }
});

// ─── Cron mode: zero stale data ──────────────────────────────────────
Deno.test("cron mode with no stale data returns all-zero counts", async () => {
  let storageRemoveCalled = false;
  const t = setupTest({
    routes: [
      // Stale resumes lookup — empty
      {
        method: "GET",
        match: "/rest/v1/resumes",
        handler: () => pgRows([]),
      },
      // match_scores DELETE — 0 affected
      {
        method: "DELETE",
        match: "/rest/v1/match_scores",
        handler: () => deleteWithCount(0),
      },
      // Storage shouldn't be touched
      {
        match: "/storage/v1",
        handler: () => { storageRemoveCalled = true; return jsonResponse([], 200); },
      },
    ],
  });
  try {
    const resp = await handle(pruneReq("test-prune-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.resumes_considered, 0);
    assertEquals(body.resumes_deleted, 0);
    assertEquals(body.storage_files_deleted, 0);
    assertEquals(body.match_scores_deleted, 0);
    assertEquals(storageRemoveCalled, false, "storage must NOT be touched when no resumes to delete");
  } finally {
    t.restore();
  }
});

// ─── Cron mode: stale resume, inactive seeker → delete ───────────────
Deno.test("cron mode: stale resume with inactive seeker is deleted (storage + DB)", async () => {
  let storageDeletePaths: string[] | null = null;
  let dbDeleteCalled = false;
  const t = setupTest({
    routes: [
      // Auth admin getUserById — seeker has no recent sign-in
      {
        match: "/auth/v1/admin/users/",
        handler: () => authAdminUserResp("auth-user-1", null),
      },
      // Stale resumes lookup
      {
        method: "GET",
        match: "/rest/v1/resumes",
        handler: () => pgRows([{
          id: "resume-1",
          job_seeker_id: "seeker-1",
          file_path: "seeker-1/resume.pdf",
          updated_at: "2024-01-01T00:00:00Z",
          job_seekers: { auth_user_id: "auth-user-1" },
        }]),
      },
      // resumes DELETE
      {
        method: "DELETE",
        match: "/rest/v1/resumes",
        handler: () => { dbDeleteCalled = true; return deleteWithCount(1); },
      },
      // match_scores DELETE
      {
        method: "DELETE",
        match: "/rest/v1/match_scores",
        handler: () => deleteWithCount(0),
      },
      // Storage remove
      {
        method: "DELETE",
        match: "/storage/v1/object/resumes",
        handler: async (req) => {
          const body = await req.json();
          storageDeletePaths = body.prefixes;
          return storageRemoveResp(body.prefixes);
        },
      },
    ],
  });
  try {
    const resp = await handle(pruneReq("test-prune-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.resumes_considered, 1);
    assertEquals(body.resumes_deleted, 1);
    assertEquals(body.storage_files_deleted, 1);
    assertEquals(dbDeleteCalled, true);
    assertEquals(storageDeletePaths, ["seeker-1/resume.pdf"]);
  } finally {
    t.restore();
  }
});

// ─── Cron mode: stale resume, ACTIVE seeker → NOT deleted ────────────
Deno.test("cron mode: stale resume with recently-signed-in seeker is NOT deleted", async () => {
  let dbDeleteCalled = false;
  let storageRemoveCalled = false;
  // Recent sign-in = 1 day ago, well within the 24-month window
  const recentSignIn = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const t = setupTest({
    routes: [
      {
        match: "/auth/v1/admin/users/",
        handler: () => authAdminUserResp("auth-user-1", recentSignIn),
      },
      {
        method: "GET",
        match: "/rest/v1/resumes",
        handler: () => pgRows([{
          id: "resume-1",
          job_seeker_id: "seeker-1",
          file_path: "seeker-1/resume.pdf",
          updated_at: "2024-01-01T00:00:00Z",
          job_seekers: { auth_user_id: "auth-user-1" },
        }]),
      },
      // These two should NOT be hit if the active-seeker logic works.
      {
        method: "DELETE",
        match: "/rest/v1/resumes",
        handler: () => { dbDeleteCalled = true; return deleteWithCount(0); },
      },
      {
        method: "DELETE",
        match: "/storage/v1/object/resumes",
        handler: () => { storageRemoveCalled = true; return jsonResponse([], 200); },
      },
      // match_scores DELETE always fires
      {
        method: "DELETE",
        match: "/rest/v1/match_scores",
        handler: () => deleteWithCount(0),
      },
    ],
  });
  try {
    const resp = await handle(pruneReq("test-prune-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.resumes_considered, 1, "the stale row was considered");
    assertEquals(body.resumes_deleted, 0, "active seeker's resume was NOT deleted");
    assertEquals(dbDeleteCalled, false, "resume DB delete must NOT fire");
    assertEquals(storageRemoveCalled, false, "storage delete must NOT fire");
  } finally {
    t.restore();
  }
});

// ─── Admin mode: empty resume_ids → 400 ──────────────────────────────
Deno.test("admin mode with empty resume_ids returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(pruneReq("test-prune-secret", { mode: "delete_resumes_by_ids", resume_ids: [] }));
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertStringIncludes(body.error, "non-empty");
  } finally {
    t.restore();
  }
});

// ─── Admin mode: > 100 resume_ids → 400 ──────────────────────────────
Deno.test("admin mode with > 100 resume_ids returns 400", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const tooMany = Array.from({ length: 101 }, (_, i) => `resume-${i}`);
    const resp = await handle(pruneReq("test-prune-secret", { mode: "delete_resumes_by_ids", resume_ids: tooMany }));
    assertEquals(resp.status, 400);
    const body = await resp.json();
    assertStringIncludes(body.error, "100");
  } finally {
    t.restore();
  }
});

// ─── Admin mode: happy path ──────────────────────────────────────────
Deno.test("admin mode happy path: storage + DB delete by ids", async () => {
  let storageDeletePaths: string[] | null = null;
  let dbDeleteCalled = false;
  const t = setupTest({
    routes: [
      // Lookup file_paths for the requested ids
      {
        method: "GET",
        match: "/rest/v1/resumes",
        handler: () => pgRows([
          { id: "resume-1", file_path: "user-a/r1.pdf" },
          { id: "resume-2", file_path: "user-b/r2.pdf" },
        ]),
      },
      // Storage delete
      {
        method: "DELETE",
        match: "/storage/v1/object/resumes",
        handler: async (req) => {
          const body = await req.json();
          storageDeletePaths = body.prefixes;
          return storageRemoveResp(body.prefixes);
        },
      },
      // DB delete
      {
        method: "DELETE",
        match: "/rest/v1/resumes",
        handler: () => { dbDeleteCalled = true; return deleteWithCount(2); },
      },
    ],
  });
  try {
    const resp = await handle(pruneReq("test-prune-secret", {
      mode: "delete_resumes_by_ids",
      resume_ids: ["resume-1", "resume-2"],
    }));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.ok, true);
    assertEquals(body.mode, "delete_resumes_by_ids");
    assertEquals(body.requested, 2);
    assertEquals(body.found, 2);
    assertEquals(body.resumes_deleted, 2);
    assertEquals(body.storage_files_deleted, 2);
    assertEquals(dbDeleteCalled, true);
    assertEquals(storageDeletePaths?.sort(), ["user-a/r1.pdf", "user-b/r2.pdf"]);
  } finally {
    t.restore();
  }
});

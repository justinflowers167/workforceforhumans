// Shared test helpers for Edge Function unit tests.
//
// Strategy: stub `globalThis.fetch` for the duration of a test so the
// supabase-js client + Anthropic SDK + raw `fetch` calls all hit
// canned responses. No live network. No spinning up a real server.
//
// Edge Functions are tested by importing their exported `handle(req)`
// helper (added in Phase 11 §B refactor) and calling it directly with
// a mocked Request. The handler resolves its own dependencies through
// `Deno.env.get(...)` + `createClient(...)` + `new Anthropic(...)` —
// all of which read through the stubbed fetch under the hood — so no
// dep-injection plumbing is needed.

import { assertEquals } from "std/assert";

// ─── Fetch stub ────────────────────────────────────────────────────────
//
// Map each (method, url-substring) pair to a canned Response. The
// substring match keeps tests readable: declare `"anthropic.com"` once
// and any model invocation routes there. URL-pattern matching beats
// exact-URL matching because the Anthropic SDK appends `/v1/messages`
// and supabase-js builds query strings dynamically.

export type FetchHandler = (input: Request) => Response | Promise<Response>;

export interface FetchRoute {
  method?: string; // default: any
  match: string | RegExp; // substring or regex against the URL
  handler: FetchHandler | Response | (() => Response);
}

export interface MockFetchOptions {
  routes: FetchRoute[];
  // When true (default), fail loudly if a request matches no route.
  // When false, pass-through to the real fetch (use sparingly).
  strict?: boolean;
}

export interface MockFetchHandle {
  restore: () => void;
  calls: { url: string; method: string; body?: string }[];
}

const ORIGINAL_FETCH = globalThis.fetch;

export function mockFetch(opts: MockFetchOptions): MockFetchHandle {
  const calls: MockFetchHandle["calls"] = [];
  const strict = opts.strict !== false;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // Normalize to a Request so handlers can read body + headers uniformly.
    const req = input instanceof Request ? input.clone() : new Request(input, init);
    const url = req.url;
    const method = req.method.toUpperCase();
    let body: string | undefined;
    try {
      body = await req.clone().text();
    } catch {
      body = undefined;
    }
    calls.push({ url, method, body });

    for (const route of opts.routes) {
      if (route.method && route.method.toUpperCase() !== method) continue;
      const matches = typeof route.match === "string"
        ? url.includes(route.match)
        : route.match.test(url);
      if (!matches) continue;

      const out = typeof route.handler === "function"
        ? await (route.handler as FetchHandler)(req)
        : route.handler;
      return out;
    }

    if (strict) {
      throw new Error(`mockFetch: no route matched ${method} ${url}`);
    }
    return ORIGINAL_FETCH(input, init);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = ORIGINAL_FETCH;
    },
  };
}

// ─── Helpers for common stub responses ─────────────────────────────────

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// PostgREST-shaped response. Used to fake supabase-js table reads.
// supabase-js calls https://<project>.supabase.co/rest/v1/<table>?...
// and expects an array of rows (or a single row when .single() is in
// the query — that's reflected in PostgREST's own count headers, but
// for our purposes returning the array is enough; the single() helper
// returns rows[0] from the body).
export function pgRows(rows: unknown[]): Response {
  return jsonResponse(rows);
}

// Supabase auth.getUser() response shape. Returned by GET /auth/v1/user.
export function authUser(id: string, email: string): Response {
  return jsonResponse({
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
  });
}

// Anthropic messages.create() response shape.
export function anthropicMessage(text: string): Response {
  return jsonResponse({
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-test",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 },
  });
}

// ─── Env stub ──────────────────────────────────────────────────────────
//
// Override Deno.env.get(...) for the duration of a test. Tests should
// always restore via the returned handle (use try/finally or t.step
// teardown). Falls through to the real env for any key not in the map.

export interface MockEnvHandle {
  restore: () => void;
}

const ORIGINAL_ENV_GET = Deno.env.get.bind(Deno.env);

export function mockEnv(values: Record<string, string>): MockEnvHandle {
  Deno.env.get = ((key: string) => {
    if (key in values) return values[key];
    return ORIGINAL_ENV_GET(key);
  }) as typeof Deno.env.get;
  return {
    restore() {
      Deno.env.get = ORIGINAL_ENV_GET;
    },
  };
}

// ─── Test setup convenience ────────────────────────────────────────────
//
// A small wrapper that pairs mockFetch + mockEnv with auto-restore on
// test exit. Use inside Deno.test:
//
//   Deno.test("example", async () => {
//     const t = setupTest({
//       env: { ANTHROPIC_API_KEY: "test-key" },
//       routes: [{ match: "anthropic.com", handler: anthropicMessage('{"ok":true}') }],
//     });
//     try {
//       // ... arrange / act / assert
//     } finally {
//       t.restore();
//     }
//   });

export interface TestSetup {
  fetchCalls: MockFetchHandle["calls"];
  restore: () => void;
}

export function setupTest(opts: {
  env?: Record<string, string>;
  routes: FetchRoute[];
  strictFetch?: boolean;
}): TestSetup {
  const env = opts.env ? mockEnv(opts.env) : null;
  const fetchHandle = mockFetch({ routes: opts.routes, strict: opts.strictFetch });
  return {
    fetchCalls: fetchHandle.calls,
    restore() {
      fetchHandle.restore();
      env?.restore();
    },
  };
}

// ─── Assertion shortcuts ───────────────────────────────────────────────

export async function assertJsonResponse(
  resp: Response,
  expected: { status?: number; body?: Record<string, unknown> },
): Promise<unknown> {
  if (expected.status !== undefined) {
    assertEquals(resp.status, expected.status, `status mismatch`);
  }
  const body = await resp.json();
  if (expected.body) {
    for (const [k, v] of Object.entries(expected.body)) {
      assertEquals(
        (body as Record<string, unknown>)[k],
        v,
        `body.${k} mismatch (got ${JSON.stringify(body)})`,
      );
    }
  }
  return body;
}

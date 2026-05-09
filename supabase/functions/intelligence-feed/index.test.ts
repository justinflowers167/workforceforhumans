// Phase 14 §B (2026-05-09): unit tests for intelligence-feed.
//
// Daily cron: pulls 8 RSS feeds + layoffs.fyi CSV, regex-classifies item
// type / severity / is_positive, extracts image URLs, upserts into
// feed_items. Optional OpenAI embedding pass (skipped when no key).
//
// Coverage: secret auth, happy path (RSS + layoffs.fyi succeed), RSS
// network errors (continue), layoffs.fyi unavailable (RSS still runs).

Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("INTELLIGENCE_FEED_SECRET", "test-feed-secret");

import { assertEquals } from "std/assert";
import { jsonResponse, setupTest } from "../_test/mocks.ts";
import { handle } from "./index.ts";

function feedReq(secret: string | null): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-intelligence-feed-secret"] = secret;
  return new Request("https://x/intelligence-feed", { method: "POST", headers, body: "{}" });
}

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Acme Corp lays off 1500 workers</title>
      <link>https://example.com/news/1</link>
      <description>Acme Corp announced major workforce reductions.</description>
      <pubDate>2026-05-08T00:00:00Z</pubDate>
      <media:content url="https://example.com/img/1.jpg" />
    </item>
  </channel>
</rss>`;

const SAMPLE_LAYOFFS_CSV = `company,location,industry,total_laid_off,percentage,date,source,funds_raised,stage,country,date_added
TestCo,SF Bay Area,Tech,250,10,${new Date().toISOString().split("T")[0]},Bloomberg,500,Series C,US,${new Date().toISOString().split("T")[0]}
`;

function rssResponse(xml = SAMPLE_RSS): Response {
  return new Response(xml, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
}

function csvResponse(csv = SAMPLE_LAYOFFS_CSV): Response {
  return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv" } });
}

// ─── Auth: missing secret ────────────────────────────────────────────
Deno.test("missing x-intelligence-feed-secret returns 401", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(feedReq(null));
    assertEquals(resp.status, 401);
    const body = await resp.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    t.restore();
  }
});

// ─── Auth: wrong secret ──────────────────────────────────────────────
Deno.test("wrong x-intelligence-feed-secret returns 401", async () => {
  const t = setupTest({ routes: [], strictFetch: false });
  try {
    const resp = await handle(feedReq("wrong"));
    assertEquals(resp.status, 401);
  } finally {
    t.restore();
  }
});

// ─── Happy path: all 8 RSS feeds + layoffs.fyi ───────────────────────
Deno.test("happy path: 8 RSS feeds + layoffs.fyi return content, no OpenAI key", async () => {
  let upsertCount = 0;
  let openaiCalled = false;
  const t = setupTest({
    routes: [
      // All 8 RSS feed URLs — match by /feed|rss/ since every URL contains one of those
      { match: /\.rss|\/(feed|rss)/i, handler: () => rssResponse() },
      // layoffs.fyi CSV
      { match: "layoffs.fyi", handler: () => csvResponse() },
      // OpenAI — should NOT be called (no key)
      { match: "openai.com", handler: () => { openaiCalled = true; return jsonResponse({}, 200); } },
      // feed_items upsert
      {
        match: "/rest/v1/feed_items",
        handler: () => { upsertCount++; return jsonResponse([], 201); },
      },
    ],
  });
  try {
    const resp = await handle(feedReq("test-feed-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.success, true);
    // 8 RSS sources × 1 item each = 8 RSS upserts
    assertEquals(body.results.rss_feeds, 8, `expected 8 RSS items inserted, got ${body.results.rss_feeds}`);
    // 1 layoffs.fyi entry
    assertEquals(body.results.layoffs_fyi, 1, `expected 1 layoffs.fyi item, got ${body.results.layoffs_fyi}`);
    // Embeddings skipped (no key)
    assertEquals(body.results.embeddings_generated, 0);
    assertEquals(openaiCalled, false, "OpenAI must NOT be called when no key set");
    // 8 RSS + 1 layoffs = 9 upserts
    assertEquals(upsertCount, 9);
  } finally {
    t.restore();
  }
});

// ─── RSS errors: all 8 feeds 500, function continues ─────────────────
Deno.test("all RSS feeds 500: function continues, layoffs.fyi still runs", async () => {
  let upsertCount = 0;
  const t = setupTest({
    routes: [
      { match: /\.rss|\/(feed|rss)/i, handler: () => new Response("Server Error", { status: 500 }) },
      { match: "layoffs.fyi", handler: () => csvResponse() },
      {
        match: "/rest/v1/feed_items",
        handler: () => { upsertCount++; return jsonResponse([], 201); },
      },
    ],
  });
  try {
    const resp = await handle(feedReq("test-feed-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.success, true);
    assertEquals(body.results.rss_feeds, 0, "no RSS items when all feeds 500");
    assertEquals(body.results.layoffs_fyi, 1, "layoffs.fyi still ran");
    assertEquals(upsertCount, 1, "only the layoffs.fyi upsert fired");
  } finally {
    t.restore();
  }
});

// ─── Empty RSS feeds: parsed but yield 0 items ───────────────────────
Deno.test("empty RSS XML yields 0 inserts", async () => {
  let upsertCount = 0;
  const emptyRss = `<?xml version="1.0"?><rss><channel><title>Empty</title></channel></rss>`;
  const t = setupTest({
    routes: [
      { match: /\.rss|\/(feed|rss)/i, handler: () => rssResponse(emptyRss) },
      { match: "layoffs.fyi", handler: () => new Response("not found", { status: 404 }) },
      {
        match: "/rest/v1/feed_items",
        handler: () => { upsertCount++; return jsonResponse([], 201); },
      },
    ],
  });
  try {
    const resp = await handle(feedReq("test-feed-secret"));
    assertEquals(resp.status, 200);
    const body = await resp.json();
    assertEquals(body.success, true);
    assertEquals(body.results.rss_feeds, 0);
    assertEquals(body.results.layoffs_fyi, 0);
    assertEquals(upsertCount, 0, "no upserts when nothing to insert");
  } finally {
    t.restore();
  }
});

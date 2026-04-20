// News + layoff aggregator. Live deployed function captured into repo for
// parity in Phase 3 — do not refactor without coordinating a redeploy.
// Pulls WARN Act, RSS feeds, layoffs.fyi into feed_items, then generates
// embeddings via OpenAI for semantic search.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, supabaseServiceKey);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const results = {
      warn_act: 0,
      rss_feeds: 0,
      layoffs_fyi: 0,
      embeddings_generated: 0,
      errors: [] as string[],
    };

    try {
      const warnCount = await fetchWarnAct();
      results.warn_act = warnCount;
    } catch (e) {
      results.errors.push(`WARN Act: ${e.message}`);
    }

    try {
      const rssCount = await fetchRssFeeds();
      results.rss_feeds = rssCount;
    } catch (e) {
      results.errors.push(`RSS: ${e.message}`);
    }

    try {
      const lfiCount = await fetchLayoffsFyi();
      results.layoffs_fyi = lfiCount;
    } catch (e) {
      results.errors.push(`Layoffs.fyi: ${e.message}`);
    }

    if (OPENAI_API_KEY) {
      try {
        const embCount = await generateEmbeddings();
        results.embeddings_generated = embCount;
      } catch (e) {
        results.errors.push(`Embeddings: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("intelligence-feed error:", e);
    return new Response(JSON.stringify({ success: false, error: "feed aggregation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchWarnAct(): Promise<number> {
  let inserted = 0;
  const warnSources = [
    { state: "CO", url: "https://cdle.colorado.gov/employers/layoff-separations/warn-list", name: "Colorado WARN Act Filings" },
    { state: "TX", url: "https://www.twc.texas.gov/businesses/worker-adjustment-and-retraining-notification-warn-notices", name: "Texas WARN Act Filings" },
    { state: "CA", url: "https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/", name: "California WARN Act Filings" },
  ];
  console.log(`[WARN Act] Would check ${warnSources.length} state sources`);
  return inserted;
}

async function fetchRssFeeds(): Promise<number> {
  let inserted = 0;
  const feeds = [
    { url: "https://techcrunch.com/tag/layoffs/feed/", source: "rss-techcrunch", defaultType: "layoff" as const },
    { url: "https://www.bls.gov/feed/bls_latest.rss", source: "rss-bls", defaultType: "industry-news" as const },
  ];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "WorkforceForHumans/1.0 (news-aggregator)" },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const items = parseRssXml(xml);

      for (const item of items.slice(0, 15)) {
        const isLayoff = /layoff|laid off|cut.?jobs|workforce reduction|downsiz|restructur/i.test(item.title + " " + item.description);
        const isHiring = /hiring|job.?growth|employment.?surge|new.?jobs/i.test(item.title + " " + item.description);
        const itemType = isLayoff ? "layoff" : isHiring ? "hiring-surge" : feed.defaultType;
        const companyMatch = item.title.match(/^([A-Z][a-zA-Z\s&.]+?)(?:\s+(?:to|is|will|cuts|lays|announces))/);
        const companyName = companyMatch ? companyMatch[1].trim() : null;
        const sourceId = hashString(item.link || item.title);

        const { error } = await db.from("feed_items").upsert(
          {
            source: feed.source,
            source_id: sourceId,
            source_url: item.link,
            item_type: itemType,
            title: item.title,
            summary: (item.description || "").slice(0, 500),
            company_name: companyName,
            tags: extractTags(item.title + " " + item.description),
            event_date: item.pubDate ? new Date(item.pubDate).toISOString().split("T")[0] : null,
            severity: isLayoff ? "high" : "low",
            is_verified: false,
          },
          { onConflict: "source,source_id" }
        );
        if (!error) inserted++;
      }
    } catch (e) {
      console.error(`[RSS] Error fetching ${feed.source}: ${e.message}`);
    }
  }
  return inserted;
}

function parseRssXml(xml: string): Array<{ title: string; link: string; description: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");
    if (title) items.push({ title: stripHtml(title), link: link || "", description: stripHtml(description || ""), pubDate: pubDate || "" });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

async function fetchLayoffsFyi(): Promise<number> {
  let inserted = 0;
  try {
    const csvUrl = "https://layoffs.fyi/data/layoffs.csv";
    const res = await fetch(csvUrl, { headers: { "User-Agent": "WorkforceForHumans/1.0" } });
    if (!res.ok) { console.log("[Layoffs.fyi] Could not fetch CSV, status:", res.status); return 0; }
    const csv = await res.text();
    const lines = csv.split("\n").slice(1);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    for (const line of lines.slice(0, 50)) {
      const cols = parseCsvLine(line);
      if (cols.length < 5) continue;
      const [company, location, industry, count, , dateStr] = cols;
      if (!company || !dateStr) continue;
      const eventDate = new Date(dateStr);
      if (eventDate < weekAgo) continue;
      const affected = parseInt(count) || 0;
      const sourceId = `lfi-${company.toLowerCase().replace(/\s+/g, "-")}-${dateStr}`;
      const { error } = await db.from("feed_items").upsert(
        {
          source: "layoffs-fyi", source_id: sourceId, source_url: "https://layoffs.fyi",
          item_type: "layoff",
          title: `${company} lays off ${affected > 0 ? affected.toLocaleString() + " employees" : "workers"}`,
          summary: `${company}${industry ? ` (${industry})` : ""}${location ? ` in ${location}` : ""} announced layoffs${affected > 0 ? ` affecting ${affected.toLocaleString()} employees` : ""}.`,
          company_name: company, industry: industry || null, affected_count: affected || null,
          event_date: dateStr,
          severity: affected > 500 ? "critical" : affected > 100 ? "high" : "medium",
          is_verified: true, tags: ["layoff", "layoffs-fyi", ...(industry ? [industry.toLowerCase()] : [])],
        },
        { onConflict: "source,source_id" }
      );
      if (!error) inserted++;
    }
  } catch (e) { console.error(`[Layoffs.fyi] Error: ${e.message}`); }
  return inserted;
}

async function generateEmbeddings(): Promise<number> {
  let generated = 0;
  const { data: items } = await db.from("feed_items").select("id, title, summary, company_name, industry").is("embedding", null).limit(25);
  if (!items || items.length === 0) return 0;
  for (const item of items) {
    const text = [item.title, item.summary, item.company_name, item.industry].filter(Boolean).join(". ");
    const embedding = await getEmbedding(text);
    if (embedding) { await db.from("feed_items").update({ embedding }).eq("id", item.id); generated++; }
  }
  const { data: training } = await db.from("training_resources").select("id, title, description, tags, category_slug").is("embedding", null).limit(25);
  if (training) {
    for (const t of training) {
      const text = [t.title, t.description, ...(t.tags || [])].filter(Boolean).join(". ");
      const embedding = await getEmbedding(text);
      if (embedding) { await db.from("training_resources").update({ embedding }).eq("id", t.id); generated++; }
    }
  }
  return generated;
}

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: text.slice(0, 8000), model: "text-embedding-3-small" }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) { const char = str.charCodeAt(i); hash = (hash << 5) - hash + char; hash |= 0; }
  return Math.abs(hash).toString(36);
}

function extractTags(text: string): string[] {
  const keywords = ["layoff","hiring","remote","AI","tech","healthcare","construction","manufacturing","logistics","retail","finance","education","energy","government","startup","restructuring","automation","workforce","union"];
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k.toLowerCase()));
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []; let current = ""; let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; } else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; } else { current += char; }
  }
  result.push(current.trim()); return result;
}

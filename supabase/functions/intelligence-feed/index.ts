// News + workforce-trend aggregator. Pulls from RSS sources and
// layoffs.fyi into feed_items, then generates OpenAI embeddings for
// semantic search. Phase 12 (2026-04-27) rewrite:
//   - Auth via x-intelligence-feed-secret header (server-to-server only,
//     mirroring refresh-jobs / send-match-digest / prune-inactive-data).
//   - Broader source list (8 RSS sources) biased toward neutral/positive
//     signal — fixes the layoff-heavy feed founder flagged 2026-04-26.
//   - Image extraction from <media:content>, <enclosure>, <image>.
//   - is_positive auto-tagging for hiring/training/opportunity items.
//   - WARN Act stub deleted (was logging "Would check" with no action
//     for ~3 weeks; real state-by-state scrapers are a separate task).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, supabaseServiceKey);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const INTELLIGENCE_FEED_SECRET = Deno.env.get("INTELLIGENCE_FEED_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intelligence-feed-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Cron-only auth. Constant-time compare against the pre-shared secret.
  const provided = req.headers.get("x-intelligence-feed-secret") || "";
  if (!INTELLIGENCE_FEED_SECRET || !timingSafeEqual(provided, INTELLIGENCE_FEED_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Phase 12: server-to-server auth. Cron fires with the pre-shared
  // secret; ad-hoc invocations must include the same header.
  const provided = req.headers.get("x-intelligence-feed-secret") || "";
  if (!INTELLIGENCE_FEED_SECRET || provided !== INTELLIGENCE_FEED_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const results = {
      rss_feeds: 0,
      layoffs_fyi: 0,
      embeddings_generated: 0,
      errors: [] as string[],
    };

    try {
      results.rss_feeds = await fetchRssFeeds();
    } catch (e) {
      results.errors.push(`RSS: ${(e as Error).message}`);
    }

    try {
      results.layoffs_fyi = await fetchLayoffsFyi();
    } catch (e) {
      results.errors.push(`Layoffs.fyi: ${(e as Error).message}`);
    }

    if (OPENAI_API_KEY) {
      try {
        results.embeddings_generated = await generateEmbeddings();
      } catch (e) {
        results.errors.push(`Embeddings: ${(e as Error).message}`);
      }
    }

    console.log("intelligence-feed result:", JSON.stringify(results));
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("intelligence-feed error:", e);
    return new Response(JSON.stringify({ success: false, error: "feed aggregation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ─── RSS feeds ────────────────────────────────────────────────────────
//
// Phase 12 source list (8 feeds), balanced layoff/neutral/positive:
//   - Layoffs (severity: high default): TechCrunch.
//   - Industry data (severity: low default): BLS, Indeed Hiring Lab,
//     GovExec Workforce.
//   - Policy/category-shift (severity: medium): US DOL Workforce
//     Investment, O*NET Updates.
//   - Opportunity / training (severity: low, is_positive: true):
//     Course Report, Khan Academy Blog.
//
// Each source has a permissive default; isLayoff/isHiring/isPositive
// regex on title+description can reclassify per-item.
async function fetchRssFeeds(): Promise<number> {
  let inserted = 0;
  const feeds: Array<{ url: string; source: string; defaultType: "layoff" | "industry-news" | "policy-change" | "opportunity"; defaultSeverity: "low" | "medium" | "high" | "critical"; defaultPositive: boolean }> = [
    { url: "https://techcrunch.com/tag/layoffs/feed/", source: "rss-techcrunch", defaultType: "layoff", defaultSeverity: "high", defaultPositive: false },
    { url: "https://www.bls.gov/feed/bls_latest.rss", source: "rss-bls", defaultType: "industry-news", defaultSeverity: "low", defaultPositive: false },
    { url: "https://www.dol.gov/agencies/eta/news/rss", source: "rss-dol-eta", defaultType: "policy-change", defaultSeverity: "medium", defaultPositive: false },
    { url: "https://www.hiringlab.org/feed/", source: "rss-hiringlab", defaultType: "industry-news", defaultSeverity: "low", defaultPositive: false },
    { url: "https://www.coursereport.com/blog.rss", source: "rss-coursereport", defaultType: "opportunity", defaultSeverity: "low", defaultPositive: true },
    { url: "https://www.onetcenter.org/news.rss", source: "rss-onet", defaultType: "policy-change", defaultSeverity: "medium", defaultPositive: false },
    { url: "https://blog.khanacademy.org/feed/", source: "rss-khan", defaultType: "opportunity", defaultSeverity: "low", defaultPositive: true },
    { url: "https://www.govexec.com/rss/workforce/", source: "rss-govexec", defaultType: "industry-news", defaultSeverity: "low", defaultPositive: false },
  ];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "WorkforceForHumans/1.0 (news-aggregator; hello@workforceforhumans.com)" },
      });
      if (!res.ok) {
        console.error(`[RSS] ${feed.source} HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      const items = parseRssXml(xml);

      for (const item of items.slice(0, 15)) {
        const text = item.title + " " + item.description;
        const isLayoff = /layoff|laid off|cut\s+jobs|workforce reduction|downsiz|restructur|job cut/i.test(text);
        const isHiring = /hiring|job\s*growth|employment\s*surge|new\s+jobs|hiring spree|job openings|expanding workforce/i.test(text);
        const isPositiveSignal = /train(ing|s)|reskill|upskill|apprentice|scholarship|grant|free course|certification launch|workforce program|career pathway|new program/i.test(text);

        const itemType = isLayoff
          ? "layoff"
          : isHiring
          ? "hiring-surge"
          : isPositiveSignal
          ? "opportunity"
          : feed.defaultType;

        const severity = isLayoff ? "high" : feed.defaultSeverity;
        const isPositive = feed.defaultPositive || isHiring || isPositiveSignal;

        const companyMatch = item.title.match(/^([A-Z][a-zA-Z\s&.]+?)(?:\s+(?:to|is|will|cuts|lays|announces|hiring))/);
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
            tags: extractTags(text),
            event_date: item.pubDate ? new Date(item.pubDate).toISOString().split("T")[0] : null,
            severity,
            is_positive: isPositive,
            image_url: item.imageUrl || null,
            is_verified: false,
          },
          { onConflict: "source,source_id" },
        );
        if (!error) inserted++;
      }
    } catch (e) {
      console.error(`[RSS] Error fetching ${feed.source}: ${(e as Error).message}`);
    }
  }
  return inserted;
}

// Parse a generic RSS XML blob. Pulls title/link/description/pubDate plus
// the first available image URL from media:content, enclosure[url], or
// <image> element. Order is by likelihood: media:content first because
// it's the modern Yahoo Media RSS namespace and most likely to carry an
// article hero image.
function parseRssXml(xml: string): Array<{ title: string; link: string; description: string; pubDate: string; imageUrl: string }> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string; imageUrl: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = stripHtml(extractTag(block, "title"));
    const link = extractTag(block, "link");
    const description = stripHtml(extractTag(block, "description"));
    const pubDate = extractTag(block, "pubDate");
    const imageUrl = extractImageUrl(block);
    if (title) items.push({ title, link: link || "", description, pubDate: pubDate || "", imageUrl });
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

// Extract the first usable image URL from an RSS <item> block.
// Tries (in order): <media:content url="..."/>, <enclosure url="..."/>,
// <image>...</image>. Returns "" if none found.
function extractImageUrl(block: string): string {
  // <media:content url="..." /> — Yahoo Media RSS namespace. Most modern feeds.
  const media = block.match(/<media:content[^>]*\burl=["']([^"']+)["']/i);
  if (media && media[1]) return media[1];
  // <enclosure url="..." type="image/..."/> — RSS 2.0 binary attachments.
  const enc = block.match(/<enclosure[^>]*\burl=["']([^"']+)["'][^>]*\btype=["']image\//i);
  if (enc && enc[1]) return enc[1];
  // <enclosure url="..."/> without type — last resort, accept if extension looks like an image.
  const enc2 = block.match(/<enclosure[^>]*\burl=["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/i);
  if (enc2 && enc2[1]) return enc2[1];
  // <image>https://...</image> — older convention.
  const img = block.match(/<image>\s*(https?:\/\/[^<\s]+)\s*<\/image>/i);
  if (img && img[1]) return img[1];
  return "";
}

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function fetchLayoffsFyi(): Promise<number> {
  let inserted = 0;
  try {
    const csvUrl = "https://layoffs.fyi/data/layoffs.csv";
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "WorkforceForHumans/1.0 (hello@workforceforhumans.com)" },
    });
    if (!res.ok) {
      console.log("[Layoffs.fyi] Could not fetch CSV, status:", res.status);
      return 0;
    }
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
          source: "layoffs-fyi",
          source_id: sourceId,
          source_url: "https://layoffs.fyi",
          item_type: "layoff",
          title: `${company} lays off ${affected > 0 ? affected.toLocaleString() + " employees" : "workers"}`,
          summary: `${company}${industry ? ` (${industry})` : ""}${location ? ` in ${location}` : ""} announced layoffs${affected > 0 ? ` affecting ${affected.toLocaleString()} employees` : ""}.`,
          company_name: company,
          industry: industry || null,
          affected_count: affected || null,
          event_date: dateStr,
          severity: affected > 500 ? "critical" : affected > 100 ? "high" : "medium",
          is_positive: false,
          is_verified: true,
          tags: ["layoff", "layoffs-fyi", ...(industry ? [industry.toLowerCase()] : [])],
        },
        { onConflict: "source,source_id" },
      );
      if (!error) inserted++;
    }
  } catch (e) {
    console.error(`[Layoffs.fyi] Error: ${(e as Error).message}`);
  }
  return inserted;
}

async function generateEmbeddings(): Promise<number> {
  let generated = 0;
  const { data: items } = await db
    .from("feed_items")
    .select("id, title, summary, company_name, industry")
    .is("embedding", null)
    .limit(25);
  if (items && items.length) {
    for (const item of items) {
      const text = [item.title, item.summary, item.company_name, item.industry].filter(Boolean).join(". ");
      const embedding = await getEmbedding(text);
      if (embedding) {
        await db.from("feed_items").update({ embedding }).eq("id", item.id);
        generated++;
      }
    }
  }
  const { data: training } = await db
    .from("training_resources")
    .select("id, title, description, tags, category_slug")
    .is("embedding", null)
    .limit(25);
  if (training) {
    for (const t of training) {
      const text = [t.title, t.description, ...(t.tags || [])].filter(Boolean).join(". ");
      const embedding = await getEmbedding(text);
      if (embedding) {
        await db.from("training_resources").update({ embedding }).eq("id", t.id);
        generated++;
      }
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
  } catch {
    return null;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function extractTags(text: string): string[] {
  const keywords = [
    "layoff", "hiring", "remote", "AI", "tech", "healthcare", "construction",
    "manufacturing", "logistics", "retail", "finance", "education", "energy",
    "government", "startup", "restructuring", "automation", "workforce", "union",
    "training", "apprentice", "reskill", "upskill", "veterans", "scholarship",
  ];
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k.toLowerCase()));
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

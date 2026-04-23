// Weekly digest: emails each opted-in member their new (unemailed) job matches via Resend.
// Safe to invoke manually or schedule via pg_cron → http extension. Protected by a secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DIGEST_SECRET = Deno.env.get("DIGEST_SECRET") || "";
const FROM_EMAIL = Deno.env.get("DIGEST_FROM") || "Workforce for Humans <digest@workforceforhumans.com>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://workforceforhumans.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-digest-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Simple shared-secret auth — this function runs server-to-server, not from the browser.
  const provided = req.headers.get("x-digest-secret") || "";
  if (!DIGEST_SECRET || provided !== DIGEST_SECRET) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pending, error: qErr } = await admin
      .from("match_scores")
      .select("id, job_seeker_id, match_target_id, score, rationale, growth_note, match_reasons, job_seekers!inner(id, email, first_name, newsletter_opt_in)")
      .eq("match_type", "job")
      .is("emailed_at", null)
      .gte("score", 60)
      .order("score", { ascending: false });
    if (qErr) throw qErr;
    if (!pending?.length) return json({ ok: true, sent: 0 });

    // Group by seeker
    const bySeeker = new Map<string, any[]>();
    for (const row of pending) {
      // @ts-ignore join shape
      if (row.job_seekers?.newsletter_opt_in === false) continue;
      const list = bySeeker.get(row.job_seeker_id) || [];
      list.push(row);
      bySeeker.set(row.job_seeker_id, list);
    }

    const jobIds = Array.from(new Set(pending.map((r) => r.match_target_id).filter(Boolean)));
    const { data: jobs } = await admin
      .from("jobs")
      .select("id, title, slug, location_city, location_state, is_remote, pay_type, pay_min, pay_max, employers(name)")
      .in("id", jobIds);
    const jobById = new Map((jobs || []).map((j: any) => [j.id, j]));

    let sent = 0;
    const sentIds: string[] = [];

    for (const [seekerId, rows] of bySeeker) {
      // @ts-ignore
      const seeker = rows[0].job_seekers;
      if (!seeker?.email) continue;

      const items = rows.slice(0, 10).map((r) => {
        const j = jobById.get(r.match_target_id);
        if (!j) return "";
        const loc = j.is_remote ? "Remote" : [j.location_city, j.location_state].filter(Boolean).join(", ");
        const pay =
          j.pay_min || j.pay_max
            ? `$${j.pay_min ?? ""}${j.pay_max ? `–$${j.pay_max}` : ""} ${j.pay_type === "hourly" ? "/hr" : "/yr"}`
            : "";
        // Phase 7 email template: render rationale + growth_note in the same
        // "Claude's read" shape we show on member.html. Either field may be
        // null on pre-Phase-7 rows (already-emailed_at filter excludes most).
        const fitHtml = r.rationale
          ? `<div style="font-size:14px;line-height:1.5;margin:10px 0 6px;color:#111827;">${escapeHtml(r.rationale)}</div>`
          : "";
        const edgeHtml = r.growth_note
          ? `<div style="font-size:13px;line-height:1.5;margin:6px 0 8px;color:#4b5563;"><b style="color:#c85f3e;">Next edge:</b> ${escapeHtml(r.growth_note)}</div>`
          : "";
        return `
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;">
            <div style="font-weight:600;font-size:16px;">${escapeHtml(j.title)}</div>
            <div style="color:#4b5563;font-size:14px;margin:4px 0;">${escapeHtml(j.employers?.name || "")} · ${escapeHtml(loc)} ${pay ? "· " + escapeHtml(pay) : ""}</div>
            ${fitHtml}
            ${edgeHtml}
            <div style="font-size:13px;color:#6b7280;">Match score: <b>${r.score}</b></div>
            <a href="${SITE_URL}/jobs.html?id=${escapeHtml(j.id)}" style="display:inline-block;margin-top:8px;background:#111827;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-size:14px;">View role</a>
          </div>`;
      }).join("");

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
          <h1 style="font-size:22px;margin-bottom:4px;">New matches for you${seeker.first_name ? `, ${escapeHtml(seeker.first_name)}` : ""}</h1>
          <p style="color:#4b5563;margin-top:0;">Roles we think fit your profile this week.</p>
          ${items}
          <p style="color:#6b7280;font-size:12px;margin-top:24px;">
            <a href="${SITE_URL}/member.html">Update preferences</a> · You are receiving this because you signed up at Workforce for Humans.
          </p>
        </div>`;

      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [seeker.email],
          subject: `${rows.length} new job match${rows.length === 1 ? "" : "es"} for you`,
          html,
        }),
      });
      if (!r.ok) {
        console.error("resend failed", seekerId, await r.text());
        continue;
      }
      sent++;
      for (const row of rows) sentIds.push(row.id);
    }

    if (sentIds.length) {
      await admin.from("match_scores").update({ emailed_at: new Date().toISOString() }).in("id", sentIds);
    }

    return json({ ok: true, sent, marked: sentIds.length });
  } catch (err) {
    console.error("send-match-digest error:", err);
    return json({ error: "internal error" }, 500);
  }
});

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>
  )[c]);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

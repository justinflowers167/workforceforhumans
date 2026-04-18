// Stripe webhook: idempotent fulfillment of checkouts + subscription state sync.
//
// Server-to-server: Stripe POSTs here, no Supabase JWT. Authenticated by
// verifying the Stripe signature against the raw body (see notes below).
//
// Idempotency: every event is upserted into stripe_webhook_events keyed by
// stripe_event_id. A duplicate insert short-circuits processing. Failed
// events do NOT auto-retry — diagnose via stripe_webhook_events.error_message
// then clear the row and re-deliver from the Stripe dashboard.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Workforce for Humans <hello@workforceforhumans.com>";
const SITE_URL = Deno.env.get("SITE_URL") || "https://workforceforhumans.com";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16" });
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!STRIPE_KEY || !WEBHOOK_SECRET) return json({ error: "Stripe secrets not configured" }, 500);

  // Must read raw body BEFORE anything that consumes the stream (req.json()
  // would break signature verification because the parsed-then-stringified
  // payload differs from what Stripe signed).
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing stripe-signature header" }, 400);

  let event: Stripe.Event;
  try {
    // constructEventAsync uses Web Crypto (required in Deno). The sync
    // constructEvent uses Node-only HMAC and throws.
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return json({ error: "Invalid signature" }, 400);
  }

  // Insert-then-process idempotency. Conflict on stripe_event_id short-circuits.
  const { data: inserted, error: insErr } = await admin
    .from("stripe_webhook_events")
    .upsert(
      { stripe_event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown>, status: "pending" },
      { onConflict: "stripe_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (insErr) {
    console.error("Failed to record webhook event:", insErr.message);
    return json({ error: "DB error recording event" }, 500);
  }
  if (!inserted || inserted.length === 0) {
    return json({ ok: true, idempotent: true });
  }

  try {
    let status: "success" | "skipped" = "success";
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "checkout.session.expired":
        await handleCheckoutExpired(event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event);
        break;
      case "invoice.paid":
        // Renewal — subscription.updated will follow with the new period_end.
        break;
      default:
        status = "skipped";
    }

    await admin.from("stripe_webhook_events")
      .update({ status, processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);

    return json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error(`Event ${event.id} (${event.type}) failed:`, msg);
    await admin.from("stripe_webhook_events")
      .update({ status: "failed", error_message: msg, processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);
    // Stripe will retry, but the unique conflict short-circuits the retry.
    // Manual remediation: clear the audit row and re-send from the dashboard.
    return json({ error: msg }, 500);
  }
});

async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const employerId = session.metadata?.employer_id ?? session.client_reference_id ?? null;
  const jobPostingId = session.metadata?.job_posting_id ?? null;
  const plan = session.metadata?.plan ?? null;
  const customerId = (typeof session.customer === "string" ? session.customer : session.customer?.id) ?? null;

  // For one-time plans (basic, featured): mark the posting paid.
  if (jobPostingId) {
    await admin.from("job_postings").update({
      status: "paid",
      stripe_payment_id: (session.payment_intent as string) || (session.subscription as string) || session.id,
      stripe_session_id: session.id,
      paid_at: new Date().toISOString(),
      stripe_event_id: event.id,
    }).eq("id", jobPostingId).eq("status", "pending");
  }

  // Always stamp the customer ID on the employer (subscription bookkeeping
  // happens via subscription.created which arrives separately).
  if (employerId && customerId) {
    const updates: Record<string, unknown> = { stripe_customer_id: customerId };
    if (plan === "employer" && session.subscription) {
      updates.subscription_id = session.subscription as string;
    }
    await admin.from("employers").update(updates).eq("id", employerId);
  }

  // Send the confirmation email asynchronously so a slow Resend call doesn't
  // blow Stripe's ~10s response budget.
  if (RESEND_API_KEY && employerId) {
    const task = sendConfirmationEmail(employerId, plan ?? "basic");
    // @ts-ignore EdgeRuntime is provided by Supabase's edge-runtime.d.ts
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else {
      await task;
    }
  }
}

async function handleCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const jobPostingId = session.metadata?.job_posting_id;
  if (jobPostingId) {
    await admin.from("job_postings").update({ status: "failed" }).eq("id", jobPostingId).eq("status", "pending");
  }
}

async function handleSubscriptionChange(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  // Prefer subscription_id match (most precise); fall back to customer ID for
  // subscription.created where employers.subscription_id may not yet be set.
  let { data: rows } = await admin.from("employers").select("id").eq("subscription_id", sub.id).limit(1);
  if (!rows || rows.length === 0) {
    if (customerId) {
      const { data: byCust } = await admin.from("employers").select("id").eq("stripe_customer_id", customerId).limit(1);
      rows = byCust ?? [];
    }
  }
  if (!rows || rows.length === 0) {
    console.warn(`Subscription ${sub.id} has no matching employer (customer ${customerId})`);
    return;
  }
  const employerId = rows[0].id;

  await admin.from("employers").update({
    subscription_id: sub.id,
    subscription_status: status,
    subscription_current_period_end: periodEnd,
  }).eq("id", employerId);
}

async function sendConfirmationEmail(employerId: string, plan: string) {
  const { data: emp } = await admin.from("employers")
    .select("contact_email, contact_name, name")
    .eq("id", employerId).maybeSingle();
  if (!emp?.contact_email) return;

  const isSubscription = plan === "employer";
  const subject = isSubscription
    ? "Your Workforce for Humans employer subscription is active"
    : "Your job listing is paid — sign in to post it";
  const greeting = emp.contact_name ? `Hi ${escapeHtml(emp.contact_name)},` : "Hi,";
  const body = isSubscription
    ? `<p>Your employer subscription is active — you can post unlimited active listings while it stays current.</p>
       <p>Sign in to your dashboard to post your first listing:</p>`
    : `<p>Thanks — your payment is confirmed. The next step is to fill in the listing details (title, description, location, pay) so it goes live.</p>
       <p>Sign in to your dashboard with the same email and you'll see the pending listing waiting:</p>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1a2340;">
      <h1 style="font-size:22px;margin-bottom:8px;">${escapeHtml(subject)}</h1>
      <p style="color:#4b5563;margin-top:0;">${greeting}</p>
      ${body}
      <p style="margin:24px 0;">
        <a href="${SITE_URL}/employer.html" style="display:inline-block;background:#1a2340;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Go to my dashboard &rarr;</a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin-top:32px;">
        Use the same email address (<b>${escapeHtml(emp.contact_email)}</b>) when you sign in — that's how we link your purchase to your account.
      </p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [emp.contact_email], subject, html }),
    });
    if (!r.ok) console.error("Resend failed:", await r.text());
  } catch (e) {
    console.error("Resend exception:", (e as Error).message);
  }
}

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

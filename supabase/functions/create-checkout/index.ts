// Create a Stripe Checkout Session for an employer purchase. Side effects
// before redirecting to Stripe:
//   1. Find or create an employers row, matched case-insensitively by email.
//   2. Create the Stripe customer (if not already linked).
//   3. For one-time plans (basic, featured) insert a job_postings row in
//      'pending' state. For the employer subscription we skip the posting
//      row — entitlement is unlimited while subscription is active.
//   4. Pass {employer_id, job_posting_id, plan} as session metadata so
//      stripe-webhook can fulfill on payment.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PlanKey = "basic" | "featured" | "employer";
const PLANS: Record<PlanKey, { amount: number; mode: "payment" | "subscription"; label: string; duration: number }> = {
  basic:    { amount: 9900,  mode: "payment",      label: "Basic Listing (60 days)",    duration: 60 },
  featured: { amount: 19900, mode: "payment",      label: "Featured Listing (60 days)", duration: 60 },
  employer: { amount: 49900, mode: "subscription", label: "Employer Subscription",      duration: 30 },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseServiceKey);

    const { plan, email, name, site_url } = await req.json();
    if (!plan || !email || !name) return json({ error: "Missing required fields: plan, email, name" }, 400);

    const planConfig = PLANS[plan as PlanKey];
    if (!planConfig) return json({ error: "Invalid plan. Must be: basic, featured, or employer" }, 400);

    // Find or create the employer. We can't use upsert(onConflict:contact_email)
    // because the employers.slug UNIQUE constraint can collide with an existing
    // row owned by a different email (e.g. "Acme Inc" and "acme-inc" both
    // slug to "acme-inc"). Select-then-insert with a random slug suffix avoids
    // both constraints.
    let employer: { id: string; stripe_customer_id: string | null } | null = null;
    {
      const { data: existing } = await db.from("employers")
        .select("id, stripe_customer_id")
        .ilike("contact_email", email)
        .maybeSingle();
      if (existing) {
        employer = existing;
      } else {
        const baseSlug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "employer";
        const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
        const { data: created, error: empErr } = await db.from("employers")
          .insert({ name, slug, contact_email: email, contact_name: name })
          .select("id, stripe_customer_id")
          .single();
        if (empErr || !created) return json({ error: "Failed to create employer", detail: empErr?.message }, 500);
        employer = created;
      }
    }

    // Ensure a Stripe customer exists.
    let stripeCustomerId = employer.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email, name, metadata: { employer_id: employer.id },
      });
      stripeCustomerId = customer.id;
      await db.from("employers").update({ stripe_customer_id: stripeCustomerId }).eq("id", employer.id);
    }

    // Create the pending job_postings row for one-time plans only.
    let postingId: string | null = null;
    if (planConfig.mode === "payment") {
      const { data: posting, error: postErr } = await db.from("job_postings")
        .insert({
          employer_id: employer.id,
          plan,
          amount_cents: planConfig.amount,
          listing_duration_days: planConfig.duration,
          status: "pending",
        })
        .select("id").single();
      if (postErr || !posting) return json({ error: "Failed to create job_postings row", detail: postErr?.message }, 500);
      postingId = posting.id;
    }

    const origin = site_url || "https://workforceforhumans.com";
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId,
      client_reference_id: employer.id,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: planConfig.label },
          unit_amount: planConfig.amount,
          ...(planConfig.mode === "subscription" ? { recurring: { interval: "month" } } : {}),
        },
        quantity: 1,
      }],
      mode: planConfig.mode,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
      metadata: {
        employer_id: employer.id,
        job_posting_id: postingId ?? "",
        plan,
      },
    };

    if (planConfig.mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: { employer_id: employer.id, plan },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (postingId) {
      await db.from("job_postings").update({ stripe_session_id: session.id }).eq("id", postingId);
    }

    return json({ url: session.url, session_id: session.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

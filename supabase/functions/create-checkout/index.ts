import Stripe from "https://esm.sh/stripe@14?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
});

// Map plan names to your Stripe Price IDs.
// Replace these with your actual Price IDs from the Stripe Dashboard.
const PRICE_MAP: Record<string, string> = {
  basic: Deno.env.get("STRIPE_PRICE_BASIC") || "price_REPLACE_WITH_BASIC_PRICE_ID",
  featured: Deno.env.get("STRIPE_PRICE_FEATURED") || "price_REPLACE_WITH_FEATURED_PRICE_ID",
  employer: Deno.env.get("STRIPE_PRICE_EMPLOYER") || "price_REPLACE_WITH_EMPLOYER_PRICE_ID",
};

// Which plans are recurring subscriptions vs one-time payments
const RECURRING_PLANS = new Set(["employer"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { plan, email, name, site_url } = await req.json();

    if (!plan || !email || !name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: plan, email, name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceId = PRICE_MAP[plan];
    if (!priceId || priceId.includes("REPLACE")) {
      return new Response(
        JSON.stringify({ error: `Invalid or unconfigured plan: ${plan}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const origin = site_url || "https://workforceforhumans.com";

    const session = await stripe.checkout.sessions.create({
      mode: RECURRING_PLANS.has(plan) ? "subscription" : "payment",
      customer_email: email,
      metadata: { employer_name: name, plan },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success.html`,
      cancel_url: `${origin}/cancel.html`,
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

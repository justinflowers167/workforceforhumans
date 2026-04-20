// Fallback link from auth user → employers row, for buyers who already had
// an auth.users row before paying (so the on_auth_user_created trigger never
// fired). Idempotent. Called from employer.html on first dashboard visit
// when no employers row is found via auth_user_id.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "Missing bearer token" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.email) return json({ error: "Invalid session" }, 401);

  const userId = userData.user.id;
  const userEmail = userData.user.email;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Already linked?
  const { data: linked } = await admin.from("employers")
    .select("id, name, contact_email, subscription_id, subscription_status")
    .eq("auth_user_id", userId).maybeSingle();
  if (linked) return json({ employer: linked, linked: false });

  // Find an unlinked employers row matching this email and stamp it.
  const { data: candidate } = await admin.from("employers")
    .select("id, name, contact_email, subscription_id, subscription_status")
    .ilike("contact_email", userEmail)
    .is("auth_user_id", null)
    .limit(1).maybeSingle();
  if (!candidate) return json({ employer: null });

  const { data: updated, error: updErr } = await admin.from("employers")
    .update({ auth_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", candidate.id)
    .select("id, name, contact_email, subscription_id, subscription_status")
    .single();
  if (updErr) {
    console.error("link-employer: update failed:", updErr);
    return json({ error: "Could not link employer. Please try again." }, 500);
  }

  return json({ employer: updated, linked: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { room_code, sender_uid, emoji, message } = await req.json();

    if (!room_code || !sender_uid) {
      return new Response(
        JSON.stringify({ error: "room_code and sender_uid are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidEmail = Deno.env.get("VAPID_EMAIL") ?? "mailto:carepingapp@example.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get sender's display name
    const { data: sender } = await supabase
      .from("users")
      .select("display_name")
      .eq("uid", sender_uid)
      .maybeSingle();

    const senderName = sender?.display_name ?? "Someone";

    // Get all push subscriptions for this room, excluding sender
    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("subscription, uid")
      .eq("room_code", room_code)
      .neq("uid", sender_uid);

    if (subsError) {
      return new Response(
        JSON.stringify({ error: subsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No subscribers found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = JSON.stringify({
      title: `${senderName} pinged you ${emoji ?? "💙"}`,
      body: message || `${senderName} is thinking of you`,
      room_code,
      tab: "feed",
    });

    const results = await Promise.allSettled(
      subs.map(async ({ subscription, uid: subUid }) => {
        try {
          await webpush.sendNotification(subscription, payload);
          return { uid: subUid, success: true };
        } catch (err: unknown) {
          // If subscription is expired/invalid, clean it up
          if (err && typeof err === "object" && "statusCode" in err &&
              (err.statusCode === 410 || err.statusCode === 404)) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("uid", subUid)
              .eq("room_code", room_code);
          }
          throw err;
        }
      })
    );

    const sent = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;

    return new Response(
      JSON.stringify({ sent, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

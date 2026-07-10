import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'select_users') THEN
    CREATE POLICY "select_users" ON public.users FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'insert_users') THEN
    CREATE POLICY "insert_users" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'update_users') THEN
    CREATE POLICY "update_users" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'delete_users') THEN
    CREATE POLICY "delete_users" ON public.users FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.rooms (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'select_rooms') THEN
    CREATE POLICY "select_rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'insert_rooms') THEN
    CREATE POLICY "insert_rooms" ON public.rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'update_rooms') THEN
    CREATE POLICY "update_rooms" ON public.rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'delete_rooms') THEN
    CREATE POLICY "delete_rooms" ON public.rooms FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.room_members (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  nickname TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_code, uid)
);
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_members' AND policyname = 'select_room_members') THEN
    CREATE POLICY "select_room_members" ON public.room_members FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_members' AND policyname = 'insert_room_members') THEN
    CREATE POLICY "insert_room_members" ON public.room_members FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_members' AND policyname = 'update_room_members') THEN
    CREATE POLICY "update_room_members" ON public.room_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_members' AND policyname = 'delete_room_members') THEN
    CREATE POLICY "delete_room_members" ON public.room_members FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pings (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  sender_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  message TEXT,
  emoji TEXT NOT NULL DEFAULT '💙',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pings' AND policyname = 'select_pings') THEN
    CREATE POLICY "select_pings" ON public.pings FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pings' AND policyname = 'insert_pings') THEN
    CREATE POLICY "insert_pings" ON public.pings FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pings' AND policyname = 'update_pings') THEN
    CREATE POLICY "update_pings" ON public.pings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pings' AND policyname = 'delete_pings') THEN
    CREATE POLICY "delete_pings" ON public.pings FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(uid, room_code)
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'select_push_subscriptions') THEN
    CREATE POLICY "select_push_subscriptions" ON public.push_subscriptions FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'insert_push_subscriptions') THEN
    CREATE POLICY "insert_push_subscriptions" ON public.push_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'update_push_subscriptions') THEN
    CREATE POLICY "update_push_subscriptions" ON public.push_subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'delete_push_subscriptions') THEN
    CREATE POLICY "delete_push_subscriptions" ON public.push_subscriptions FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;

CREATE OR REPLACE VIEW public.my_rooms AS
SELECT
  rm.uid AS my_uid,
  rm.room_code,
  r.created_at AS room_created_at,
  r.last_active,
  other_mem.uid AS friend_uid,
  ou.display_name AS friend_name,
  ou.is_online AS friend_online,
  ou.last_seen AS friend_last_seen,
  (
    SELECT count(*) FROM public.pings p
    WHERE p.room_code = rm.room_code
      AND p.sender_uid != rm.uid
      AND p.read_at IS NULL
  ) AS unread_count
FROM public.room_members rm
JOIN public.rooms r ON r.code = rm.room_code
LEFT JOIN public.room_members other_mem
  ON other_mem.room_code = rm.room_code AND other_mem.uid != rm.uid
LEFT JOIN public.users ou ON ou.uid = other_mem.uid;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_DB_URL not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sql = postgres(dbUrl, { max: 1 });

    try {
      await sql.unsafe(SCHEMA_SQL);
      await sql.end();
      return new Response(
        JSON.stringify({ ok: true, message: "Schema initialized" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      await sql.end().catch(() => {});
      throw err;
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

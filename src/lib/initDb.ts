/**
 * Database initialization — creates all required tables if they don't exist.
 * Called once on app startup. Safe to call repeatedly (idempotent).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_users" ON public.users;
CREATE POLICY "select_users" ON public.users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_users" ON public.users;
CREATE POLICY "insert_users" ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_users" ON public.users;
CREATE POLICY "update_users" ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_users" ON public.users;
CREATE POLICY "delete_users" ON public.users FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.rooms (
  code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_rooms" ON public.rooms;
CREATE POLICY "select_rooms" ON public.rooms FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_rooms" ON public.rooms;
CREATE POLICY "insert_rooms" ON public.rooms FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_rooms" ON public.rooms;
CREATE POLICY "update_rooms" ON public.rooms FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_rooms" ON public.rooms;
CREATE POLICY "delete_rooms" ON public.rooms FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.room_members (
  id SERIAL PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  nickname TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_code, uid)
);
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_room_members" ON public.room_members;
CREATE POLICY "select_room_members" ON public.room_members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_room_members" ON public.room_members;
CREATE POLICY "insert_room_members" ON public.room_members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_room_members" ON public.room_members;
CREATE POLICY "update_room_members" ON public.room_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_room_members" ON public.room_members;
CREATE POLICY "delete_room_members" ON public.room_members FOR DELETE TO anon, authenticated USING (true);

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
DROP POLICY IF EXISTS "select_pings" ON public.pings;
CREATE POLICY "select_pings" ON public.pings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_pings" ON public.pings;
CREATE POLICY "insert_pings" ON public.pings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_pings" ON public.pings;
CREATE POLICY "update_pings" ON public.pings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_pings" ON public.pings;
CREATE POLICY "delete_pings" ON public.pings FOR DELETE TO anon, authenticated USING (true);

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
DROP POLICY IF EXISTS "select_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "select_push_subscriptions" ON public.push_subscriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "insert_push_subscriptions" ON public.push_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "update_push_subscriptions" ON public.push_subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "delete_push_subscriptions" ON public.push_subscriptions FOR DELETE TO anon, authenticated USING (true);

CREATE OR REPLACE VIEW public.my_rooms AS
SELECT
  rm.uid AS my_uid,
  rm.room_code,
  r.created_at AS room_created_at,
  r.last_active,
  other.uid AS friend_uid,
  other.display_name AS friend_name,
  other.is_online AS friend_online,
  other.last_seen AS friend_last_seen,
  (
    SELECT count(*) FROM public.pings p
    WHERE p.room_code = rm.room_code
      AND p.sender_uid != rm.uid
      AND p.read_at IS NULL
  ) AS unread_count
FROM public.room_members rm
JOIN public.rooms r ON r.code = rm.room_code
LEFT JOIN public.room_members other
  ON other.room_code = rm.room_code AND other.uid != rm.uid
LEFT JOIN public.users other ON other.uid = other_mem.uid;
`

export async function initDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/init-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Apikey: SUPABASE_ANON_KEY,
      },
    })
    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: text }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export { INIT_SQL }

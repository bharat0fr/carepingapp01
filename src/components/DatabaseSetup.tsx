import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

// The SQL needed to bootstrap the database — run once in Supabase SQL Editor
export const SETUP_SQL = `
-- Run this in your Supabase SQL Editor to set up Care Ping

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
`

interface DatabaseSetupProps {
  onRetry: () => void
}

export function DatabaseSetup({ onRetry }: DatabaseSetupProps) {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SETUP_SQL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRetry = async () => {
    setChecking(true)
    setTimeout(() => {
      setChecking(false)
      onRetry()
    }, 1000)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="text-5xl">⚙️</div>
          <h1 className="text-2xl font-bold tracking-tight">Database Setup Required</h1>
          <p className="text-muted-foreground text-sm">
            The Care Ping database needs to be initialized. Run the SQL below in your Supabase SQL Editor.
          </p>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Steps:</p>
              <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                <li>Open your Supabase project dashboard</li>
                <li>Go to SQL Editor → New query</li>
                <li>Paste the SQL and click Run</li>
                <li>Come back here and click "I've run the SQL"</li>
              </ol>
            </div>

            <Button variant="outline" className="w-full" onClick={handleCopy}>
              {copied ? '✓ Copied!' : 'Copy Setup SQL'}
            </Button>

            <Button className="w-full" onClick={handleRetry} disabled={checking}>
              {checking ? <><Spinner className="mr-2" /> Checking…</> : "I've run the SQL — continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

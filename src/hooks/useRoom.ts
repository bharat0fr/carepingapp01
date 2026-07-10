import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface Ping {
  id: number
  room_code: string
  sender_uid: string
  sender_name: string
  message: string | null
  emoji: string
  sent_at: string
  read_at: string | null
}

export interface RoomMember {
  uid: string
  display_name: string
  is_online: boolean
  last_seen: string
}

export interface UseRoomResult {
  friend: RoomMember | null
  pings: Ping[]
  myInfo: RoomMember | null
  loading: boolean
  error: string | null
  sendPing: (emoji: string, message?: string) => Promise<void>
  markRead: () => Promise<void>
  memberCount: number
}

const HEARTBEAT_INTERVAL = 20_000 // 20s
const OFFLINE_AFTER = 45_000 // 45s

export function useRoom(uid: string | null, roomCode: string | null): UseRoomResult {
  const [friend, setFriend] = useState<RoomMember | null>(null)
  const [myInfo, setMyInfo] = useState<RoomMember | null>(null)
  const [pings, setPings] = useState<Ping[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const markHeartbeat = useCallback(async () => {
    if (!uid) return
    await supabase
      .from('users')
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq('uid', uid)
  }, [uid])

  const markOffline = useCallback(async () => {
    if (!uid) return
    await supabase
      .from('users')
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq('uid', uid)
  }, [uid])

  const sendPing = useCallback(
    async (emoji: string, message?: string) => {
      if (!uid || !roomCode) return
      const { error } = await supabase.from('pings').insert({
        room_code: roomCode,
        sender_uid: uid,
        emoji,
        message: message ?? null,
      })
      if (error) throw error
      // Update room last_active
      await supabase.from('rooms').update({ last_active: new Date().toISOString() }).eq('code', roomCode)
      // Fire push notification (best-effort, don't block UI)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
          Apikey: supabaseKey,
        },
        body: JSON.stringify({ room_code: roomCode, sender_uid: uid, emoji, message }),
      }).catch(() => {})
    },
    [uid, roomCode]
  )

  const markRead = useCallback(async () => {
    if (!uid || !roomCode) return
    await supabase
      .from('pings')
      .update({ read_at: new Date().toISOString() })
      .eq('room_code', roomCode)
      .neq('sender_uid', uid)
      .is('read_at', null)
  }, [uid, roomCode])

  useEffect(() => {
    if (!uid || !roomCode) {
      setLoading(false)
      return
    }

    let cancelled = false

    const setup = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch room members
        const { data: members, error: membersErr } = await supabase
          .from('room_members')
          .select('uid')
          .eq('room_code', roomCode)

        if (membersErr) throw membersErr
        if (cancelled) return

        setMemberCount(members?.length ?? 0)

        const uids = members?.map(m => m.uid) ?? []

        if (uids.length > 0) {
          const { data: users, error: usersErr } = await supabase
            .from('users')
            .select('uid, display_name, is_online, last_seen')
            .in('uid', uids)

          if (usersErr) throw usersErr
          if (cancelled) return

          const me = users?.find(u => u.uid === uid) ?? null
          const f = users?.find(u => u.uid !== uid) ?? null
          setMyInfo(me)
          setFriend(f)
        }

        // Fetch recent pings (last 50)
        const { data: pingRows, error: pingsErr } = await supabase
          .from('pings')
          .select('id, room_code, sender_uid, message, emoji, sent_at, read_at')
          .eq('room_code', roomCode)
          .order('sent_at', { ascending: false })
          .limit(50)

        if (pingsErr) throw pingsErr
        if (cancelled) return

        // Fetch sender names
        const senderUids = [...new Set(pingRows?.map(p => p.sender_uid) ?? [])]
        let nameMap: Record<string, string> = {}
        if (senderUids.length > 0) {
          const { data: senders } = await supabase
            .from('users')
            .select('uid, display_name')
            .in('uid', senderUids)
          nameMap = Object.fromEntries(senders?.map(s => [s.uid, s.display_name]) ?? [])
        }

        const enriched: Ping[] = (pingRows ?? []).map(p => ({
          ...p,
          sender_name: nameMap[p.sender_uid] ?? 'Someone',
        }))

        setPings(enriched)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load room')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setup()

    // Mark self online
    markHeartbeat()

    // Heartbeat interval
    heartbeatRef.current = setInterval(markHeartbeat, HEARTBEAT_INTERVAL)

    // Subscribe to realtime channel keyed on roomCode
    const channel = supabase.channel(`room:${roomCode}`)

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pings', filter: `room_code=eq.${roomCode}` },
        async (payload) => {
          if (cancelled) return
          const newPing = payload.new as { id: number; room_code: string; sender_uid: string; message: string | null; emoji: string; sent_at: string; read_at: string | null }
          const { data: sender } = await supabase
            .from('users')
            .select('display_name')
            .eq('uid', newPing.sender_uid)
            .maybeSingle()
          const enriched: Ping = {
            ...newPing,
            sender_name: sender?.display_name ?? 'Someone',
          }
          setPings(prev => [enriched, ...prev].slice(0, 50))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pings', filter: `room_code=eq.${roomCode}` },
        (payload) => {
          if (cancelled) return
          const updated = payload.new as { id: number; read_at: string | null }
          setPings(prev => prev.map(p => (p.id === updated.id ? { ...p, read_at: updated.read_at } : p)))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          if (cancelled) return
          const updated = payload.new as { uid: string; display_name: string; is_online: boolean; last_seen: string }
          if (updated.uid === uid) {
            setMyInfo(prev => prev ? { ...prev, ...updated } : prev)
          } else if (friend && updated.uid === friend.uid) {
            setFriend(prev => prev ? { ...prev, ...updated } : prev)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    // Mark offline on unload
    const handleUnload = () => { markOffline() }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      cancelled = true
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      window.removeEventListener('beforeunload', handleUnload)
      markOffline()
    }
  }, [uid, roomCode, markHeartbeat, markOffline]) // re-subscribes on roomCode change

  return { friend, pings, myInfo, loading, error, sendPing, markRead, memberCount }
}

// Periodic offline detection for friend presence
export function isFriendOnline(friend: RoomMember | null): boolean {
  if (!friend) return false
  if (!friend.is_online) return false
  const lastSeen = new Date(friend.last_seen).getTime()
  return Date.now() - lastSeen < OFFLINE_AFTER
}

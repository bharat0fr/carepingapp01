import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface RoomSummary {
  room_code: string
  last_active: string
  friend_uid: string | null
  friend_name: string | null
  friend_online: boolean
  friend_last_seen: string | null
  unread_count: number
}

export function useAllRooms(uid: string | null, joinedRoomCodes: string[]): {
  rooms: RoomSummary[]
  loading: boolean
  refresh: () => void
} {
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const refresh = () => setTick(t => t + 1)

  useEffect(() => {
    if (!uid || joinedRoomCodes.length === 0) {
      setRooms([])
      return
    }

    let cancelled = false

    const fetchAll = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('my_rooms')
          .select('*')
          .eq('my_uid', uid)
          .in('room_code', joinedRoomCodes)

        if (error || cancelled) return

        const sorted = (data ?? [])
          .map(r => ({
            room_code: r.room_code,
            last_active: r.last_active,
            friend_uid: r.friend_uid,
            friend_name: r.friend_name,
            friend_online: r.friend_online ?? false,
            friend_last_seen: r.friend_last_seen,
            unread_count: Number(r.unread_count ?? 0),
          }))
          // Sort: unread first, then last_active desc
          .sort((a, b) => {
            if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count
            return new Date(b.last_active).getTime() - new Date(a.last_active).getTime()
          })

        setRooms(sorted)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()

    // Subscribe to realtime events that affect room summaries
    const channel = supabase.channel(`all-rooms:${uid}`)
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pings' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, fetchAll)
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [uid, joinedRoomCodes.join(','), tick]) // eslint-disable-line react-hooks/exhaustive-deps

  return { rooms, loading, refresh }
}

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      users: {
        Row: { uid: string; display_name: string; is_online: boolean; last_seen: string }
        Insert: { uid: string; display_name: string; is_online?: boolean; last_seen?: string }
        Update: { display_name?: string; is_online?: boolean; last_seen?: string }
      }
      rooms: {
        Row: { code: string; created_at: string; last_active: string }
        Insert: { code: string; created_at?: string; last_active?: string }
        Update: { last_active?: string }
      }
      room_members: {
        Row: { id: number; room_code: string; uid: string; nickname: string | null; joined_at: string }
        Insert: { room_code: string; uid: string; nickname?: string | null }
        Update: { nickname?: string | null }
      }
      pings: {
        Row: { id: number; room_code: string; sender_uid: string; message: string | null; emoji: string; sent_at: string; read_at: string | null }
        Insert: { room_code: string; sender_uid: string; message?: string | null; emoji?: string }
        Update: { read_at?: string | null }
      }
      push_subscriptions: {
        Row: { id: number; uid: string; room_code: string; subscription: object; created_at: string; updated_at: string }
        Insert: { uid: string; room_code: string; subscription: object }
        Update: { subscription?: object; updated_at?: string }
      }
    }
    Views: {
      my_rooms: {
        Row: {
          my_uid: string
          room_code: string
          room_created_at: string
          last_active: string
          friend_uid: string | null
          friend_name: string | null
          friend_online: boolean | null
          friend_last_seen: string | null
          unread_count: number
        }
      }
    }
  }
}

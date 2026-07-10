import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// This VAPID public key must be set as an env var
// For development you can generate one at: https://web-push-codelab.glitch.me/
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type NotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export interface UseNotificationsResult {
  permission: NotificationPermission
  requestPermission: () => Promise<void>
  sendTestNotification: (roomCode: string) => Promise<void>
  isIOS: boolean
  isStandalone: boolean
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

function detectIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
}

function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function subscribeAndUpsert(
  uid: string,
  roomCode: string,
  reg: ServiceWorkerRegistration
): Promise<void> {
  if (!VAPID_PUBLIC_KEY) return
  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    await supabase
      .from('push_subscriptions')
      .upsert(
        { uid, room_code: roomCode, subscription: sub.toJSON(), updated_at: new Date().toISOString() },
        { onConflict: 'uid,room_code' }
      )
  } catch (err) {
    console.warn('Push subscription failed:', err)
  }
}

export function useNotifications(
  uid: string | null,
  joinedRoomCodes: string[]
): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
    return Notification.permission as NotificationPermission
  })
  const isIOS = detectIOS()
  const isStandalone = detectStandalone()
  const upsertedRef = useRef(false)

  // On load: if permission already granted, proactively refresh subscriptions for all rooms
  useEffect(() => {
    if (!uid || joinedRoomCodes.length === 0) return
    if (permission !== 'granted') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      if (!existing) return
      // Re-upsert for EVERY joined room on every app load (subscription may have rotated)
      for (const roomCode of joinedRoomCodes) {
        await supabase
          .from('push_subscriptions')
          .upsert(
            { uid, room_code: roomCode, subscription: existing.toJSON(), updated_at: new Date().toISOString() },
            { onConflict: 'uid,room_code' }
          )
      }
    })
  }, [uid, joinedRoomCodes, permission])

  // Listen for service worker messages
  useEffect(() => {
    if (!uid || !('serviceWorker' in navigator)) return

    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED' && uid) {
        const newSub = event.data.subscription
        for (const roomCode of joinedRoomCodes) {
          await supabase
            .from('push_subscriptions')
            .upsert(
              { uid, room_code: roomCode, subscription: newSub, updated_at: new Date().toISOString() },
              { onConflict: 'uid,room_code' }
            )
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [uid, joinedRoomCodes])

  const requestPermission = useCallback(async () => {
    if (!uid || joinedRoomCodes.length === 0) return
    if (!('Notification' in window)) return
    if (isIOS && !isStandalone) return // block — show install prompt first

    const result = await Notification.requestPermission()
    setPermission(result as NotificationPermission)
    if (result !== 'granted') return

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await navigator.serviceWorker.ready

    // Subscribe for all joined rooms at once
    for (const roomCode of joinedRoomCodes) {
      await subscribeAndUpsert(uid, roomCode, reg)
    }
    upsertedRef.current = true
  }, [uid, joinedRoomCodes, isIOS, isStandalone])

  // When new rooms are added after permission already granted, subscribe them too
  const prevRoomsRef = useRef<string[]>([])
  useEffect(() => {
    if (!uid || permission !== 'granted') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    const newRooms = joinedRoomCodes.filter(c => !prevRoomsRef.current.includes(c))
    prevRoomsRef.current = joinedRoomCodes

    if (newRooms.length === 0) return

    navigator.serviceWorker.ready.then(async (reg) => {
      for (const roomCode of newRooms) {
        await subscribeAndUpsert(uid, roomCode, reg)
      }
    })
  }, [uid, joinedRoomCodes, permission])

  const sendTestNotification = useCallback(
    async (roomCode: string) => {
      if (permission !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification('Care Ping — Test 💙', {
        body: 'Notifications are working!',
        icon: '/icons/icon-192.png',
        data: { room_code: roomCode },
      })
    },
    [permission]
  )

  return { permission, requestPermission, sendTestNotification, isIOS, isStandalone }
}

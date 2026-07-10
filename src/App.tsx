import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  loadIdentity,
  loadRoomState,
  saveRoomState,
  setActiveRoom,
  type Identity,
  type RoomState,
} from '@/lib/session'
import { useRoom } from '@/hooks/useRoom'
import { useAllRooms } from '@/hooks/useAllRooms'
import { useNotifications } from '@/hooks/useNotifications'
import { Onboarding } from '@/components/Onboarding'
import { RoomSwitcher } from '@/components/RoomSwitcher'
import { SendTab } from '@/components/SendTab'
import { FeedTab } from '@/components/FeedTab'
import { SettingsSheet } from '@/components/SettingsSheet'
import { DatabaseSetup } from '@/components/DatabaseSetup'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SettingsIcon } from 'lucide-react'

async function checkDbReady(): Promise<boolean> {
  const { error } = await supabase.from('users').select('uid').limit(1)
  // PGRST116 = table not found, PGRST205 = schema cache miss
  if (error?.code === 'PGRST205' || error?.code === '42P01') return false
  return true
}

// Read ?room= query param on cold start (notification deep-link)
function getQueryRoomCode(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('room')
}

function getQueryTab(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('tab') ?? 'send'
}

type AppState = 'loading' | 'db-setup' | 'onboarding' | 'adding-room' | 'app'

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [roomState, setRoomStateLocal] = useState<RoomState>({ activeRoomCode: null, joinedRoomCodes: [] })
  const [activeTab, setActiveTab] = useState<string>(getQueryTab())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const swRegisteredRef = useRef(false)

  // Load identity + room state on mount
  useEffect(() => {
    const init = async () => {
      // Check DB is ready
      const dbReady = await checkDbReady()
      if (!dbReady) {
        setAppState('db-setup')
        return
      }

      const id = loadIdentity()
      const rs = loadRoomState()

      // Check ?room= query param — deep link from notification
      const queryRoom = getQueryRoomCode()
      if (queryRoom && rs.joinedRoomCodes.includes(queryRoom)) {
        const updated = setActiveRoom(queryRoom)
        setRoomStateLocal(updated)
      } else if (rs.activeRoomCode === null && rs.joinedRoomCodes.length > 0) {
        const updated = setActiveRoom(rs.joinedRoomCodes[0])
        setRoomStateLocal(updated)
      } else {
        setRoomStateLocal(rs)
      }

      if (!id || rs.joinedRoomCodes.length === 0) {
        setAppState('onboarding')
      } else {
        setIdentity(id)
        setAppState('app')
      }

      // Clean up query params from URL
      if (queryRoom) {
        const url = new URL(window.location.href)
        url.searchParams.delete('room')
        url.searchParams.delete('tab')
        window.history.replaceState({}, '', url.toString())
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Register service worker
  useEffect(() => {
    if (swRegisteredRef.current) return
    swRegisteredRef.current = true

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('SW registration failed:', err)
      })

      // Listen for messages from SW (SWITCH_ROOM, PUSH_SUBSCRIPTION_CHANGED)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SWITCH_ROOM') {
          const targetRoom = event.data.room_code as string
          const tab = event.data.tab as string | undefined
          handleSwitchRoom(targetRoom)
          if (tab) setActiveTab(tab)
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoomStateChange = (newState: RoomState) => {
    setRoomStateLocal(newState)
    saveRoomState(newState)
  }

  const handleSwitchRoom = (roomCode: string) => {
    const updated = setActiveRoom(roomCode)
    setRoomStateLocal(updated)
  }

  const handleOnboardingComplete = (id: Identity, rs: RoomState) => {
    setIdentity(id)
    setRoomStateLocal(rs)
    setAppState('app')
  }

  const handleAddRoomComplete = (id: Identity, rs: RoomState) => {
    setIdentity(id)
    setRoomStateLocal(rs)
    setAppState('app')
  }

  if (appState === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-3xl animate-pulse">💙</div>
      </div>
    )
  }

  if (appState === 'db-setup') {
    return <DatabaseSetup onRetry={() => { setAppState('loading') }} />
  }

  if (appState === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} existingIdentity={null} />
  }

  if (appState === 'adding-room') {
    return (
      <Onboarding
        onComplete={handleAddRoomComplete}
        existingIdentity={identity}
      />
    )
  }

  return (
    <MainApp
      identity={identity!}
      roomState={roomState}
      activeTab={activeTab}
      settingsOpen={settingsOpen}
      onTabChange={setActiveTab}
      onSettingsOpen={setSettingsOpen}
      onSwitchRoom={handleSwitchRoom}
      onAddRoom={() => setAppState('adding-room')}
      onRoomStateChange={handleRoomStateChange}
      onIdentityChange={(id) => setIdentity(id)}
    />
  )
}

interface MainAppProps {
  identity: Identity
  roomState: RoomState
  activeTab: string
  settingsOpen: boolean
  onTabChange: (tab: string) => void
  onSettingsOpen: (open: boolean) => void
  onSwitchRoom: (roomCode: string) => void
  onAddRoom: () => void
  onRoomStateChange: (state: RoomState) => void
  onIdentityChange: (id: Identity) => void
}

function MainApp({
  identity,
  roomState,
  activeTab,
  settingsOpen,
  onTabChange,
  onSettingsOpen,
  onSwitchRoom,
  onAddRoom,
  onRoomStateChange,
  onIdentityChange,
}: MainAppProps) {
  const { uid } = identity
  const { activeRoomCode, joinedRoomCodes } = roomState

  // All-rooms data for switcher (live, real-time across all rooms)
  const { rooms, loading: roomsLoading } = useAllRooms(uid, joinedRoomCodes)

  // Active room subscriptions (re-subscribes on roomCode change)
  const roomResult = useRoom(uid, activeRoomCode)

  // Notifications
  const notifications = useNotifications(uid, joinedRoomCodes)

  // Update user presence in DB when identity loads
  useEffect(() => {
    supabase.from('users').upsert(
      { uid, display_name: identity.displayName, is_online: true },
      { onConflict: 'uid' }
    )
  }, [uid, identity.displayName])

  // Active room unread count (for tab badge)
  const activeRoomSummary = rooms.find(r => r.room_code === activeRoomCode)
  const unreadInActive = activeRoomSummary?.unread_count ?? 0

  return (
    // Key on roomCode so tabs fully remount when room changes
    <div key={activeRoomCode ?? 'none'} className="flex flex-col min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">💙</span>
          <span className="font-bold text-base tracking-tight">Care Ping</span>
        </div>

        <RoomSwitcher
          uid={uid}
          activeRoomCode={activeRoomCode}
          rooms={rooms}
          roomsLoading={roomsLoading}
          onSwitchRoom={onSwitchRoom}
          onAddRoom={onAddRoom}
          onRoomStateChange={onRoomStateChange}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onSettingsOpen(true)}
        >
          <SettingsIcon className="size-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </header>

      {/* Main content */}
      {!activeRoomCode ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
          <div className="text-4xl">💙</div>
          <p className="font-semibold text-lg">No active room</p>
          <p className="text-sm text-muted-foreground">Select a connection in the header, or add a new one.</p>
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="flex flex-col flex-1"
        >
          <TabsList className="w-full rounded-none border-b h-10 bg-background shrink-0 px-4">
            <TabsTrigger value="send" className="flex-1">Send</TabsTrigger>
            <TabsTrigger value="feed" className="flex-1 gap-1.5">
              Feed
              {unreadInActive > 0 && (
                <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                  {unreadInActive > 9 ? '9+' : unreadInActive}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="flex-1 overflow-y-auto mt-0">
            <SendTab
              roomResult={roomResult}
              memberCount={roomResult.memberCount}
              roomCode={activeRoomCode}
            />
          </TabsContent>

          <TabsContent value="feed" className="flex-1 overflow-y-auto mt-0">
            <FeedTab
              roomResult={roomResult}
              myUid={uid}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Settings sheet */}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={onSettingsOpen}
        identity={identity}
        roomState={roomState}
        rooms={rooms}
        activeRoomCode={activeRoomCode}
        notifications={notifications}
        onRoomStateChange={onRoomStateChange}
        onIdentityChange={onIdentityChange}
        onAddRoom={onAddRoom}
      />
    </div>
  )
}

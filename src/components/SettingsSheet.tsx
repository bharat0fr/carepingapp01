import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { LogOutIcon, BellIcon, BellOffIcon, SmartphoneIcon, CheckCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { removeRoom, saveIdentity } from '@/lib/session'
import type { Identity, RoomState } from '@/lib/session'
import type { RoomSummary } from '@/hooks/useAllRooms'
import type { UseNotificationsResult } from '@/hooks/useNotifications'

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  identity: Identity
  roomState: RoomState
  rooms: RoomSummary[]
  activeRoomCode: string | null
  notifications: UseNotificationsResult
  onRoomStateChange: (state: RoomState) => void
  onIdentityChange: (identity: Identity) => void
  onAddRoom: () => void
}

export function SettingsSheet({
  open,
  onOpenChange,
  identity,
  rooms,
  activeRoomCode,
  notifications,
  onRoomStateChange,
  onIdentityChange,
  onAddRoom,
}: SettingsSheetProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(identity.displayName)
  const [savingName, setSavingName] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  const handleSaveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === identity.displayName) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      await supabase
        .from('users')
        .update({ display_name: trimmed })
        .eq('uid', identity.uid)
      const updated = { ...identity, displayName: trimmed }
      saveIdentity(updated)
      onIdentityChange(updated)
      setEditingName(false)
    } finally {
      setSavingName(false)
    }
  }

  const handleLeave = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    try {
      await supabase.from('room_members').delete().eq('room_code', leaveTarget).eq('uid', identity.uid)
      await supabase.from('push_subscriptions').delete().eq('room_code', leaveTarget).eq('uid', identity.uid)
      const newState = removeRoom(leaveTarget)
      onRoomStateChange(newState)
    } finally {
      setLeaving(false)
      setLeaveTarget(null)
    }
  }

  const notifStatusLabel = {
    granted: 'Enabled',
    denied: 'Blocked',
    default: 'Not set up',
    unsupported: 'Not supported',
  }[notifications.permission]

  const notifStatusColor = {
    granted: 'text-green-600',
    denied: 'text-destructive',
    default: 'text-muted-foreground',
    unsupported: 'text-muted-foreground',
  }[notifications.permission]

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-safe">
          <SheetHeader className="pb-4">
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>

          <div className="space-y-6">
            {/* Profile */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Your Profile
              </h3>
              <div className="rounded-xl border bg-card p-4 space-y-3">
                {editingName ? (
                  <div className="space-y-2">
                    <Label htmlFor="name-edit">Display name</Label>
                    <div className="flex gap-2">
                      <Input
                        id="name-edit"
                        value={nameValue}
                        onChange={e => setNameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                        {savingName ? <Spinner /> : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingName(false); setNameValue(identity.displayName) }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium">{identity.displayName}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditingName(true)}>
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Connections */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Your Connections
              </h3>
              <div className="space-y-2">
                {rooms.length === 0 && (
                  <p className="text-sm text-muted-foreground px-1">No connections yet.</p>
                )}
                {rooms.map(room => (
                  <div
                    key={room.room_code}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-card p-3',
                      room.room_code === activeRoomCode && 'border-primary/40 bg-primary/5'
                    )}
                  >
                    <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 relative">
                      {(room.friend_name ?? room.room_code).charAt(0).toUpperCase()}
                      <span className={cn(
                        'absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background',
                        room.friend_online ? 'bg-green-500' : 'bg-muted-foreground/40'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {room.friend_name ?? 'Waiting for friend…'}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{room.room_code}</p>
                    </div>
                    {room.unread_count > 0 && (
                      <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                        {room.unread_count}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setLeaveTarget(room.room_code)}
                    >
                      <LogOutIcon className="size-3.5" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" className="w-full rounded-xl" onClick={() => { onOpenChange(false); onAddRoom() }}>
                  + Add a connection
                </Button>
              </div>
            </section>

            <Separator />

            {/* Notifications */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Notifications
              </h3>
              <div className="rounded-xl border bg-card p-4 space-y-4">
                {/* iOS install nudge */}
                {notifications.isIOS && !notifications.isStandalone && (
                  <div className="flex gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
                    <SmartphoneIcon className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Install App for Notifications
                      </p>
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        On iOS, notifications only work when Care Ping is added to your Home Screen.
                        Tap the <strong>Share</strong> icon in Safari, then <strong>"Add to Home Screen"</strong>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {notifications.permission === 'granted'
                      ? <BellIcon className="size-4 text-green-600" />
                      : <BellOffIcon className="size-4 text-muted-foreground" />
                    }
                    <div>
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className={cn('text-xs', notifStatusColor)}>{notifStatusLabel}</p>
                    </div>
                  </div>
                  {notifications.permission === 'default' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={notifications.requestPermission}
                      disabled={notifications.isIOS && !notifications.isStandalone}
                    >
                      Enable
                    </Button>
                  )}
                  {notifications.permission === 'granted' && activeRoomCode && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => notifications.sendTestNotification(activeRoomCode)}
                    >
                      Test
                    </Button>
                  )}
                </div>

                {notifications.permission === 'granted' && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircleIcon className="size-3.5 text-green-600" />
                    Notifications work best when the app is installed — tap Install App above.
                  </div>
                )}

                <p className="text-xs text-muted-foreground leading-relaxed">
                  On Android and Desktop: notifications work even when the browser is closed, as long as the browser isn't force-quit.
                  On iOS: requires the app to be added to your Home Screen (iOS 16.4+).
                </p>
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Leave confirmation */}
      <AlertDialog open={!!leaveTarget} onOpenChange={open => !open && setLeaveTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this room?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll stop receiving pings from this connection. They can invite you back with the room code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleLeave} disabled={leaving}>
              {leaving ? <Spinner className="mr-2" /> : null}
              Leave Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

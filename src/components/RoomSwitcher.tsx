import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDownIcon, PlusIcon, LogOutIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { removeRoom } from '@/lib/session'
import type { RoomSummary } from '@/hooks/useAllRooms'
import type { RoomState } from '@/lib/session'

interface RoomSwitcherProps {
  uid: string
  activeRoomCode: string | null
  rooms: RoomSummary[]
  roomsLoading: boolean
  onSwitchRoom: (roomCode: string) => void
  onAddRoom: () => void
  onRoomStateChange: (state: RoomState) => void
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        'inline-block size-2 rounded-full shrink-0',
        online ? 'bg-green-500' : 'bg-muted-foreground/40'
      )}
    />
  )
}

export function RoomSwitcher({
  uid,
  activeRoomCode,
  rooms,
  roomsLoading,
  onSwitchRoom,
  onAddRoom,
  onRoomStateChange,
}: RoomSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  const activeRoom = rooms.find(r => r.room_code === activeRoomCode)
  const totalUnread = rooms.reduce((sum, r) => sum + (r.room_code !== activeRoomCode ? r.unread_count : 0), 0)

  const handleLeave = async () => {
    if (!leaveTarget) return
    setLeaving(true)
    try {
      await supabase
        .from('room_members')
        .delete()
        .eq('room_code', leaveTarget)
        .eq('uid', uid)

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('room_code', leaveTarget)
        .eq('uid', uid)

      const newState = removeRoom(leaveTarget)
      onRoomStateChange(newState)
    } finally {
      setLeaving(false)
      setLeaveTarget(null)
      if (rooms.length <= 1) setOpen(false)
    }
  }

  return (
    <>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        {activeRoomCode ? (
          <>
            <OnlineDot online={activeRoom?.friend_online ?? false} />
            <span className="max-w-[120px] truncate">
              {activeRoom?.friend_name ?? activeRoomCode}
            </span>
            {totalUnread > 0 && (
              <Badge variant="default" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
                {totalUnread > 9 ? '9+' : totalUnread}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">No room selected</span>
        )}
        <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0" />
      </button>

      {/* Bottom sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto pb-safe">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">Your Connections</SheetTitle>
          </SheetHeader>

          <div className="space-y-1 mt-2">
            {roomsLoading && rooms.length === 0 && (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}

            {rooms.map(room => (
              <div
                key={room.room_code}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-3 cursor-pointer transition-colors',
                  room.room_code === activeRoomCode
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => {
                  onSwitchRoom(room.room_code)
                  setOpen(false)
                }}
              >
                {/* Avatar / initial */}
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0 relative">
                  {(room.friend_name ?? room.room_code).charAt(0).toUpperCase()}
                  <span
                    className={cn(
                      'absolute bottom-0 right-0 size-3 rounded-full border-2 border-background',
                      room.friend_online ? 'bg-green-500' : 'bg-muted-foreground/40'
                    )}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {room.friend_name ?? 'Waiting for friend…'}
                    </span>
                    {room.unread_count > 0 && (
                      <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none shrink-0">
                        {room.unread_count > 9 ? '9+' : room.unread_count}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {room.friend_online
                      ? 'Online now'
                      : room.friend_last_seen
                      ? `Last seen ${formatDistanceToNow(new Date(room.friend_last_seen), { addSuffix: true })}`
                      : `Room: ${room.room_code}`}
                  </p>
                </div>

                {/* Leave button */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={e => {
                    e.stopPropagation()
                    setLeaveTarget(room.room_code)
                  }}
                >
                  <LogOutIcon className="size-4" />
                </Button>
              </div>
            ))}

            {/* Add connection row */}
            <button
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-primary hover:bg-accent/50 transition-colors"
              onClick={() => {
                setOpen(false)
                onAddRoom()
              }}
            >
              <div className="size-10 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center">
                <PlusIcon className="size-4 text-primary/60" />
              </div>
              <span>Add a connection</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Leave confirmation dialog */}
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
            <AlertDialogAction
              variant="destructive"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? <Spinner className="mr-2" /> : null}
              Leave Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { UseRoomResult } from '@/hooks/useRoom'
import type { RoomMember } from '@/hooks/useRoom'

const EMOJI_OPTIONS = ['💙', '👋', '❤️', '😄', '🤗', '☕', '🌸', '🌟', '🙏', '💕', '🥰', '😊']

interface SendTabProps {
  roomResult: UseRoomResult
  memberCount: number
  roomCode: string
}

export function SendTab({ roomResult, memberCount, roomCode }: SendTabProps) {
  const { friend, sendPing } = roomResult
  const [selectedEmoji, setSelectedEmoji] = useState('💙')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    try {
      await sendPing(selectedEmoji, message.trim() || undefined)
      setMessage('')
      setJustSent(true)
      setTimeout(() => setJustSent(false), 2000)
    } catch {
      // error handled silently; could add a toast here
    } finally {
      setSending(false)
    }
  }

  if (memberCount < 2) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center px-6">
        <div className="text-4xl">🔗</div>
        <div>
          <p className="font-semibold text-lg">Waiting for your friend</p>
          <p className="text-muted-foreground text-sm mt-1">
            Share this room code with them:
          </p>
        </div>
        <div className="font-mono text-3xl font-bold tracking-widest bg-muted px-6 py-3 rounded-xl">
          {roomCode}
        </div>
        <p className="text-xs text-muted-foreground">
          Once they join, you can start sending pings.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Friend status */}
      {friend && (
        <FriendCard friend={friend} />
      )}

      {/* Emoji picker */}
      <div>
        <p className="text-sm font-medium mb-3 text-muted-foreground">Choose a ping</p>
        <div className="grid grid-cols-6 gap-2">
          {EMOJI_OPTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => setSelectedEmoji(emoji)}
              className={cn(
                'aspect-square rounded-xl text-2xl flex items-center justify-center transition-all',
                selectedEmoji === emoji
                  ? 'bg-primary/15 ring-2 ring-primary scale-110'
                  : 'bg-muted hover:bg-accent'
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Optional message */}
      <div>
        <textarea
          placeholder="Add a message (optional)"
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={100}
          rows={2}
          className="w-full resize-none rounded-xl border bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
        />
        {message && (
          <p className="text-xs text-muted-foreground text-right mt-1">{message.length}/100</p>
        )}
      </div>

      {/* Send button */}
      <Button
        size="lg"
        className={cn(
          'w-full text-base font-semibold rounded-xl h-14 transition-all',
          justSent && 'bg-green-600 hover:bg-green-600'
        )}
        onClick={handleSend}
        disabled={sending}
      >
        {sending ? (
          <><Spinner className="mr-2" /> Sending…</>
        ) : justSent ? (
          `Sent ${selectedEmoji}`
        ) : (
          `Send ${selectedEmoji} to ${friend?.display_name ?? 'friend'}`
        )}
      </Button>
    </div>
  )
}

function FriendCard({ friend }: { friend: RoomMember }) {
  const online = friend.is_online && (Date.now() - new Date(friend.last_seen).getTime() < 45_000)
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm relative">
        {friend.display_name.charAt(0).toUpperCase()}
        <span className={cn(
          'absolute bottom-0 right-0 size-3 rounded-full border-2 border-background',
          online ? 'bg-green-500' : 'bg-muted-foreground/40'
        )} />
      </div>
      <div>
        <p className="font-medium text-sm">{friend.display_name}</p>
        <p className="text-xs text-muted-foreground">
          {online
            ? 'Online now'
            : `Last seen ${formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true })}`}
        </p>
      </div>
    </div>
  )
}

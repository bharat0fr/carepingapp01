import { useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import type { UseRoomResult, Ping } from '@/hooks/useRoom'

interface FeedTabProps {
  roomResult: UseRoomResult
  myUid: string
}

export function FeedTab({ roomResult, myUid }: FeedTabProps) {
  const { pings, loading, error, markRead } = roomResult

  // Mark pings as read when the feed tab is visible
  useEffect(() => {
    markRead()
  }, [markRead, pings.length])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center px-6">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    )
  }

  if (pings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
        <div className="text-4xl">💙</div>
        <p className="font-medium">No pings yet</p>
        <p className="text-sm text-muted-foreground">
          Send your first ping — let someone know you're thinking of them.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {pings.map(ping => (
        <PingBubble key={ping.id} ping={ping} isMe={ping.sender_uid === myUid} />
      ))}
    </div>
  )
}

function PingBubble({ ping, isMe }: { ping: Ping; isMe: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}>
      {!isMe && (
        <span className="text-xs text-muted-foreground px-1">{ping.sender_name}</span>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 flex flex-col gap-1',
          isMe
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted rounded-bl-sm'
        )}
      >
        <span className="text-2xl leading-none">{ping.emoji}</span>
        {ping.message && (
          <p className={cn('text-sm leading-relaxed', isMe ? 'text-primary-foreground/90' : 'text-foreground')}>
            {ping.message}
          </p>
        )}
      </div>
      <span className={cn('text-[10px] text-muted-foreground px-1', isMe && 'text-right')}>
        {formatDistanceToNow(new Date(ping.sent_at), { addSuffix: true })}
        {isMe && ping.read_at && ' · Seen'}
      </span>
    </div>
  )
}

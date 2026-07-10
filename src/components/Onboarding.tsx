import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateUid, generateRoomCode, saveIdentity, addRoom } from '@/lib/session'
import type { Identity, RoomState } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'

interface OnboardingProps {
  onComplete: (identity: Identity, roomState: RoomState) => void
  existingIdentity?: Identity | null
}

export function Onboarding({ onComplete, existingIdentity }: OnboardingProps) {
  const [name, setName] = useState(existingIdentity?.displayName ?? '')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAddingRoom = !!existingIdentity

  const handleCreate = async () => {
    const displayName = name.trim()
    if (!displayName && !isAddingRoom) {
      setError('Please enter your name')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const uid = existingIdentity?.uid ?? generateUid()
      const finalName = isAddingRoom ? existingIdentity!.displayName : displayName
      const roomCode = generateRoomCode()

      // Upsert user
      const { error: userErr } = await supabase
        .from('users')
        .upsert({ uid, display_name: finalName, is_online: true }, { onConflict: 'uid' })
      if (userErr) throw userErr

      // Create room
      const { error: roomErr } = await supabase
        .from('rooms')
        .insert({ code: roomCode })
      if (roomErr) throw roomErr

      // Join room
      const { error: memberErr } = await supabase
        .from('room_members')
        .upsert({ room_code: roomCode, uid }, { onConflict: 'room_code,uid' })
      if (memberErr) throw memberErr

      const identity: Identity = { uid, displayName: finalName }
      saveIdentity(identity)
      const roomState = addRoom(roomCode)

      onComplete(identity, roomState)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    const displayName = name.trim()
    const code = joinCode.trim().toUpperCase()

    if (!displayName && !isAddingRoom) {
      setError('Please enter your name')
      return
    }
    if (!code || code.length < 4) {
      setError('Please enter a valid room code')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const uid = existingIdentity?.uid ?? generateUid()
      const finalName = isAddingRoom ? existingIdentity!.displayName : displayName

      // Check room exists
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('code')
        .eq('code', code)
        .maybeSingle()

      if (roomErr) throw roomErr
      if (!room) {
        setError('Room not found. Check the code and try again.')
        return
      }

      // Check room isn't full (max 2 members)
      const { data: members, error: membersErr } = await supabase
        .from('room_members')
        .select('uid')
        .eq('room_code', code)

      if (membersErr) throw membersErr
      const alreadyIn = members?.some(m => m.uid === uid)
      if (!alreadyIn && (members?.length ?? 0) >= 2) {
        setError('This room is full. Rooms hold a maximum of 2 people.')
        return
      }

      // Upsert user
      const { error: userErr } = await supabase
        .from('users')
        .upsert({ uid, display_name: finalName, is_online: true }, { onConflict: 'uid' })
      if (userErr) throw userErr

      // Join room
      const { error: memberErr } = await supabase
        .from('room_members')
        .upsert({ room_code: code, uid }, { onConflict: 'room_code,uid' })
      if (memberErr) throw memberErr

      const identity: Identity = { uid, displayName: finalName }
      saveIdentity(identity)
      const roomState = addRoom(code)

      onComplete(identity, roomState)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">💙</div>
          <h1 className="text-3xl font-bold tracking-tight">Care Ping</h1>
          <p className="text-muted-foreground text-sm">
            {isAddingRoom
              ? 'Add a new connection to your Care Ping'
              : 'Stay close with the people who matter most'}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="create">
              <TabsList className="w-full mb-6">
                <TabsTrigger value="create" className="flex-1">Create a Room</TabsTrigger>
                <TabsTrigger value="join" className="flex-1">Join a Room</TabsTrigger>
              </TabsList>

              {/* Name field — only shown on first onboarding */}
              {!isAddingRoom && (
                <div className="mb-5 space-y-2">
                  <Label htmlFor="display-name">Your name</Label>
                  <Input
                    id="display-name"
                    placeholder="e.g. Mom, Alex, Grandpa..."
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                    autoFocus
                  />
                </div>
              )}

              {isAddingRoom && (
                <div className="mb-5 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
                  Adding a connection as <span className="font-medium text-foreground">{existingIdentity!.displayName}</span>
                </div>
              )}

              <TabsContent value="create" className="space-y-4">
                <Card className="bg-muted/30 border-dashed">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base">Create a new room</CardTitle>
                    <CardDescription className="text-xs">
                      A unique code will be generated. Share it with one friend.
                    </CardDescription>
                  </CardHeader>
                </Card>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={loading || (!isAddingRoom && !name.trim())}
                >
                  {loading ? <><Spinner className="mr-2" /> Creating...</> : 'Create Room'}
                </Button>
              </TabsContent>

              <TabsContent value="join" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-code">Room code</Label>
                  <Input
                    id="room-code"
                    placeholder="e.g. ABC123"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
                    maxLength={8}
                    className="tracking-widest font-mono text-center text-lg"
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button
                  className="w-full"
                  onClick={handleJoin}
                  disabled={loading || (!isAddingRoom && !name.trim()) || !joinCode.trim()}
                >
                  {loading ? <><Spinner className="mr-2" /> Joining...</> : 'Join Room'}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

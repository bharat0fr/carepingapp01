// Stable per-device identity — created once, never reset
export interface Identity {
  uid: string
  displayName: string
}

// Per-device room state
export interface RoomState {
  activeRoomCode: string | null
  joinedRoomCodes: string[]
}

const IDENTITY_KEY = 'carePingIdentity'
const ROOMS_KEY = 'carePingRooms'

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Identity
  } catch {
    return null
  }
}

export function saveIdentity(identity: Identity): void {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export function loadRoomState(): RoomState {
  try {
    const raw = localStorage.getItem(ROOMS_KEY)
    if (!raw) return { activeRoomCode: null, joinedRoomCodes: [] }
    return JSON.parse(raw) as RoomState
  } catch {
    return { activeRoomCode: null, joinedRoomCodes: [] }
  }
}

export function saveRoomState(state: RoomState): void {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(state))
}

export function addRoom(roomCode: string): RoomState {
  const state = loadRoomState()
  const joined = [roomCode, ...state.joinedRoomCodes.filter(c => c !== roomCode)]
  const next: RoomState = { activeRoomCode: roomCode, joinedRoomCodes: joined }
  saveRoomState(next)
  return next
}

export function removeRoom(roomCode: string): RoomState {
  const state = loadRoomState()
  const joined = state.joinedRoomCodes.filter(c => c !== roomCode)
  const active = state.activeRoomCode === roomCode ? (joined[0] ?? null) : state.activeRoomCode
  const next: RoomState = { activeRoomCode: active, joinedRoomCodes: joined }
  saveRoomState(next)
  return next
}

export function setActiveRoom(roomCode: string): RoomState {
  const state = loadRoomState()
  const next: RoomState = { ...state, activeRoomCode: roomCode }
  saveRoomState(next)
  return next
}

export function generateUid(): string {
  return crypto.randomUUID()
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

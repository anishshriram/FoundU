import { PrismaClient } from '@prisma/client'
import { send } from '../websocket'
import { notifyMatchCardAppear } from './notificationService'

const prisma = new PrismaClient()

// TODO: TBD — confirm values before launch (FR-4.7, A-3.x)
const CARD_EXPIRY_MS = 45 * 60 * 1000    // 45 minutes
const PROXIMITY_MILES = 0.25
const DENSITY_THRESHOLD = 10              // users that trigger auto-refresh

// ---------------------------------------------------------------------------
// In-memory state (single-server MVP — see ADR-014)
// ---------------------------------------------------------------------------

interface OpenUser {
  lat: number
  lng: number
}

interface ActiveCard {
  userAId: number
  userBId: number
  expiresAt: Date
  timer: NodeJS.Timeout
}

// GPS coordinates while open — never written to DB
const openUsers = new Map<number, OpenUser>()

// Keyed by `${min(a,b)}_${max(a,b)}` to avoid duplicates
const activeCards = new Map<string, ActiveCard>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cardKey(a: number, b: number): string {
  return `${Math.min(a, b)}_${Math.max(a, b)}`
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

async function isBlocked(userA: number, userB: number): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blocker_id: userA, blocked_id: userB },
        { blocker_id: userB, blocked_id: userA },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

function expireCard(key: string): void {
  const card = activeCards.get(key)
  if (!card) return
  activeCards.delete(key)
  send(card.userAId, { type: 'match_card_expire', user_id: card.userBId })
  send(card.userBId, { type: 'match_card_expire', user_id: card.userAId })
}

function scheduleCard(userAId: number, userBId: number): void {
  const key = cardKey(userAId, userBId)
  if (activeCards.has(key)) return  // card already active between these two users

  const timer = setTimeout(() => expireCard(key), CARD_EXPIRY_MS)
  activeCards.set(key, {
    userAId,
    userBId,
    expiresAt: new Date(Date.now() + CARD_EXPIRY_MS),
    timer,
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MatchCardUser {
  id: number
  name: string
  age: number | null
  photo_url: string | null
}

async function fetchCardProfile(userId: number): Promise<MatchCardUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, age: true, photo_url: true },
  })
}

async function pushCardsForUser(userId: number, lat: number, lng: number): Promise<void> {
  const pool = await prisma.matchPool.findUnique({
    where: { user_id: userId },
    select: { candidates: true },
  })
  if (!pool) return

  const candidates = pool.candidates as Array<{ user_id: number; score: number }>

  for (const { user_id: candidateId } of candidates) {
    if (activeCards.has(cardKey(userId, candidateId))) continue

    const candidateLoc = openUsers.get(candidateId)
    if (!candidateLoc) continue

    if (haversineMiles(lat, lng, candidateLoc.lat, candidateLoc.lng) > PROXIMITY_MILES) continue

    const candidate = await prisma.user.findUnique({
      where: { id: candidateId },
      select: { account_standing: true, is_open: true },
    })
    if (!candidate || candidate.account_standing !== 'active' || !candidate.is_open) continue
    if (await isBlocked(userId, candidateId)) continue

    const [profileA, profileB] = await Promise.all([
      fetchCardProfile(userId),
      fetchCardProfile(candidateId),
    ])
    if (!profileA || !profileB) continue

    scheduleCard(userId, candidateId)

    send(userId, {
      type: 'match_card_appear',
      user: { id: profileB.id, name: profileB.name, age: profileB.age, photo_url: profileB.photo_url },
    })
    send(candidateId, {
      type: 'match_card_appear',
      user: { id: profileA.id, name: profileA.name, age: profileA.age, photo_url: profileA.photo_url },
    })
    notifyMatchCardAppear(userId)
    notifyMatchCardAppear(candidateId)
  }
}

export async function goOpen(userId: number, lat: number, lng: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { is_open: true } })
  openUsers.set(userId, { lat, lng })

  await pushCardsForUser(userId, lat, lng)

  // High-density auto-refresh — re-push cards for all nearby open users
  const nearbyOpen = [...openUsers.entries()].filter(
    ([uid, loc]) =>
      uid !== userId && haversineMiles(lat, lng, loc.lat, loc.lng) <= PROXIMITY_MILES,
  )
  if (nearbyOpen.length >= DENSITY_THRESHOLD) {
    for (const [uid, loc] of nearbyOpen) {
      await pushCardsForUser(uid, loc.lat, loc.lng)
    }
  }
}

export async function goOff(userId: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { is_open: false } })
  openUsers.delete(userId)

  for (const [key, card] of activeCards) {
    if (card.userAId === userId || card.userBId === userId) {
      clearTimeout(card.timer)
      activeCards.delete(key)
      const otherId = card.userAId === userId ? card.userBId : card.userAId
      send(otherId, { type: 'match_card_expire', user_id: userId })
    }
  }
}

export interface ActiveMatchCard {
  user: MatchCardUser
  expires_at: Date
}

export async function getActiveCards(userId: number): Promise<ActiveMatchCard[]> {
  const results: ActiveMatchCard[] = []

  for (const card of activeCards.values()) {
    const otherId =
      card.userAId === userId ? card.userBId :
      card.userBId === userId ? card.userAId :
      null

    if (otherId === null) continue

    const profile = await fetchCardProfile(otherId)
    if (profile) results.push({ user: profile, expires_at: card.expiresAt })
  }

  return results
}

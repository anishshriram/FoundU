import { PrismaClient } from '@prisma/client'
import { send } from '../websocket'

const prisma = new PrismaClient()

// Intro window: 24 hours from mutual match
const INTRO_EXPIRY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = statusCode
  return err
}

async function assertInMatchPool(senderId: number, receiverId: number): Promise<void> {
  const pool = await prisma.matchPool.findUnique({
    where: { user_id: senderId },
    select: { candidates: true },
  })
  const candidates = (pool?.candidates ?? []) as Array<{ user_id: number }>
  if (!candidates.some((c) => c.user_id === receiverId)) {
    throw makeError('Receiver is not in your match pool', 400)
  }
}

async function assertNoExistingSignal(senderId: number, receiverId: number): Promise<void> {
  const existing = await prisma.signal.findFirst({
    where: { sender_id: senderId, receiver_id: receiverId },
    select: { id: true },
  })
  if (existing) throw makeError('Signal already sent to this user', 409)
}

// ---------------------------------------------------------------------------
// Send Signal
// ---------------------------------------------------------------------------

export interface SendSignalResult {
  signal_id: number
  status: 'pending' | 'mutual'
  intro_id?: number
  ice_breaker?: { prompt: string; answer: string } | null
}

export async function sendSignal(
  senderId: number,
  receiverId: number,
  cardExpiresAt: Date,
): Promise<SendSignalResult> {
  if (senderId === receiverId) throw makeError('Cannot signal yourself', 400)

  await assertInMatchPool(senderId, receiverId)
  await assertNoExistingSignal(senderId, receiverId)

  // Check for a pending signal in the other direction (mutual match)
  const reverseSignal = await prisma.signal.findFirst({
    where: { sender_id: receiverId, receiver_id: senderId, status: 'pending' },
    select: { id: true },
  })

  if (!reverseSignal) {
    // No reverse signal yet — create pending signal
    const signal = await prisma.signal.create({
      data: {
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
        expires_at: cardExpiresAt,
      },
      select: { id: true },
    })
    return { signal_id: signal.id, status: 'pending' }
  }

  // Mutual match — transition both signals and create Intro
  const now = new Date()
  const introExpiresAt = new Date(now.getTime() + INTRO_EXPIRY_MS)

  const [newSignal, , intro] = await prisma.$transaction([
    // Create the sender's signal as mutual
    prisma.signal.create({
      data: {
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'mutual',
        expires_at: cardExpiresAt,
        mutually_matched_at: now,
      },
      select: { id: true },
    }),
    // Update the reverse signal to mutual
    prisma.signal.update({
      where: { id: reverseSignal.id },
      data: { status: 'mutual', mutually_matched_at: now },
    }),
    // Create dormant Intro
    prisma.intro.create({
      data: {
        signal_id: reverseSignal.id,  // attach to the first signal
        initiator_id: senderId,
        status: 'dormant',
        expires_at: introExpiresAt,
      },
      select: { id: true },
    }),
  ])

  // Fetch Ice Breaker prompts for both users
  const [senderUser, receiverUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: senderId },
      select: {
        prompt: { select: { prompt_text: true } },
        prompt_answer: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        prompt: { select: { prompt_text: true } },
        prompt_answer: true,
      },
    }),
  ])

  const senderIceBreaker =
    senderUser?.prompt && senderUser.prompt_answer
      ? { prompt: senderUser.prompt.prompt_text, answer: senderUser.prompt_answer }
      : null

  const receiverIceBreaker =
    receiverUser?.prompt && receiverUser.prompt_answer
      ? { prompt: receiverUser.prompt.prompt_text, answer: receiverUser.prompt_answer }
      : null

  // Push mutual_signal to both users simultaneously
  const wsPayloadBase = {
    type: 'mutual_signal' as const,
    signal_id: newSignal.id,
    intro_id: intro.id,
    matched_at: now.toISOString(),
  }
  send(senderId, { ...wsPayloadBase, their_ice_breaker: receiverIceBreaker })
  send(receiverId, { ...wsPayloadBase, their_ice_breaker: senderIceBreaker })

  return {
    signal_id: newSignal.id,
    status: 'mutual',
    intro_id: intro.id,
    ice_breaker: receiverIceBreaker,
  }
}

// ---------------------------------------------------------------------------
// Get Signal
// ---------------------------------------------------------------------------

export async function getSignal(signalId: number, requesterId: number) {
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    select: {
      id: true,
      sender_id: true,
      receiver_id: true,
      status: true,
      created_at: true,
      expires_at: true,
      mutually_matched_at: true,
      sender_viewed_icebreaker: true,
      receiver_viewed_icebreaker: true,
      intro: { select: { id: true, status: true, expires_at: true } },
    },
  })

  if (!signal) throw makeError('Signal not found', 404)
  if (signal.sender_id !== requesterId && signal.receiver_id !== requesterId) {
    throw makeError('Forbidden', 403)
  }

  let ice_breaker: { prompt: string; answer: string } | null = null

  if (signal.status === 'mutual') {
    // Show the other person's Ice Breaker
    const otherId = signal.sender_id === requesterId ? signal.receiver_id : signal.sender_id
    const other = await prisma.user.findUnique({
      where: { id: otherId },
      select: { prompt: { select: { prompt_text: true } }, prompt_answer: true },
    })
    if (other?.prompt && other.prompt_answer) {
      ice_breaker = { prompt: other.prompt.prompt_text, answer: other.prompt_answer }
    }

    // Mark ice breaker viewed
    const viewedField =
      signal.sender_id === requesterId
        ? 'sender_viewed_icebreaker'
        : 'receiver_viewed_icebreaker'
    await prisma.signal.update({ where: { id: signalId }, data: { [viewedField]: true } })
  }

  return { ...signal, ice_breaker }
}

// ---------------------------------------------------------------------------
// Get Intro
// ---------------------------------------------------------------------------

export async function getIntro(introId: number, requesterId: number) {
  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    select: {
      id: true,
      signal_id: true,
      initiator_id: true,
      status: true,
      expires_at: true,
      completed_at: true,
      signal: { select: { sender_id: true, receiver_id: true } },
      // Deliberately omit contact fields — never expose before mutual delivery
    },
  })

  if (!intro) throw makeError('Intro not found', 404)
  const { sender_id, receiver_id } = intro.signal
  if (requesterId !== sender_id && requesterId !== receiver_id) {
    throw makeError('Forbidden', 403)
  }

  const isSender = requesterId === sender_id
  return {
    id: intro.id,
    signal_id: intro.signal_id,
    status: intro.status,
    expires_at: intro.expires_at,
    completed_at: intro.completed_at,
    // Only reveal that YOU have tapped, never the other side's tap status
    you_tapped: isSender
      ? intro.status === 'pending' || intro.status === 'mutual'
      : intro.initiator_id === receiver_id,
  }
}

// ---------------------------------------------------------------------------
// Tap Intro
// ---------------------------------------------------------------------------

export interface TapIntroInput {
  phone_number: string
  instagram?: string | null
}

export interface TapIntroResult {
  status: 'pending' | 'mutual'
  their_contacts?: { phone_number: string; instagram: string | null }
}

export async function tapIntro(
  introId: number,
  requesterId: number,
  input: TapIntroInput,
): Promise<TapIntroResult> {
  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    select: {
      id: true,
      status: true,
      expires_at: true,
      initiator_id: true,
      sender_phone_number: true,
      sender_instagram: true,
      receiver_phone_number: true,
      receiver_instagram: true,
      signal: { select: { sender_id: true, receiver_id: true } },
    },
  })

  if (!intro) throw makeError('Intro not found', 404)

  const { sender_id, receiver_id } = intro.signal
  if (requesterId !== sender_id && requesterId !== receiver_id) {
    throw makeError('Forbidden', 403)
  }
  if (intro.status === 'expired' || new Date() > intro.expires_at) {
    throw makeError('Intro window has expired', 410)
  }
  if (intro.status === 'mutual') throw makeError('Intro already completed', 409)

  const isSender = requesterId === sender_id

  // Check if requester has already tapped
  const alreadyTapped = isSender
    ? intro.sender_phone_number !== null
    : intro.receiver_phone_number !== null
  if (alreadyTapped) throw makeError('Already tapped', 409)

  const otherHasTapped = isSender
    ? intro.receiver_phone_number !== null
    : intro.sender_phone_number !== null

  if (!otherHasTapped) {
    // First tap — record contact, move to pending
    await prisma.intro.update({
      where: { id: introId },
      data: {
        status: 'pending',
        ...(isSender
          ? { sender_phone_number: input.phone_number, sender_instagram: input.instagram ?? null }
          : { receiver_phone_number: input.phone_number, receiver_instagram: input.instagram ?? null }),
      },
    })
    return { status: 'pending' }
  }

  // Mutual tap — deliver contacts and immediately clear them from the record
  const theirPhone = isSender ? intro.receiver_phone_number! : intro.sender_phone_number!
  const theirInstagram = isSender ? intro.receiver_instagram : intro.sender_instagram

  await prisma.intro.update({
    where: { id: introId },
    data: {
      status: 'mutual',
      completed_at: new Date(),
      // Clear all contact values immediately after delivery (FR-6.x)
      sender_phone_number: null,
      sender_instagram: null,
      receiver_phone_number: null,
      receiver_instagram: null,
    },
  })

  const myContacts = { phone_number: input.phone_number, instagram: input.instagram ?? null }
  const theirContacts = { phone_number: theirPhone, instagram: theirInstagram ?? null }

  // Push to the other user via WebSocket
  const otherId = isSender ? receiver_id : sender_id
  send(otherId, { type: 'mutual_signal', intro_id: introId, their_contacts: myContacts })

  return { status: 'mutual', their_contacts: theirContacts }
}

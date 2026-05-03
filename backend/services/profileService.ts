import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// TODO: TBD — confirm 30-day limit before launch (A-3.5)
const HOME_BASE_COOLDOWN_DAYS = 30

export interface UpdateUserInput {
  name?: string
  photo_url?: string
  age?: number
  gender_identity?: string
  preferences?: Prisma.InputJsonValue
  gender_preference?: string
  age_range_min?: number
  age_range_max?: number
  prompt_id?: number
  prompt_answer?: string
  home_base_latitude?: number
  home_base_longitude?: number
  is_open?: boolean
  apns_device_token?: string
}

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  photo_url: true,
  prompt_id: true,
  prompt_answer: true,
  age: true,
  gender_identity: true,
  preferences: true,
  gender_preference: true,
  age_range_min: true,
  age_range_max: true,
  home_base_latitude: true,
  home_base_longitude: true,
  home_base_updated_at: true,
  is_open: true,
  behavioral_score: true,
  account_standing: true,
  created_at: true,
  last_active_at: true,
} as const

export async function updateUser(userId: number, input: UpdateUserInput) {
  const updatesHomeBase =
    input.home_base_latitude !== undefined || input.home_base_longitude !== undefined

  if (updatesHomeBase) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { home_base_updated_at: true },
    })

    if (current?.home_base_updated_at) {
      const cooldownMs = HOME_BASE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      const elapsed = Date.now() - current.home_base_updated_at.getTime()
      if (elapsed < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000))
        const err = new Error(
          `Home base can only be updated once every ${HOME_BASE_COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
        ) as Error & { statusCode: number }
        err.statusCode = 429
        throw err
      }
    }
  }

  const data: Prisma.UserUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.photo_url !== undefined) data.photo_url = input.photo_url
  if (input.age !== undefined) data.age = input.age
  if (input.gender_identity !== undefined) data.gender_identity = input.gender_identity
  if (input.preferences !== undefined) data.preferences = input.preferences
  if (input.gender_preference !== undefined) data.gender_preference = input.gender_preference
  if (input.age_range_min !== undefined) data.age_range_min = input.age_range_min
  if (input.age_range_max !== undefined) data.age_range_max = input.age_range_max
  if (input.prompt_id !== undefined) data.prompt = { connect: { id: input.prompt_id } }
  if (input.prompt_answer !== undefined) data.prompt_answer = input.prompt_answer
  if (input.is_open !== undefined) data.is_open = input.is_open
  if (input.apns_device_token !== undefined) data.apns_device_token = input.apns_device_token
  if (input.home_base_latitude !== undefined)
    data.home_base_latitude = new Prisma.Decimal(input.home_base_latitude)
  if (input.home_base_longitude !== undefined)
    data.home_base_longitude = new Prisma.Decimal(input.home_base_longitude)
  if (updatesHomeBase) data.home_base_updated_at = new Date()

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: USER_SAFE_SELECT,
  })

  // Fire-and-forget reindex call to matching microservice
  const matchingUrl = process.env.MATCHING_SERVICE_URL
  if (matchingUrl) {
    fetch(`${matchingUrl}/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    }).catch((err: unknown) => {
      console.error('[profileService] matching reindex failed:', (err as Error).message)
    })
  }

  return updated
}

export async function deleteUser(userId: number): Promise<void> {
  await prisma.user.delete({ where: { id: userId } })
}

export async function exportUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...USER_SAFE_SELECT,
      signals_sent: true,
      signals_received: true,
      reports_filed: true,
      reports_received: true,
      blocks_created: true,
      blocks_received: true,
      bevents: true,
    },
  })

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }

  return user
}

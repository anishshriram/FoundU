import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const BCRYPT_ROUNDS = 12

// Rutgers email domains accepted at registration (C-3.2)
const RUTGERS_DOMAINS = ['@scarletmail.rutgers.edu', '@rutgers.edu']

export function isRutgersEmail(email: string): boolean {
  const lower = email.toLowerCase()
  return RUTGERS_DOMAINS.some((domain) => lower.endsWith(domain))
}

export interface RegisterInput {
  name: string
  email: string
  phone_number: string
  password: string
}

export interface AuthUser {
  id: number
  name: string
  email: string
}

export async function registerUser(input: RegisterInput): Promise<AuthUser> {
  const { name, email, phone_number, password } = input

  if (!isRutgersEmail(email)) {
    const err = new Error('Email must be a Rutgers .edu address') as Error & { statusCode: number }
    err.statusCode = 400
    throw err
  }

  if (password.length < 8) {
    const err = new Error('Password must be at least 8 characters') as Error & { statusCode: number }
    err.statusCode = 400
    throw err
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone_number }] },
    select: { email: true, phone_number: true },
  })

  if (existing) {
    const message =
      existing.email === email ? 'Email already registered' : 'Phone number already registered'
    const err = new Error(message) as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  // TODO: TBD — SMS verification (C-4.4). Stub until provider is selected (PD-3).
  // await smsService.sendVerificationCode(phone_number)

  const user = await prisma.user.create({
    data: { name, email, phone_number, password_hash },
    select: { id: true, name: true, email: true },
  })

  return user
}

export interface LoginInput {
  email: string
  password: string
}

export async function loginUser(input: LoginInput): Promise<AuthUser> {
  const { email, password } = input

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, password_hash: true, account_standing: true },
  })

  if (!user) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }

  if (user.account_standing === 'banned') {
    const err = new Error('This account has been banned') as Error & { statusCode: number }
    err.statusCode = 403
    throw err
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    const err = new Error('Invalid email or password') as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }

  return { id: user.id, name: user.name, email: user.email }
}

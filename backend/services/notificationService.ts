/**
 * APNs push notification service — fire-and-forget.
 *
 * Credentials required (all in environment variables):
 *   APNS_KEY_ID      — Key ID from Apple Developer Portal
 *   APNS_TEAM_ID     — Team ID from Apple Developer Portal
 *   APNS_KEY         — Full contents of the .p8 private key file
 *   APNS_BUNDLE_ID   — App bundle ID (e.g. com.foundu.app)
 *
 * When any credential is absent the service silently no-ops.
 * A failing APNs call never propagates to the caller.
 *
 * Implementation uses Node.js built-in http2 + jose (ES256 JWT signing)
 * to avoid the fast-jwt CVE present in the apns2 npm package.
 */

import http2 from 'http2'
import { PrismaClient } from '@prisma/client'
import { SignJWT, importPKCS8 } from 'jose'

const prisma = new PrismaClient()

const APNS_HOST_PROD = 'api.push.apple.com'
const APNS_HOST_DEV  = 'api.sandbox.push.apple.com'

// Token valid for 55 minutes — APNs tokens expire at 60 min
const TOKEN_TTL_MS = 55 * 60 * 1000

let _cachedToken: string | null = null
let _tokenGeneratedAt = 0

// ---------------------------------------------------------------------------
// Credentials check
// ---------------------------------------------------------------------------

function credentialsPresent(): boolean {
  return !!(
    process.env.APNS_KEY_ID &&
    process.env.APNS_TEAM_ID &&
    process.env.APNS_KEY &&
    process.env.APNS_BUNDLE_ID
  )
}

// ---------------------------------------------------------------------------
// JWT provider token (ES256, cached, refreshed before expiry)
// ---------------------------------------------------------------------------

async function getProviderToken(): Promise<string> {
  if (_cachedToken && Date.now() - _tokenGeneratedAt < TOKEN_TTL_MS) {
    return _cachedToken
  }

  const key = await importPKCS8(process.env.APNS_KEY!, 'ES256')
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APNS_KEY_ID! })
    .setIssuer(process.env.APNS_TEAM_ID!)
    .setIssuedAt()
    .sign(key)

  _cachedToken = token
  _tokenGeneratedAt = Date.now()
  return token
}

// ---------------------------------------------------------------------------
// HTTP/2 APNs send
// ---------------------------------------------------------------------------

interface ApnsPayload {
  aps: {
    alert: { title: string; body: string }
    sound: string
    badge?: number
  }
  [key: string]: unknown
}

async function sendRaw(deviceToken: string, payload: ApnsPayload): Promise<void> {
  const host = process.env.NODE_ENV === 'production' ? APNS_HOST_PROD : APNS_HOST_DEV
  const token = await getProviderToken()
  const body = JSON.stringify(payload)

  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`)

    client.on('error', reject)

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      ':scheme': 'https',
      ':authority': host,
      'authorization': `bearer ${token}`,
      'apns-topic': process.env.APNS_BUNDLE_ID!,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body).toString(),
    })

    req.on('response', (headers) => {
      const status = headers[':status']
      let responseBody = ''
      req.on('data', (chunk) => (responseBody += chunk))
      req.on('end', () => {
        client.close()
        if (status === 200) {
          resolve()
        } else {
          reject(new Error(`APNs ${status}: ${responseBody}`))
        }
      })
    })

    req.write(body)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Device token lookup
// ---------------------------------------------------------------------------

async function getDeviceToken(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apns_device_token: true },
  })
  return user?.apns_device_token ?? null
}

// ---------------------------------------------------------------------------
// Fire-and-forget dispatcher
// ---------------------------------------------------------------------------

function dispatch(userId: number, payload: ApnsPayload): void {
  if (!credentialsPresent()) return

  Promise.resolve()
    .then(async () => {
      const deviceToken = await getDeviceToken(userId)
      if (!deviceToken) return
      await sendRaw(deviceToken, payload)
    })
    .catch((err: unknown) => {
      console.error(`[notificationService] push failed for user ${userId}:`, (err as Error).message)
    })
}

// ---------------------------------------------------------------------------
// Public notification types
// ---------------------------------------------------------------------------

export function notifyMatchCardAppear(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: 'FoundU', body: 'Someone nearby is open to meeting you' },
      sound: 'default',
    },
  })
}

export function notifyMutualSignal(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: "It's a match", body: 'Check your Ice Breaker' },
      sound: 'default',
    },
  })
}

export function notifyWarmIntroTapReceived(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: 'FoundU', body: "Someone tapped 'I met someone tonight'" },
      sound: 'default',
    },
  })
}

export function notifyWarmIntroCompleted(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: 'Contact exchanged', body: 'Your contact has been shared' },
      sound: 'default',
    },
  })
}

export function notifyWarmIntroExpiring(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: 'FoundU', body: 'Your Warm Intro window closes soon' },
      sound: 'default',
    },
  })
}

export function notifyReportReceived(userId: number): void {
  dispatch(userId, {
    aps: {
      alert: { title: 'FoundU', body: 'Your report has been received' },
      sound: 'default',
    },
  })
}

import { FastifyInstance } from 'fastify'
import { WebSocket } from 'ws'

// In-memory connection registry — single-server MVP (see ADR-014)
const connections = new Map<number, WebSocket>()

export type WsMessageType =
  | 'match_card_appear'
  | 'match_card_expire'
  | 'mutual_signal'
  | 'system_status'

export interface WsMessage {
  type: WsMessageType
  [key: string]: unknown
}

export function send(userId: number, message: WsMessage): boolean {
  const ws = connections.get(userId)
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify(message))
  return true
}

export function registerWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket, req) => {
    let userId: number | null = null

    // JWT validation — first message must be { type: "auth", token: "..." }
    // Subsequent messages from unauthenticated sockets are dropped.
    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>

        if (userId === null) {
          if (msg.type !== 'auth' || typeof msg.token !== 'string') {
            socket.send(
              JSON.stringify({ type: 'system_status', error: 'Authentication required' }),
            )
            socket.close(1008, 'Authentication required')
            return
          }

          try {
            const payload = app.jwt.verify<{ user_id: number }>(msg.token)
            userId = payload.user_id
            connections.set(userId, socket as unknown as WebSocket)
            socket.send(JSON.stringify({ type: 'system_status', message: 'Authenticated' }))
            app.log.info({ userId }, 'WS client connected')
          } catch {
            socket.send(
              JSON.stringify({ type: 'system_status', error: 'Invalid or expired token' }),
            )
            socket.close(1008, 'Invalid token')
          }
          return
        }

        // Keepalive ping
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'system_status', message: 'pong' }))
        }
      } catch {
        // Ignore malformed frames
      }
    })

    socket.on('close', () => {
      if (userId !== null) {
        connections.delete(userId)
        app.log.info({ userId }, 'WS client disconnected')
      }
    })

    socket.on('error', (err: Error) => {
      app.log.error({ userId, err: err.message }, 'WS error')
    })
  })
}

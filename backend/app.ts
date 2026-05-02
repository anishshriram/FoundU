import Fastify, { FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyWebSocket from '@fastify/websocket'

import usersRoutes from './routes/users'
import proximityRoutes from './routes/proximity'
import signalsRoutes from './routes/signals'
import introsRoutes from './routes/intros'
import reportsRoutes from './routes/reports'
import blocksRoutes from './routes/blocks'
import venuesRoutes from './routes/venues'
import { registerWebSocket } from './websocket'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  })

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required')

  app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: '24h' },
  })

  app.register(fastifyWebSocket)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(usersRoutes, { prefix: '/users' })
  app.register(proximityRoutes, { prefix: '/proximity' })
  app.register(signalsRoutes, { prefix: '/signals' })
  app.register(introsRoutes, { prefix: '/intros' })
  app.register(reportsRoutes, { prefix: '/reports' })
  app.register(blocksRoutes, { prefix: '/blocks' })
  app.register(venuesRoutes, { prefix: '/venues' })

  // WebSocket endpoint — must be registered after fastifyWebSocket plugin
  registerWebSocket(app)

  return app
}

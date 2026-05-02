import Fastify, { FastifyInstance } from 'fastify'
import fastifyJwt from '@fastify/jwt'

import usersRoutes from './routes/users'
import proximityRoutes from './routes/proximity'
import signalsRoutes from './routes/signals'
import introsRoutes from './routes/intros'
import reportsRoutes from './routes/reports'
import blocksRoutes from './routes/blocks'
import venuesRoutes from './routes/venues'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  })

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required')

  // JWT plugin — decorates app.jwt and req.jwtVerify() on all routes
  app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: '24h' },
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(usersRoutes, { prefix: '/users' })
  app.register(proximityRoutes, { prefix: '/proximity' })
  app.register(signalsRoutes, { prefix: '/signals' })
  app.register(introsRoutes, { prefix: '/intros' })
  app.register(reportsRoutes, { prefix: '/reports' })
  app.register(blocksRoutes, { prefix: '/blocks' })
  app.register(venuesRoutes, { prefix: '/venues' })

  return app
}

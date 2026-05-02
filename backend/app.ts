import Fastify, { FastifyInstance } from 'fastify'

import usersRoutes from './routes/users'
import proximityRoutes from './routes/proximity'
import signalsRoutes from './routes/signals'
import introsRoutes from './routes/intros'
import reportsRoutes from './routes/reports'
import blocksRoutes from './routes/blocks'
import venuesRoutes from './routes/venues'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  })

  app.get('/health', async () => {
    return { status: 'ok' }
  })

  app.register(usersRoutes, { prefix: '/users' })
  app.register(proximityRoutes, { prefix: '/proximity' })
  app.register(signalsRoutes, { prefix: '/signals' })
  app.register(introsRoutes, { prefix: '/intros' })
  app.register(reportsRoutes, { prefix: '/reports' })
  app.register(blocksRoutes, { prefix: '/blocks' })
  app.register(venuesRoutes, { prefix: '/venues' })

  return app
}

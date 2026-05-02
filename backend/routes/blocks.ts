import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middleware/auth'
import { blockUser, getBlocks } from '../services/safetyService'

const blocksRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { blocked_id: number } }>('/', { preHandler: authenticate }, async (req, reply) => {
    const { blocked_id } = req.body ?? {}

    if (!blocked_id || typeof blocked_id !== 'number') {
      return reply.status(400).send({ error: 'blocked_id (number) is required' })
    }

    try {
      const result = await blockUser(req.user.user_id, blocked_id)
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const blocks = await getBlocks(req.user.user_id)
    return reply.send({ blocks })
  })
}

export default blocksRoutes

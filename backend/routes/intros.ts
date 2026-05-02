import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middleware/auth'
import { getIntro, tapIntro, type TapIntroInput } from '../services/signalService'

const introsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (req, reply) => {
    const introId = parseInt(req.params.id, 10)
    if (isNaN(introId)) return reply.status(400).send({ error: 'Invalid intro id' })

    try {
      const intro = await getIntro(introId, req.user.user_id)
      return reply.send(intro)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post<{ Params: { id: string }; Body: TapIntroInput }>(
    '/:id/tap',
    { preHandler: authenticate },
    async (req, reply) => {
      const introId = parseInt(req.params.id, 10)
      if (isNaN(introId)) return reply.status(400).send({ error: 'Invalid intro id' })

      const { phone_number, instagram } = req.body ?? {}
      if (!phone_number || typeof phone_number !== 'string') {
        return reply.status(400).send({ error: 'phone_number is required' })
      }

      try {
        const result = await tapIntro(introId, req.user.user_id, {
          phone_number,
          instagram: instagram ?? null,
        })
        return reply.send(result)
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )
}

export default introsRoutes

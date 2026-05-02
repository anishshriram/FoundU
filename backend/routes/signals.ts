import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middleware/auth'
import { sendSignal, getSignal } from '../services/signalService'

interface SendSignalBody {
  receiver_id: number
  card_expires_at: string  // ISO timestamp from the match card
}

const signalsRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: SendSignalBody }>('/', { preHandler: authenticate }, async (req, reply) => {
    const { receiver_id, card_expires_at } = req.body ?? {}

    if (!receiver_id || typeof receiver_id !== 'number') {
      return reply.status(400).send({ error: 'receiver_id (number) is required' })
    }
    if (!card_expires_at || isNaN(Date.parse(card_expires_at))) {
      return reply.status(400).send({ error: 'card_expires_at (ISO timestamp) is required' })
    }

    try {
      const result = await sendSignal(req.user.user_id, receiver_id, new Date(card_expires_at))
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.get<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (req, reply) => {
    const signalId = parseInt(req.params.id, 10)
    if (isNaN(signalId)) return reply.status(400).send({ error: 'Invalid signal id' })

    try {
      const signal = await getSignal(signalId, req.user.user_id)
      return reply.send(signal)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })
}

export default signalsRoutes

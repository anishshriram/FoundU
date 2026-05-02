import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middleware/auth'
import { goOpen, goOff, getActiveCards } from '../services/proximityService'

interface OpenBody {
  lat: number
  lng: number
}

const proximityRoutes: FastifyPluginAsync = async (app) => {
  // GPS coordinates are consumed in-memory only — never stored, never returned.

  app.post<{ Body: OpenBody }>('/open', { preHandler: authenticate }, async (req, reply) => {
    const { lat, lng } = req.body ?? {}

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return reply.status(400).send({ error: 'lat and lng (numbers) are required' })
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return reply.status(400).send({ error: 'lat/lng out of range' })
    }

    try {
      await goOpen(req.user.user_id, lat, lng)
      return reply.send({ status: 'open' })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.delete('/open', { preHandler: authenticate }, async (req, reply) => {
    try {
      await goOff(req.user.user_id)
      return reply.send({ status: 'off' })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.get('/matches', { preHandler: authenticate }, async (req, reply) => {
    try {
      const cards = await getActiveCards(req.user.user_id)
      return reply.send({ cards })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })
}

export default proximityRoutes

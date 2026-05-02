import { FastifyPluginAsync } from 'fastify'
import { ReportReason } from '@prisma/client'
import { authenticate } from '../middleware/auth'
import { submitReport, getReports, recordScreenshot } from '../services/safetyService'

interface ReportBody {
  reported_id: number
  signal_id?: number | null
  warm_intro_id?: number | null
  reason: ReportReason
  reason_detail?: string | null
}

const VALID_REASONS = new Set<string>(Object.values(ReportReason))

const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ReportBody }>('/', { preHandler: authenticate }, async (req, reply) => {
    const { reported_id, reason } = req.body ?? {}

    if (!reported_id || typeof reported_id !== 'number') {
      return reply.status(400).send({ error: 'reported_id (number) is required' })
    }
    if (!reason || !VALID_REASONS.has(reason)) {
      return reply.status(400).send({
        error: `reason must be one of: ${[...VALID_REASONS].join(', ')}`,
      })
    }

    try {
      const result = await submitReport(req.user.user_id, {
        reported_id,
        signal_id: req.body.signal_id ?? null,
        warm_intro_id: req.body.warm_intro_id ?? null,
        reason,
        reason_detail: req.body.reason_detail ?? null,
      })
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.get('/', { preHandler: authenticate }, async (req, reply) => {
    const reports = await getReports(req.user.user_id)
    return reply.send({ reports })
  })

  // Called by iOS when a screenshot is detected in the Intro/signal view
  app.post<{ Body: { reported_id: number } }>(
    '/screenshot',
    { preHandler: authenticate },
    async (req, reply) => {
      const { reported_id } = req.body ?? {}
      if (!reported_id || typeof reported_id !== 'number') {
        return reply.status(400).send({ error: 'reported_id (number) is required' })
      }
      try {
        await recordScreenshot(req.user.user_id, reported_id)
        return reply.send({ status: 'recorded' })
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )
}

export default reportsRoutes

import { FastifyPluginAsync } from 'fastify'

// Implemented in Milestone 6 — Signal Service
//
// All endpoints protected by auth middleware.
//   POST /signals       — send a Signal; detects mutual and triggers Ice Breaker
//   GET  /signals/:id   — get Signal status and Ice Breaker content (if mutual)
const signalsRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 6
}

export default signalsRoutes

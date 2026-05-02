import { FastifyPluginAsync } from 'fastify'

// Implemented in Milestone 7 — Safety Service
//
// All endpoints protected by auth middleware.
//   POST /reports — submit report; auto-blocks, creates BEvent, applies score delta
const reportsRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 7
}

export default reportsRoutes

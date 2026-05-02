import { FastifyPluginAsync } from 'fastify'

// Implemented in Milestone 7 — Safety Service
//
// All endpoints protected by auth middleware.
//   POST /blocks — block a user; creates BEvent, applies score delta
const blocksRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 7
}

export default blocksRoutes

import { FastifyPluginAsync } from 'fastify'

// Implemented in Milestone 6 — Signal Service
//
// All endpoints protected by auth middleware.
//   GET  /intros/:id      — get Warm Intro status
//   POST /intros/:id/tap  — "I met someone tonight" tap; mutual tap exchanges contact
const introsRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 6
}

export default introsRoutes

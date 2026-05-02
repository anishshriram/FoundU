import { FastifyPluginAsync } from 'fastify'

// Implemented in Milestone 5 — Proximity Service and WebSocket
//
// All endpoints protected by auth middleware.
//   POST   /proximity/open    — toggle Open, push match cards via WebSocket
//   DELETE /proximity/open    — toggle Off, expire active match cards
//   GET    /proximity/matches — return current active match cards
//
// GPS coordinates are consumed server-side and never stored or returned.
const proximityRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 5
}

export default proximityRoutes

import { FastifyPluginAsync } from 'fastify'

// Implemented across Milestone 2 (auth) and Milestone 3 (profile)
//
// Unprotected:
//   POST /users/register  — registration + SMS verification + JWT issue
//   POST /users/login     — login + JWT issue
//
// Protected (auth middleware required):
//   POST   /users/logout
//   PATCH  /users/:id     — profile update → triggers matching reindex
//   DELETE /users/:id     — account deletion (cascades all data)
//   GET    /users/:id/export — personal data export (NFR-5.5)
const usersRoutes: FastifyPluginAsync = async (_app) => {
  // Routes registered in Milestone 2 and Milestone 3
}

export default usersRoutes

import { FastifyRequest, FastifyReply } from 'fastify'

// Implemented in Milestone 2 — Authentication Service
//
// Validates JWT from Authorization: Bearer <token> header.
// Attaches { user_id, email } to req.user via @fastify/jwt module augmentation.
// Returns 401 on missing, malformed, or expired token.
// Applied to every route except POST /users/register and POST /users/login.
export async function authenticate(_req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // TODO: implement — await req.jwtVerify()
}

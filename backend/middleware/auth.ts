import { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify()
  } catch (err: unknown) {
    const expired =
      err instanceof Error &&
      (err.message.toLowerCase().includes('expired') ||
        ('code' in err && (err as { code: string }).code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED'))
    void reply.status(401).send({
      error: expired ? 'Token expired, please log in again' : 'Authentication token required',
    })
  }
}

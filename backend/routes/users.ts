import { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middleware/auth'
import { registerUser, loginUser, type RegisterInput, type LoginInput } from '../services/authService'
import { updateUser, deleteUser, exportUser, type UpdateUserInput } from '../services/profileService'

const usersRoutes: FastifyPluginAsync = async (app) => {
  // ── Unprotected ────────────────────────────────────────────────────────────

  app.post<{ Body: RegisterInput }>('/register', async (req, reply) => {
    const { name, email, phone_number, password } = req.body ?? {}

    if (!name || !email || !phone_number || !password) {
      return reply
        .status(400)
        .send({ error: 'name, email, phone_number, and password are required' })
    }

    try {
      const user = await registerUser({ name, email, phone_number, password })
      const token = app.jwt.sign({ user_id: user.id, email: user.email })
      return reply.status(201).send({ token, user })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  app.post<{ Body: LoginInput }>('/login', async (req, reply) => {
    const { email, password } = req.body ?? {}

    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password are required' })
    }

    try {
      const user = await loginUser({ email, password })
      const token = app.jwt.sign({ user_id: user.id, email: user.email })
      return reply.send({ token, user })
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number }
      return reply.status(e.statusCode ?? 500).send({ error: e.message })
    }
  })

  // ── Protected ──────────────────────────────────────────────────────────────

  app.post('/logout', { preHandler: authenticate }, async (_req, reply) => {
    // Stateless JWT — no server-side token invalidation in MVP.
    // Client deletes the token from iOS Keychain on receipt of this response.
    return reply.send({ message: 'Logged out successfully' })
  })

  app.patch<{ Params: { id: string }; Body: UpdateUserInput }>(
    '/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      const targetId = parseInt(req.params.id, 10)
      if (req.user.user_id !== targetId) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      try {
        const user = await updateUser(targetId, req.body ?? {})
        return reply.send({ user })
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: authenticate },
    async (req, reply) => {
      const targetId = parseInt(req.params.id, 10)
      if (req.user.user_id !== targetId) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      try {
        await deleteUser(targetId)
        return reply.status(204).send()
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )

  // Data export per NFR-5.5
  app.get<{ Params: { id: string } }>(
    '/:id/export',
    { preHandler: authenticate },
    async (req, reply) => {
      const targetId = parseInt(req.params.id, 10)
      if (req.user.user_id !== targetId) {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      try {
        const data = await exportUser(targetId)
        return reply.send({ data })
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number }
        return reply.status(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )
}

export default usersRoutes

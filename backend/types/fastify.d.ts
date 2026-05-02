import '@fastify/jwt'

// Extends @fastify/jwt so req.user is typed throughout the app.
// user_id scopes all DB queries to the authenticated user.
// email identifies the account.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { user_id: number; email: string }
    user: { user_id: number; email: string }
  }
}

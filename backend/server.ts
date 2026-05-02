import 'dotenv/config'
import { buildApp } from './app'
import { startPassiveRecovery } from './services/safetyService'

const PORT = parseInt(process.env.PORT ?? '3000', 10)
const HOST = process.env.HOST ?? '0.0.0.0'

const start = async (): Promise<void> => {
  const app = buildApp()
  try {
    await app.listen({ port: PORT, host: HOST })
    startPassiveRecovery()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()

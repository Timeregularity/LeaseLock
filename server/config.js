import 'dotenv/config'

function readPort(value) {
  const port = Number(value ?? 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }
  return port
}

export const config = Object.freeze({
  port: readPort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://leaselock:leaselock@localhost:5432/leaselock'
})

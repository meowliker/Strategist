import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Supabase Postgres connection.
 *
 * Two things this file has to get right, both learned the hard way:
 *
 * 1. The project password contains an "@", so DATABASE_URL must carry it
 *    percent-encoded (%40) or the driver reads the host wrong.
 *
 * 2. The client is cached on globalThis. Next.js re-evaluates modules on every
 *    hot reload in development, and a module-level pool would be recreated each
 *    time while the old one kept its sockets open. Supabase's session pooler
 *    caps the whole project at 15 clients, so a handful of edits was enough to
 *    exhaust it and take down every query — including the running backfill.
 */
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const globalForDb = globalThis as unknown as {
  __strategistSql?: ReturnType<typeof postgres>
}

const client =
  globalForDb.__strategistSql ??
  postgres(connectionString, {
    prepare: false,
    // Deliberately small: the web app, the backfill and any script each hold a
    // pool, and they share a 15-client ceiling.
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 15,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.__strategistSql = client

export const db = drizzle(client, { schema })
export { schema }

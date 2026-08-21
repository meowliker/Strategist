import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Supabase Postgres connection, via the session pooler.
 *
 * Two things this connection needs that are easy to miss:
 *  - `ssl: 'require'`. The pooler will accept the TCP connection and then stall
 *    the handshake without it, which looks like a network timeout rather than a
 *    TLS problem.
 *  - DATABASE_URL must percent-encode the "@" in the password (%40), or the
 *    driver reads everything after it as the host.
 *
 * The direct db.*.supabase.co host is IPv6-only and unreachable from IPv4
 * networks — always use the pooler hostname.
 */
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const client = postgres(connectionString, { prepare: false, max: 5, ssl: 'require' })
export const db = drizzle(client, { schema })
export { schema }

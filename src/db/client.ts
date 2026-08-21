import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Supabase Postgres connection.
 *
 * Note: the project password contains an "@", so DATABASE_URL must carry it
 * percent-encoded (%40) or the driver parses the host wrong.
 */
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const client = postgres(connectionString, { prepare: false, max: 5 })
export const db = drizzle(client, { schema })
export { schema }

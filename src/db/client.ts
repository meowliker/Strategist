import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  __strategistSql?: ReturnType<typeof postgres>
  __strategistDb?: ReturnType<typeof drizzle>
}

function getDb() {
  if (globalForDb.__strategistDb) return globalForDb.__strategistDb

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client =
    globalForDb.__strategistSql ??
    postgres(connectionString, {
      prepare: false,
      max: Number(process.env.PG_POOL_MAX ?? 3),
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      connect_timeout: 15,
    })

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__strategistSql = client
  }

  const db = drizzle(client, { schema })
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__strategistDb = db
  }
  return db
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as never)[prop as never]
  },
})
export { schema }

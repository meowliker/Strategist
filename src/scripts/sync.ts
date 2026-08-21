/**
 * Pulls the four in-scope lists from ClickUp and writes data/snapshot.json.
 *
 * Read-only: this script only ever issues GETs. Run it with
 *   CLICKUP_TOKEN=pk_... npm run sync
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { ClickUpClient, type ClickUpTask } from '../lib/clickup/client'
import { buildSnapshot } from '../lib/data/build'
import { PRODUCTS } from '../lib/products'
import { persistTasks } from '../db/persist'

async function main() {
  const token = process.env.CLICKUP_TOKEN
  if (!token) {
    console.error('CLICKUP_TOKEN is not set. Copy .env.example to .env and add a read-only token.')
    process.exit(1)
  }

  const client = new ClickUpClient(token)
  const all: ClickUpTask[] = []

  for (const product of PRODUCTS) {
    process.stdout.write(`  ${product.name.padEnd(26)} `)
    const tasks = await client.listTasks(product.listId)
    all.push(...tasks)
    console.log(`${String(tasks.length).padStart(4)} tasks`)
  }

  const { upserted, duplicates } = await persistTasks(all, 'manual')
  console.log(`\n  Postgres: ${upserted} rows upserted (${duplicates} flagged duplicate)`)

  const snapshot = buildSnapshot(all, { live: true })
  await mkdir(path.join(process.cwd(), 'data'), { recursive: true })
  await writeFile(
    path.join(process.cwd(), 'data', 'snapshot.json'),
    JSON.stringify(snapshot, null, 2),
  )

  const { totals } = snapshot
  console.log(`\n  ${totals.tasks} unique tasks · ${totals.winners} winners · ${totals.losers} losers`)
  console.log(`  ${snapshot.formats.length} format buckets`)
  console.log('  → data/snapshot.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

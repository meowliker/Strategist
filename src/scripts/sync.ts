/**
 * Pulls the four in-scope lists from ClickUp and writes data/snapshot.json.
 *
 * Read-only: this script only ever issues GETs. Run it with
 *   CLICKUP_TOKEN=pk_... npm run sync
 */
import { ClickUpClient, type ClickUpTask } from '../lib/clickup/client'
import { PRODUCTS, WINNING_STATUSES } from '../lib/products'
import { persistTasks } from '../db/persist'

/**
 * Winners only by default.
 *
 * Note the tradeoff: without losers there is no denominator, so a "win rate"
 * becomes a win count and the synthesis loses the contrast it grounds "what to
 * avoid" in. Losers already synced are left in place, so existing figures
 * survive. Pass --all to pull every status again.
 */
const allStatuses = process.argv.includes('--all')
const productArg = process.argv.find((a) => a.startsWith('--product='))?.split('=')[1]

async function main() {
  const token = process.env.CLICKUP_TOKEN
  if (!token) {
    console.error('CLICKUP_TOKEN is not set. Copy .env.example to .env and add a read-only token.')
    process.exit(1)
  }

  const client = new ClickUpClient(token)
  const all: ClickUpTask[] = []

  const targets = productArg
    ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(productArg.toLowerCase()) || p.key === productArg)
    : PRODUCTS
  if (!targets.length) {
    console.error(`Unknown product "${productArg}". Known: ${PRODUCTS.map((p) => p.name).join(', ')}`)
    process.exit(1)
  }

  console.log(allStatuses ? 'Pulling every status\n' : 'Pulling winners only (--all for every status)\n')

  for (const product of targets) {
    process.stdout.write(`  ${product.name.padEnd(26)} `)
    const tasks = await client.listTasks(
      product.listId,
      allStatuses ? undefined : WINNING_STATUSES,
    )
    all.push(...tasks)
    console.log(`${String(tasks.length).padStart(4)} tasks`)
  }

  const { upserted, duplicates } = await persistTasks(all, 'manual')
  console.log(`\n  Postgres: ${upserted} rows upserted (${duplicates} flagged duplicate)`)
  console.log('  Next: npm run snapshot   (rebuilds the dashboard view from Postgres)')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

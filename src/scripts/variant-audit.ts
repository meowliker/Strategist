/** Reports which winner tasks name a single winning variation. */
import { and, inArray, isNull } from 'drizzle-orm'
import { db } from '../db/client'
import { tasks } from '../db/schema'
import { winningVariant } from '../lib/parse/winningVariant'

async function main() {
  const rows = await db
    .select({ name: tasks.name, product: tasks.productName, d: tasks.rawDescription })
    .from(tasks)
    .where(and(
      inArray(tasks.category, ['winner', 'mild_winner', 'scale']),
      isNull(tasks.duplicateOfTaskId),
    ))

  const hits = rows.map((r) => ({ ...r, v: winningVariant(r.d) })).filter((r) => r.v !== null)
  const byProduct: Record<string, number> = {}
  for (const h of hits) byProduct[h.product] = (byProduct[h.product] ?? 0) + 1

  console.log(`${hits.length} of ${rows.length} winner tasks name a single variant\n`)
  for (const [p, n] of Object.entries(byProduct)) console.log(`  ${p.padEnd(26)} ${n}`)
  console.log()
  hits.slice(0, 12).forEach((h) => console.log(`  ${h.name.slice(0, 34).padEnd(36)}V${h.v}`))
  console.log(`\n  saves ~${hits.length * 2} analyses ≈ $${(hits.length * 2 * 0.18).toFixed(2)}`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })

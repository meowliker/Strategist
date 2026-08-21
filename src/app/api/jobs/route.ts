import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '../../../db/client'
import { getJobs, startJob, stopJob, type JobKind } from '../../../lib/jobs/runner'

export const dynamic = 'force-dynamic'

const VALID: JobKind[] = ['watch', 'enrich', 'sync', 'snapshot', 'synthesize']

/**
 * Job status, plus outstanding work broken down by product.
 *
 * The buttons show the count for whichever product is selected, so switching
 * products tells you where the gap actually is rather than repeating one
 * workspace-wide number on every page.
 */
export async function GET(req: Request) {
  const product = new URL(req.url).searchParams.get('product')

  let byProduct: Record<string, { toWatch: number; toEnrich: number }> = {}
  let pending = { toWatch: 0, toEnrich: 0 }

  try {
    const rows = (await db.execute(sql`
      select
        t.product_name,
        count(distinct t.id) filter (
          where t.drive_link is not null
            and not exists (select 1 from creatives c where c.task_id = t.id)
        )::int as to_watch,
        count(distinct c.id) filter (
          where c.id is not null
            and not exists (select 1 from research r where r.creative_id = c.id)
        )::int as to_enrich
      from tasks t
      left join creatives c on c.task_id = t.id
      where t.category in ('winner','mild_winner','scale')
        and t.duplicate_of_task_id is null
      group by t.product_name
    `)) as unknown as { product_name: string; to_watch: number; to_enrich: number }[]

    for (const r of rows) {
      byProduct[r.product_name] = {
        toWatch: Number(r.to_watch ?? 0),
        toEnrich: Number(r.to_enrich ?? 0),
      }
    }

    pending = product && byProduct[product]
      ? byProduct[product]
      : Object.values(byProduct).reduce(
          (acc, v) => ({ toWatch: acc.toWatch + v.toWatch, toEnrich: acc.toEnrich + v.toEnrich }),
          { toWatch: 0, toEnrich: 0 },
        )
  } catch {
    // Counts are advisory; a blip should not disable the controls.
  }

  return NextResponse.json({ jobs: getJobs(), pending, byProduct })
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string; product?: string | null; action?: string
  }
  const kind = body.kind as JobKind
  if (!VALID.includes(kind)) {
    return NextResponse.json({ error: `unknown job "${body.kind}"` }, { status: 400 })
  }

  if (body.action === 'stop') {
    return NextResponse.json({ stopped: stopJob(kind) })
  }

  const result = startJob(kind, body.product ?? null)
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 })
  return NextResponse.json({ started: kind, product: body.product ?? null })
}

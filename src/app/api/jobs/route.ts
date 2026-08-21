import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '../../../db/client'
import { getJobs, startJob, stopJob, type JobKind } from '../../../lib/jobs/runner'

export const dynamic = 'force-dynamic'

const VALID: JobKind[] = ['watch', 'enrich', 'sync', 'snapshot', 'synthesize']

/** Job status plus how much work is outstanding, so buttons can show counts. */
export async function GET() {
  let pending = { toWatch: 0, toEnrich: 0 }
  try {
    const rows = (await db.execute(sql`
      select
        (select count(*)::int from tasks t
          where t.category in ('winner','mild_winner','scale')
            and t.duplicate_of_task_id is null
            and t.drive_link is not null
            and not exists (select 1 from creatives c where c.task_id = t.id)) as to_watch,
        (select count(*)::int from creatives c
          where not exists (select 1 from research r where r.creative_id = c.id)) as to_enrich
    `)) as unknown as { to_watch: number; to_enrich: number }[]
    pending = { toWatch: Number(rows[0]?.to_watch ?? 0), toEnrich: Number(rows[0]?.to_enrich ?? 0) }
  } catch {
    // Counts are advisory; a blip should not break the controls.
  }
  return NextResponse.json({ jobs: getJobs(), pending })
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

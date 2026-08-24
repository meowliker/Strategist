import { db } from '../../db/client'
import { sql } from 'drizzle-orm'
import { readProduct } from '../../lib/data/select'
import { LIST_TO_KEY } from '../../lib/products'
import type { ProductKey } from '../../lib/data/types'

export const dynamic = 'force-dynamic'

interface HookRow {
  creative_id: string
  task_id: string
  list_id: string
  category: string
  hook_text: string | null
  hook_spoken: string | null
  production_style: string | null
  creative_structure: string | null
  angle: string | null
}

function isMusicStyle(row: HookRow) {
  const text = [row.production_style, row.creative_structure].filter(Boolean).join(' ').toLowerCase()
  return /slideshow|animation|static.graphic|caption.only|caption.led|no.voiceover|sound.on|music|song/.test(text)
}

export default async function HooksPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)

  const productFilter = product !== 'all'
    ? sql`and t.list_id = (select lid from (values
        ('hh','901613416500'),('ad','901613119887'),('ca','901613035012'),
        ('ig','901615920553'),('km','901613118174'),('kl','901613067126')
      ) as p(k,lid) where k = ${product})`
    : sql``

  const rows = (await db.execute(sql`
    select
      c.id as creative_id,
      t.id as task_id,
      t.list_id,
      t.category::text as category,
      o.hook_text,
      tr.hook_spoken,
      o.observed_production_style as production_style,
      o.observed_creative_structure as creative_structure,
      coalesce(nullif(trim(o.observed_angle_signal),''), nullif(trim(t.claimed_angle),''), 'Unknown') as angle
    from tasks t
    join creatives c on c.task_id = t.id
    join observations o on o.creative_id = c.id
    left join transcripts tr on tr.creative_id = c.id
    where t.category in ('winner','mild_winner','scale')
      and t.duplicate_of_task_id is null
      and (o.hook_text is not null or tr.hook_spoken is not null)
      ${productFilter}
    order by angle, t.name
  `)) as unknown as HookRow[]

  // Exclude music-style creatives (their "voiceover" is song lyrics)
  const filtered = rows.filter((r) => !isMusicStyle(r))

  // Deduplicate by hook text within each angle
  const grouped = new Map<string, { hookTexts: Set<string>; hookSpokens: Set<string>; count: number }>()
  for (const r of filtered) {
    const angle = r.angle ?? 'Unknown'
    if (!grouped.has(angle)) grouped.set(angle, { hookTexts: new Set(), hookSpokens: new Set(), count: 0 })
    const g = grouped.get(angle)!
    if (r.hook_text?.trim()) g.hookTexts.add(r.hook_text.trim())
    if (r.hook_spoken?.trim()) g.hookSpokens.add(r.hook_spoken.trim())
    g.count++
  }

  // Sort angles by total hook count desc
  const sorted = [...grouped.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .filter(([, g]) => g.hookTexts.size > 0 || g.hookSpokens.size > 0)

  const totalHooks = sorted.reduce((n, [, g]) => n + g.hookTexts.size + g.hookSpokens.size, 0)

  return (
    <>
      <div className="phead">
        <p className="phead-ey">07 · Hooks</p>
        <h1 className="phead-ttl">Winner hooks by angle</h1>
        <p className="phead-sub">
          Hook lines from winning creatives, grouped by angle. Music-style creatives excluded.
          {totalHooks > 0 && ` ${totalHooks} unique hooks across ${sorted.length} angles.`}
        </p>
      </div>

      {sorted.length === 0 && (
        <div className="empty" style={{ margin: '48px' }}>
          No winning creatives with hook text yet. Run Watch on winners first.
        </div>
      )}

      <div className="hooks-wrap">
        {sorted.map(([angle, g]) => (
          <div className="hooks-group" key={angle}>
            <div className="hooks-angle">
              <span className="hooks-angle-name">{angle}</span>
              <span className="hooks-angle-count">{g.hookTexts.size + g.hookSpokens.size}</span>
            </div>
            <div className="hooks-list">
              {[...g.hookTexts].map((text, i) => (
                <div className="hooks-row" key={`ht-${i}`}>
                  <div className="hooks-text">{text}</div>
                  <span className="hooks-kind hooks-kind-text">on-screen text</span>
                </div>
              ))}
              {[...g.hookSpokens].map((text, i) => (
                <div className="hooks-row" key={`hs-${i}`}>
                  <div className="hooks-text">{text}</div>
                  <span className="hooks-kind hooks-kind-vo">voiceover</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

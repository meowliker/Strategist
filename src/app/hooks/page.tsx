import { db } from '../../db/client'
import { sql } from 'drizzle-orm'
import { readProduct } from '../../lib/data/select'
import HooksView, { type AngleGroup, type HookEntry } from '../../components/HooksView'

export const dynamic = 'force-dynamic'

interface HookRow {
  task_id: string
  task_name: string
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
  return /slideshow|animation|static.graphic|caption.only|caption.led|no.voiceover|sound.on|music\b|song/.test(text)
}

function looksLikeSongLyric(text: string) {
  const t = text.toLowerCase()
  // Repeated phrases (word word, word word) — classic song pattern
  const words = t.split(/\s+/)
  for (let i = 0; i < words.length - 2; i++) {
    const bigram = words[i] + ' ' + words[i + 1]
    if (bigram.length > 4 && (t.includes(bigram + ', ' + bigram) || t.split(bigram).length > 2)) return true
  }
  return false
}

function isJunkHook(text: string) {
  const t = text.trim().toLowerCase()
  if (t.length < 20) return true
  if (/^(thanks for watching|hi all|h all|hey all|bye|goodbye|subscribe|follow me|link in bio)/.test(t)) return true
  return false
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

  // One row per TASK (not per creative variant) — pick any hook_text / hook_spoken for that task
  const rows = (await db.execute(sql`
    select distinct on (t.id)
      t.id as task_id,
      t.name as task_name,
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
    order by t.id, c.variant_index nulls first
  `)) as unknown as HookRow[]

  // Build angle → { textMap, voiceoverMap } with dedup by exact text
  const angleMap = new Map<string, {
    textMap: Map<string, string[]>
    voiceoverMap: Map<string, string[]>
  }>()

  for (const r of rows) {
    if (isMusicStyle(r)) continue
    const angle = r.angle ?? 'Unknown'
    if (!angleMap.has(angle)) angleMap.set(angle, { textMap: new Map(), voiceoverMap: new Map() })
    const { textMap, voiceoverMap } = angleMap.get(angle)!
    const label = r.task_name

    if (r.hook_text?.trim() && !isJunkHook(r.hook_text)) {
      const key = r.hook_text.trim()
      if (!textMap.has(key)) textMap.set(key, [])
      textMap.get(key)!.push(label)
    }

    if (r.hook_spoken?.trim() && !isJunkHook(r.hook_spoken) && !looksLikeSongLyric(r.hook_spoken)) {
      const key = r.hook_spoken.trim()
      if (!voiceoverMap.has(key)) voiceoverMap.set(key, [])
      voiceoverMap.get(key)!.push(label)
    }
  }

  const toEntries = (m: Map<string, string[]>): HookEntry[] =>
    [...m.entries()].map(([text, creatives]) => ({ text, creatives }))

  const groups: AngleGroup[] = [...angleMap.entries()]
    .map(([angle, { textMap, voiceoverMap }]) => ({
      angle,
      textHooks: toEntries(textMap),
      voiceoverHooks: toEntries(voiceoverMap),
    }))
    .filter((g) => g.textHooks.length + g.voiceoverHooks.length > 0)
    .sort((a, b) => (b.textHooks.length + b.voiceoverHooks.length) - (a.textHooks.length + a.voiceoverHooks.length))

  const totalHooks = groups.reduce((n, g) => n + g.textHooks.length + g.voiceoverHooks.length, 0)

  return (
    <>
      <div className="phead">
        <p className="phead-ey">07 · Hooks</p>
        <h1 className="phead-ttl">Winner hooks by angle</h1>
        <p className="phead-sub">
          Hook lines from winning creatives, grouped by angle. Music-style creatives excluded. Click any hook to see which creative it came from.
          {totalHooks > 0 && ` ${totalHooks} unique hooks across ${groups.length} angles.`}
        </p>
      </div>

      <HooksView groups={groups} />
    </>
  )
}

/**
 * Builds the dashboard read model from Postgres.
 *
 * Postgres is the source of truth once analysis has run — it holds both what
 * ClickUp claims and what the creatives show. This projects the two into the
 * shape the UI renders, keeping them side by side rather than collapsing them.
 */
import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import type { Snapshot, CreativeRow, FormatRow, KeywordRow, ProductKey, StatusKey, DualValue, VerdictKey } from './types'
import { PRODUCT_LABEL, STATUS_LABEL } from './types'
import { computeTrust } from './trust'
import { LIST_TO_KEY } from '../products'

const CAT_TO_KEY: Record<string, StatusKey> = {
  winner: 'win', mild_winner: 'mild', scale: 'scale', loser: 'loss', untested: 'un',
}

interface Row {
  task_id: string; list_id: string; name: string; url: string; category: string
  editor: string | null; changed_lever: string | null; notes: string | null
  creative_id: string | null; filename: string | null; variant_index: number | null
  duration_sec: number | null; cuts_per_minute: number | null
  hook_text: string | null
  c_angle: string | null; c_persona: string | null; c_style: string | null
  c_structure: string | null; c_hook: string | null; c_adtype: string | null; c_funnel: string | null
  o_angle: string | null; o_persona: string | null; o_style: string | null
  o_structure: string | null; o_hook: string | null; o_adtype: string | null; o_funnel: string | null
  evidence: Record<string, string> | null
  confidence: Record<string, number> | null
  verdicts: Record<string, string> | null
}

function dual(
  claimed: string | null, observed: string | null, field: string,
  ev: Record<string, string> | null, cf: Record<string, number> | null,
  vd: Record<string, string> | null,
): DualValue {
  return {
    claimed, observed,
    verdict: (vd?.[field] as VerdictKey) ?? (observed ? 'differs' : 'unverifiable'),
    rationale: ev?.[field] ?? null,
    confidence: cf?.[field] ?? null,
  }
}

/**
 * Projects the dashboard view straight from Postgres.
 *
 * Shared by `npm run snapshot`, which writes it to disk, and by the web app,
 * which calls it when no file exists — the normal case on a fresh deploy.
 */
export async function projectSnapshot(): Promise<Snapshot> {

  const rows = (await db.execute(sql`
    select t.id as task_id, t.list_id, t.name, t.url, t.category::text as category,
           t.editor, t.changed_lever, t.notes,
           c.id as creative_id, c.filename, c.variant_index, c.duration_sec, c.cuts_per_minute,
           o.hook_text,
           t.claimed_angle as c_angle, t.claimed_persona as c_persona,
           t.claimed_production_style as c_style, t.claimed_creative_structure as c_structure,
           t.claimed_hook_type as c_hook, t.claimed_ad_type as c_adtype,
           t.claimed_funnel as c_funnel,
           o.observed_angle_signal as o_angle, o.observed_persona_signal as o_persona,
           o.observed_production_style as o_style, o.observed_creative_structure as o_structure,
           o.observed_hook_type as o_hook, o.observed_ad_type as o_adtype,
           o.observed_funnel as o_funnel,
           o.evidence, o.confidence,
           (select jsonb_object_agg(v.field, v.verdict::text) from verdicts v where v.creative_id = c.id) as verdicts
    from tasks t
    left join creatives c on c.task_id = t.id
    left join observations o on o.creative_id = c.id
    where t.duplicate_of_task_id is null
    order by t.product_name, t.name, c.variant_index nulls first
  `)) as unknown as Row[]

  const creatives: CreativeRow[] = rows.map((r) => {
    const product = LIST_TO_KEY[r.list_id] ?? 'ot'
    const status = CAT_TO_KEY[r.category] ?? 'un'
    const analysed = Boolean(r.creative_id && r.o_angle)
    const vd = r.verdicts
    return {
      taskId: r.task_id,
      creativeId: r.creative_id ?? undefined,
      filename: r.filename ?? undefined,
      variantIndex: r.variant_index,
      name: r.filename ?? r.name,
      taskName: r.name,
      url: r.url,
      product, productName: PRODUCT_LABEL[product],
      status, statusLabel: STATUS_LABEL[status],
      assignee: r.editor,
      changedLever: r.changed_lever,
      hook: r.hook_text ?? r.notes,
      adType: r.o_adtype ?? r.c_adtype,
      durationSec: r.duration_sec,
      cutsPerMinute: r.cuts_per_minute,
      angle: dual(r.c_angle, r.o_angle, 'angle', r.evidence, r.confidence, vd),
      persona: dual(r.c_persona, r.o_persona, 'persona', r.evidence, r.confidence, vd),
      productionStyle: dual(r.c_style, r.o_style, 'production_style', r.evidence, r.confidence, vd),
      creativeStructure: dual(r.c_structure, r.o_structure, 'creative_structure', r.evidence, r.confidence, vd),
      hookType: dual(r.c_hook, r.o_hook, 'hook_type', r.evidence, r.confidence, vd),
      funnel: dual(r.c_funnel, r.o_funnel, 'funnel', r.evidence, r.confidence, vd),
      adTypeDual: dual(r.c_adtype, r.o_adtype, 'ad_type', r.evidence, r.confidence, vd),
      verdicts: [],
      mismatchCount: vd ? Object.values(vd).filter((v) => v === 'mismatch').length : 0,
      analysed,
    }
  })

  // Format win rates on the RESOLVED value — observed where the creative
  // settles it, ClickUp's claim otherwise.
  // Bucket on a normalised key so "Hook + Offer" and "Hook+Offer" merge, but
  // display the label as it was actually written — re-casing a lowercased key
  // turns UGC into "Ugc" and How-To into "How-to".
  const buckets = new Map<string, { wins: number; losses: number; product: ProductKey; label: string }>()
  for (const c of creatives) {
    if (c.status !== 'loss' && c.status !== 'win' && c.status !== 'mild' && c.status !== 'scale') continue
    const label = c.creativeStructure?.observed ?? c.creativeStructure?.claimed
    if (!label) continue
    const key = `${c.product}::${label.toLowerCase().replace(/\s*\+\s*/g, ' + ').replace(/\s*\/\s*/g, ' / ').trim()}`
    const b = buckets.get(key) ?? { wins: 0, losses: 0, product: c.product, label: label.trim() }
    if (c.status === 'loss') b.losses++
    else b.wins++
    buckets.set(key, b)
  }

  const formats: FormatRow[] = [...buckets.entries()].map(([key, b]) => {
    const label = b.label
    const tested = b.wins + b.losses
    return {
      key, code: label.slice(0, 2).toUpperCase(), label,
      description: `${PRODUCT_LABEL[b.product]} · ${tested} decided`,
      product: b.product, wins: b.wins, losses: b.losses, tested,
      winRate: tested ? b.wins / tested : null,
    }
  }).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.tested - a.tested)

  const kwRows = (await db.execute(sql`
    select k.term, k.kind, t.list_id, count(distinct c.task_id)::int as wins
    from keywords k
    join creatives c on c.id = k.creative_id
    join tasks t on t.id = c.task_id
    group by k.term, k.kind, t.list_id
    order by wins desc, k.term
    limit 300
  `)) as unknown as { term: string; kind: string; list_id: string; wins: number }[]

  const keywords: KeywordRow[] = kwRows.map((k) => {
    const product = LIST_TO_KEY[k.list_id] ?? 'ot'
    return {
      term: k.term, kind: k.kind as KeywordRow['kind'],
      product, productName: PRODUCT_LABEL[product], weight: 1, wins: k.wins,
    }
  })

  const trust = computeTrust(creatives)

  const distinctTasks = new Set(creatives.map((c) => c.taskId))
  const analysedTasks = new Set(creatives.filter((c) => c.analysed).map((c) => c.taskId))

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    live: true,
    totals: {
      tasks: distinctTasks.size,
      winners: new Set(creatives.filter((c) => c.status !== 'loss' && c.status !== 'un').map((c) => c.taskId)).size,
      losers: new Set(creatives.filter((c) => c.status === 'loss').map((c) => c.taskId)).size,
      analysed: analysedTasks.size,
      mismatches: creatives.reduce((n, c) => n + c.mismatchCount, 0),
    },
    creatives, formats, keywords, trust,
  }
  return snapshot
}

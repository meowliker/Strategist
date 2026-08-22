import { sql } from 'drizzle-orm'
import { db } from '../../db/client'
import type { ProductKey } from './types'
import { LIST_TO_KEY } from '../products'


export interface ResearchCard {
  creativeId: string
  filename: string
  taskName: string
  taskUrl: string
  product: ProductKey
  productName: string
  tier: 'win' | 'mild' | 'scale' | 'loss' | 'un'
  tierLabel: string
  formatDescription: string
  hookMechanism: string
  hookText: string | null
  coreConcept: string
  creativeHypothesis: string
  offer: string | null
  offerMechanism: string | null
  scriptArc: { beat: string; detail: string }[]
  scenes: { n: number; visual: string; onScreenText: string }[]
  tactileElements: string[]
  repurposedSignals: string | null
  sourceHandle: string | null
}

export interface SynthesisCard {
  productKey: string
  productName: string
  hookFormulas: { rank: number; hookType: string; example: string; whyItWorks: string; wins: number; losses: number }[]
  winnerVsMild: string[]
  huntFor: { priority: number; title: string; evidence: string; lookFor: string[]; signals: string[] }[]
  avoid: { thing: string; reason: string }[]
  topPattern: string | null
  winnersAnalysed: number
  losersAnalysed: number
}

const TIER: Record<string, ResearchCard['tier']> = {
  winner: 'win', mild_winner: 'mild', scale: 'scale', loser: 'loss', untested: 'un',
}
const TIER_LABEL: Record<ResearchCard['tier'], string> = {
  win: 'Winner', mild: 'Mild Winner', scale: 'Scale', loss: 'Loser', un: 'Untested',
}

/**
 * Reads the strategic research straight from Postgres — no snapshot step.
 *
 * A database failure returns an empty list rather than throwing. The page is a
 * read-only view over background jobs, so a connection blip should render an
 * empty state, not a 500 that hides the rest of the page.
 */
export async function loadResearch(product: ProductKey | 'all'): Promise<ResearchCard[]> {
  let rows: Record<string, unknown>[]
  try {
    rows = (await db.execute(sql`
    select r.creative_id, c.filename, t.name as task_name, t.url as task_url,
           t.list_id, t.product_name, t.category::text as category,
           r.format_description, r.hook_mechanism, r.core_concept, r.creative_hypothesis,
           r.script_arc, r.scenes, r.tactile_elements, r.repurposed_signals, r.source_handle,
           o.hook_text
    from research r
    join creatives c on c.id = r.creative_id
    join tasks t on t.id = c.task_id
    left join observations o on o.creative_id = c.id
    order by
      case t.category::text when 'scale' then 0 when 'winner' then 1
        when 'mild_winner' then 2 when 'loser' then 3 else 4 end,
      t.name, c.filename
    `)) as unknown as Record<string, unknown>[]
  } catch (e) {
    console.error('[research] query failed:', (e as Error).message)
    return []
  }

  return rows
    .map((r) => {
      const key = LIST_TO_KEY[r.list_id as string] ?? 'ot'
      const tier = TIER[r.category as string] ?? 'un'
      return {
        creativeId: r.creative_id as string,
        filename: r.filename as string,
        taskName: r.task_name as string,
        taskUrl: r.task_url as string,
        product: key,
        productName: r.product_name as string,
        tier,
        tierLabel: TIER_LABEL[tier],
        formatDescription: r.format_description as string,
        hookMechanism: r.hook_mechanism as string,
        hookText: (r.hook_text as string) || null,
        coreConcept: r.core_concept as string,
        creativeHypothesis: r.creative_hypothesis as string,
        offer: (r.offer as string) || null,
        offerMechanism: (r.offer_mechanism as string) || null,
        scriptArc: (r.script_arc as ResearchCard['scriptArc']) ?? [],
        scenes: (r.scenes as ResearchCard['scenes']) ?? [],
        tactileElements: (r.tactile_elements as string[]) ?? [],
        repurposedSignals: (r.repurposed_signals as string) || null,
        sourceHandle: (r.source_handle as string) || null,
      }
    })
    .filter((r) => product === 'all' || r.product === product)
}

export async function loadSynthesis(product: ProductKey | 'all'): Promise<SynthesisCard[]> {
  let rows: Record<string, unknown>[]
  try {
    rows = (await db.execute(sql`
      select product_key, product_name, hook_formulas, winner_vs_mild, hunt_for, avoid,
             top_pattern, winners_analysed, losers_analysed
      from synthesis order by product_name
    `)) as unknown as Record<string, unknown>[]
  } catch (e) {
    // The table is empty until `npm run synthesize` has run for a product.
    console.error('[synthesis] query failed:', (e as Error).message)
    return []
  }

  return rows
    .map((r) => ({
      productKey: r.product_key as string,
      productName: r.product_name as string,
      hookFormulas: (r.hook_formulas as SynthesisCard['hookFormulas']) ?? [],
      winnerVsMild: (r.winner_vs_mild as string[]) ?? [],
      huntFor: (r.hunt_for as SynthesisCard['huntFor']) ?? [],
      avoid: (r.avoid as SynthesisCard['avoid']) ?? [],
      topPattern: (r.top_pattern as string) || null,
      winnersAnalysed: Number(r.winners_analysed ?? 0),
      losersAnalysed: Number(r.losers_analysed ?? 0),
    }))
    .filter((r) => product === 'all' || r.productKey === product)
}

export interface Combination {
  angle: string
  persona: string
  hookType: string
  wins: number
  losses: number
  creativeIds: string[]
}

export interface CombinationInsights {
  bets: Combination[]       // winning combos, sorted by wins desc
  dying: Combination[]      // losing-only combos
  fadingPatterns: string[]  // angles/hook types with high loss rate
}

export async function loadCombinations(product: ProductKey | 'all'): Promise<CombinationInsights> {
  try {
    const productFilter = product !== 'all' ? sql`and t.list_id = (
      select list_id from (values
        ('hh','901613416500'),('ad','901613119887'),('ca','901613035012'),
        ('ig','901615920553'),('km','901613118174'),('kl','901613067126')
      ) as p(k,lid) where k = ${product}
    )` : sql``

    const rows = (await db.execute(sql`
      select
        coalesce(nullif(trim(o.observed_angle_signal),''), nullif(trim(t.claimed_angle),''), 'Unknown') as angle,
        coalesce(nullif(trim(o.observed_persona_signal),''), nullif(trim(t.claimed_persona),''), 'Unknown') as persona,
        coalesce(nullif(trim(o.observed_hook_type),''), nullif(trim(t.claimed_hook_type),''), 'Unknown') as hook_type,
        count(*) filter (where t.category in ('winner','mild_winner','scale'))::int as wins,
        count(*) filter (where t.category = 'loser')::int as losses,
        array_agg(c.id) as creative_ids
      from observations o
      join creatives c on c.id = o.creative_id
      join tasks t on t.id = c.task_id
      where t.category in ('winner','mild_winner','scale','loser')
        and t.duplicate_of_task_id is null
        ${productFilter}
      group by 1,2,3
      having count(*) > 0
      order by wins desc, losses asc
    `)) as unknown as { angle: string; persona: string; hook_type: string; wins: number; losses: number; creative_ids: string[] }[]

    const all: Combination[] = rows.map(r => ({
      angle: r.angle,
      persona: r.persona,
      hookType: r.hook_type,
      wins: Number(r.wins ?? 0),
      losses: Number(r.losses ?? 0),
      creativeIds: r.creative_ids ?? [],
    }))

    const bets = all.filter(c => c.wins > 0).slice(0, 8)
    const dying = all.filter(c => c.wins === 0 && c.losses > 0).slice(0, 5)

    // Detect fading patterns: angles or hook types that are net negative
    const angleMap: Record<string, { wins: number; losses: number }> = {}
    const hookMap: Record<string, { wins: number; losses: number }> = {}
    for (const c of all) {
      if (!angleMap[c.angle]) angleMap[c.angle] = { wins: 0, losses: 0 }
      angleMap[c.angle].wins += c.wins
      angleMap[c.angle].losses += c.losses
      if (!hookMap[c.hookType]) hookMap[c.hookType] = { wins: 0, losses: 0 }
      hookMap[c.hookType].wins += c.wins
      hookMap[c.hookType].losses += c.losses
    }

    const fadingPatterns: string[] = []
    for (const [angle, { wins, losses }] of Object.entries(angleMap)) {
      if (angle === 'Unknown') continue
      if (losses >= 2 && wins === 0) fadingPatterns.push(`"${angle}" angle is 0W / ${losses}L — avoid`)
      else if (losses > wins * 2 && losses >= 2) fadingPatterns.push(`"${angle}" angle has high loss rate (${wins}W / ${losses}L)`)
    }
    for (const [hook, { wins, losses }] of Object.entries(hookMap)) {
      if (hook === 'Unknown') continue
      if (losses >= 2 && wins === 0) fadingPatterns.push(`"${hook}" hook type is 0W / ${losses}L — kill this`)
    }

    return { bets, dying, fadingPatterns }
  } catch (e) {
    console.error('[combinations] query failed:', (e as Error).message)
    return { bets: [], dying: [], fadingPatterns: [] }
  }
}

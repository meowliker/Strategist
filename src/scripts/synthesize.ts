/**
 * Per-product synthesis: what separates the winners from everything else.
 *
 * Unlike the per-creative passes, this one IS given the outcome labels — that
 * is the entire question. It compares creatives that won against creatives that
 * lost, so its conclusions are grounded in the contrast rather than in a model's
 * prior about what good advertising looks like.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { synthesis } from '../db/schema'
import { LIST_TO_KEY } from '../lib/products'

const MODEL = 'claude-opus-5'
const COST_IN = 5 / 1_000_000
const COST_OUT = 25 / 1_000_000

const SynthesisSchema = z.object({
  hook_formulas: z.array(z.object({
    rank: z.number(),
    hook_type: z.string(),
    example: z.string(),
    why_it_works: z.string(),
  })),
  winner_vs_mild: z.array(z.string()),
  hunt_for: z.array(z.object({
    priority: z.number(),
    title: z.string(),
    evidence: z.string(),
    look_for: z.array(z.string()),
    signals: z.array(z.string()),
  })),
  avoid: z.array(z.object({ thing: z.string(), reason: z.string() })),
  top_pattern: z.string(),
})

const SYSTEM = `You are a creative strategist finding the pattern behind which
ads won and which did not, for one product.

You are given every analysed creative for that product, each labelled with its
real outcome: winner, mild winner, or loser. Those labels are the team's own
judgement calls and are the ground truth here.

Your job is to explain the CONTRAST. Anchor every claim in the creatives you
were shown — quote their hooks, name their formats, cite the specific ads.

Rules that matter:
- Rank hook formulas by how they actually performed in this data, not by what
  usually works in advertising. If a formula appears only among losers, say so.
- winner_vs_mild must describe real differences between the winner group and the
  mild-winner group in THIS data. If the two groups look alike on some axis, do
  not manufacture a difference — fewer honest points beat a padded list.
- hunt_for tells the team what competitor content to go find. Each entry cites
  which winners justify it, and gives concrete visual signals someone can
  actually check while scrolling.
- avoid must be grounded in what actually underperformed here. Note carefully:
  the losing creatives were NOT watched — only their brief fields are available,
  so you know their claimed angle, persona and format but not what was on
  screen. Reason only from those fields when citing a loser, and say when a
  conclusion is limited by that. Do not import generic advertising advice, and
  do not describe a losing creative's footage as if you had seen it.
- If the sample is too small to support a conclusion, say that plainly in the
  relevant field instead of asserting a pattern. A thin sample honestly labelled
  is far more useful than a confident pattern that is really noise.`

interface Row {
  product_key: string; product_name: string; task_name: string; category: string
  filename: string; format_description: string; hook_mechanism: string
  core_concept: string; creative_hypothesis: string; hook_text: string | null
  script_arc: { beat: string; detail: string }[]
  repurposed_signals: string | null; source_handle: string | null
  observed_structure: string | null; observed_style: string | null
}


async function main() {
  const anthropic = new Anthropic()

  // Losing creatives are never downloaded — only winners have their files read.
  // Their brief fields still provide contrast, so they are passed in clearly
  // marked as claimed-only.
  const loserRows = (await db.execute(sql`
    select t.list_id, t.product_name, t.name as task_name,
           t.claimed_angle, t.claimed_persona, t.claimed_creative_structure,
           t.claimed_production_style, t.claimed_hook_type, t.notes
    from tasks t
    where t.category = 'loser' and t.duplicate_of_task_id is null
    order by t.product_name, t.name
  `)) as unknown as Record<string, string | null>[]

  const rows = (await db.execute(sql`
    select t.list_id, t.product_name, t.name as task_name, t.category::text as category,
           c.filename, r.format_description, r.hook_mechanism, r.core_concept,
           r.creative_hypothesis, r.script_arc, r.repurposed_signals, r.source_handle,
           o.hook_text, o.observed_creative_structure as observed_structure,
           o.observed_production_style as observed_style
    from research r
    join creatives c on c.id = r.creative_id
    join tasks t on t.id = c.task_id
    left join observations o on o.creative_id = c.id
    order by t.product_name, t.category, c.filename
  `)) as unknown as (Row & { list_id: string })[]

  const byProduct = new Map<string, (Row & { list_id: string })[]>()
  for (const r of rows) {
    const key = LIST_TO_KEY[r.list_id] ?? 'ot'
    byProduct.set(key, [...(byProduct.get(key) ?? []), r])
  }

  let totalIn = 0, totalOut = 0

  for (const [key, items] of byProduct) {
    const winners = items.filter((i) => i.category === 'winner' || i.category === 'scale')
    const mild = items.filter((i) => i.category === 'mild_winner')
    const name = items[0].product_name
    const losers = loserRows.filter((l) => l.list_id === items[0].list_id)

    console.log(`\n${name}: ${winners.length} winner · ${mild.length} mild creatives watched · ${losers.length} losers from brief only`)
    if (winners.length + mild.length === 0) {
      console.log('  skipped — nothing has won yet')
      continue
    }

    const describe = (label: string, list: typeof items) =>
      list.length === 0 ? `\n## ${label}\n(none)\n` : `\n## ${label} (${list.length})\n` +
        list.map((i) => [
          `### ${i.task_name} — ${i.filename}`,
          `Format: ${i.format_description}`,
          `Hook mechanism: ${i.hook_mechanism}`,
          i.hook_text ? `Hook on screen: "${i.hook_text}"` : '',
          `Core concept: ${i.core_concept}`,
          `Hypothesis: ${i.creative_hypothesis}`,
          i.script_arc?.length ? `Arc: ${i.script_arc.map((b) => b.beat).join(' → ')}` : '',
          i.repurposed_signals ? `Repurposing: ${i.repurposed_signals}` : '',
          i.source_handle ? `Handle: ${i.source_handle}` : '',
        ].filter(Boolean).join('\n')).join('\n\n')

    const brief = [
      `Product: ${name}`,
      describe('WINNERS', winners),
      describe('MILD WINNERS', mild),
      losers.length
        ? `\n## LOSERS (${losers.length}) — brief fields only, these videos were NOT watched\n` +
          losers.map((l) => [
            `### ${l.task_name}`,
            l.claimed_angle ? `Claimed angle: ${l.claimed_angle}` : '',
            l.claimed_persona ? `Claimed persona: ${l.claimed_persona}` : '',
            l.claimed_creative_structure ? `Claimed structure: ${l.claimed_creative_structure}` : '',
            l.claimed_production_style ? `Claimed production style: ${l.claimed_production_style}` : '',
            l.claimed_hook_type ? `Claimed hook type: ${l.claimed_hook_type}` : '',
            l.notes ? `Note: ${l.notes}` : '',
          ].filter(Boolean).join('\n')).join('\n\n')
        : '\n## LOSERS\n(none recorded for this product)\n',
    ].join('\n')

    const res = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { format: zodOutputFormat(SynthesisSchema), effort: 'high' },
      messages: [{ role: 'user', content: brief }],
    })
    totalIn += res.usage.input_tokens
    totalOut += res.usage.output_tokens
    if (!res.parsed_output) { console.log('  ✗ no parsable synthesis'); continue }
    const s = res.parsed_output

    // Attach the real record to each hook formula so the ranking is auditable.
    const formulas = s.hook_formulas.map((f) => {
      const matching = items.filter((i) =>
        i.hook_mechanism.toLowerCase().includes(f.hook_type.toLowerCase().split(/[\s/]/)[0]))
      return {
        rank: f.rank, hookType: f.hook_type, example: f.example, whyItWorks: f.why_it_works,
        wins: matching.filter((m) => m.category !== 'loser').length,
        losses: matching.filter((m) => m.category === 'loser').length,
      }
    })

    await db.insert(synthesis).values({
      productKey: key, productName: name,
      hookFormulas: formulas,
      winnerVsMild: s.winner_vs_mild,
      huntFor: s.hunt_for.map((h) => ({
        priority: h.priority, title: h.title, evidence: h.evidence,
        lookFor: h.look_for, signals: h.signals,
      })),
      avoid: s.avoid,
      topPattern: s.top_pattern,
      winnersAnalysed: winners.length + mild.length,
      losersAnalysed: losers.length,
      model: MODEL,
    }).onConflictDoUpdate({
      target: synthesis.productKey,
      set: {
        hookFormulas: formulas,
        winnerVsMild: s.winner_vs_mild,
        huntFor: s.hunt_for.map((h) => ({
          priority: h.priority, title: h.title, evidence: h.evidence,
          lookFor: h.look_for, signals: h.signals,
        })),
        avoid: s.avoid,
        topPattern: s.top_pattern,
        winnersAnalysed: winners.length + mild.length,
        losersAnalysed: losers.length,
        generatedAt: new Date(),
      },
    })

    console.log(`  ✓ ${formulas.length} hook formulas · ${s.hunt_for.length} to hunt · ${s.avoid.length} to avoid`)
    console.log(`    top pattern: ${s.top_pattern.slice(0, 110)}`)
  }

  const cost = totalIn * COST_IN + totalOut * COST_OUT
  console.log(`\n  $${cost.toFixed(2)}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

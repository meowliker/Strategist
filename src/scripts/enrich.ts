/**
 * Adds the strategic read to creatives that already have a taxonomy pass.
 *
 * Reuses the transcript already stored in Postgres, so Whisper never runs
 * twice — only the frames are re-extracted, which is cheap.
 */
import Anthropic from '@anthropic-ai/sdk'
import { sql, eq } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { db } from '../db/client'
import { research } from '../db/schema'
import { driveClient, downloadFile } from '../lib/drive/client'
import { probe, detectCuts } from '../lib/media/probe'
import { extractFrames } from '../lib/media/frames'
import { analyseDeep, DEEP_MODEL, DEEP_PROMPT_VERSION } from '../lib/analysis/deep'

const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')
const productArg = process.argv.find((a) => a.startsWith('--product='))?.split('=')[1]
const COST_IN = 5 / 1_000_000
const COST_OUT = 25 / 1_000_000

interface Pending {
  creative_id: string; source_file_id: string; filename: string
  duration_sec: number | null; aspect_ratio: string | null; cut_count: number | null
  transcript: string | null; task_name: string; product: string
}

async function main() {
  const drive = driveClient()
  const anthropic = new Anthropic()

  let pending = (await db.execute(sql`
    select c.id as creative_id, c.source_file_id, c.filename, c.duration_sec,
           c.aspect_ratio, c.cut_count, tr.text as transcript,
           t.name as task_name, t.product_name as product
    from creatives c
    join tasks t on t.id = c.task_id
    left join transcripts tr on tr.creative_id = c.id
    left join research r on r.creative_id = c.id
    where r.creative_id is null
    order by t.product_name, c.filename
  `)) as unknown as Pending[]

  if (productArg) {
    pending = pending.filter((p) => p.product.toLowerCase().includes(productArg.toLowerCase()))
    console.log(`Scoped to ${productArg}`)
  }
  if (limit) pending = pending.slice(0, limit)
  console.log(`Enriching ${pending.length} creatives\n`)

  let done = 0, failed = 0, totalIn = 0, totalOut = 0

  for (const p of pending) {
    const work = await mkdtemp(path.join(tmpdir(), 'enrich-'))
    try {
      const local = await downloadFile(drive, p.source_file_id, path.join(work, p.filename))
      const meta = await probe(local)
      const cuts = p.cut_count ?? (meta.isVideo ? await detectCuts(local) : 0)
      const frames = await extractFrames(local, path.join(work, 'frames'), {
        durationSec: meta.durationSec ?? p.duration_sec ?? 0,
      })

      const { research: r, usage } = await analyseDeep(anthropic, {
        frames,
        transcriptText: p.transcript,
        durationSec: p.duration_sec ?? meta.durationSec,
        aspectRatio: p.aspect_ratio ?? meta.aspectRatio,
        cuts,
        filename: p.filename,
      })
      totalIn += usage.input_tokens
      totalOut += usage.output_tokens

      await db.insert(research).values({
        creativeId: p.creative_id,
        formatDescription: r.format_description,
        hookMechanism: r.hook_mechanism,
        coreConcept: r.core_concept,
        creativeHypothesis: r.creative_hypothesis,
        scriptArc: r.script_arc.map((b) => ({ beat: b.beat, detail: b.detail })),
        scenes: r.scenes.map((s) => ({ n: s.n, visual: s.visual, onScreenText: s.on_screen_text })),
        tactileElements: r.tactile_elements,
        repurposedSignals: r.repurposed_signals || null,
        sourceHandle: r.source_handle || null,
        model: DEEP_MODEL,
        promptVersion: DEEP_PROMPT_VERSION,
      }).onConflictDoNothing()

      done++
      console.log(`  ✓ ${p.filename.padEnd(24).slice(0, 24)} ${r.hook_mechanism.padEnd(26).slice(0, 26)} ${r.format_description.slice(0, 42)}`)
    } catch (e) {
      failed++
      console.log(`  ✗ ${p.filename} — ${(e as Error).message.slice(0, 90)}`)
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  const cost = totalIn * COST_IN + totalOut * COST_OUT
  console.log(`\n  ${done} enriched, ${failed} failed — $${cost.toFixed(2)}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

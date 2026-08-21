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

/**
 * How many creatives to process at once.
 *
 * Each slot runs a Drive download, an ffmpeg frame pass and one model call.
 * Four keeps the CPU busy without starving the machine, and stays well inside
 * Supabase's 15-connection ceiling — one process with a small pool, rather than
 * one process per product each holding its own.
 */
const CONCURRENCY = Math.max(
  1,
  Number(process.argv.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '4'),
)
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
  // Round-robin across products so every product makes visible progress from
  // the start, rather than the alphabetically-first one finishing alone.
  const groups = new Map<string, Pending[]>()
  for (const p of pending) groups.set(p.product, [...(groups.get(p.product) ?? []), p])
  const interleaved: Pending[] = []
  for (let i = 0; interleaved.length < pending.length; i++) {
    for (const list of groups.values()) if (list[i]) interleaved.push(list[i])
  }
  pending = interleaved

  if (limit) pending = pending.slice(0, limit)
  const byProduct = pending.reduce<Record<string, number>>((acc, p) => {
    acc[p.product] = (acc[p.product] ?? 0) + 1
    return acc
  }, {})
  console.log(`Enriching ${pending.length} creatives, ${CONCURRENCY} at a time`)
  for (const [name, n] of Object.entries(byProduct)) {
    console.log(`  ${name.padEnd(26)} ${n}`)
  }
  console.log()

  let done = 0, failed = 0, totalIn = 0, totalOut = 0

  /** Processes one creative end to end. Safe to run alongside others. */
  const processOne = async (p: Pending) => {
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
        offer: r.offer || null,
        offerMechanism: r.offer_mechanism || null,
        scriptArc: r.script_arc.map((b) => ({ beat: b.beat, detail: b.detail })),
        scenes: r.scenes.map((s) => ({ n: s.n, visual: s.visual, onScreenText: s.on_screen_text })),
        tactileElements: r.tactile_elements,
        repurposedSignals: r.repurposed_signals || null,
        sourceHandle: r.source_handle || null,
        model: DEEP_MODEL,
        promptVersion: DEEP_PROMPT_VERSION,
      }).onConflictDoNothing()

      done++
      console.log(`  ✓ [${done + failed}/${pending.length}] ${p.product.slice(0, 14).padEnd(14)} ${p.filename.padEnd(24).slice(0, 24)} ${r.hook_mechanism.slice(0, 38)}`)
    } catch (e) {
      failed++
      console.log(`  ✗ [${done + failed}/${pending.length}] ${p.filename} — ${(e as Error).message.slice(0, 160)}`)
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }

  // Bounded worker pool: each worker takes the next item off a shared cursor,
  // so a slow creative never blocks the rest and every product advances
  // together rather than one finishing before the next begins.
  const startedAt = Date.now()
  let cursor = 0
  const worker = async () => {
    for (;;) {
      const i = cursor++
      if (i >= pending.length) return
      await processOne(pending[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker))

  const mins = (Date.now() - startedAt) / 60000
  console.log(`\n  ${mins.toFixed(1)} min · ${(done / Math.max(mins, 0.01)).toFixed(1)} creatives/min`)

  const cost = totalIn * COST_IN + totalOut * COST_OUT
  console.log(`\n  ${done} enriched, ${failed} failed — $${cost.toFixed(2)}`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

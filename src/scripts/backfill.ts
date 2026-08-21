/**
 * Winner backfill: download → measure → transcribe → classify blind → compare.
 *
 * Only winners have their video files read, per the agreed scope. Losers are
 * analysed from ClickUp data alone and are never downloaded.
 */
import Anthropic from '@anthropic-ai/sdk'
import { and, inArray, isNull, isNotNull, eq } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { db } from '../db/client'
import { tasks, creatives, transcripts as transcriptsTable, observations, verdicts, keywords } from '../db/schema'
import { driveClient, folderIdFromUrl, listMedia, downloadFile, variantIndex } from '../lib/drive/client'
import { probe, detectCuts, cutsPerMinute } from '../lib/media/probe'
import { extractFrames } from '../lib/media/frames'
import { extractAudio, transcribe } from '../lib/media/transcribe'
import { analyseBlind, MODEL, PROMPT_VERSION } from '../lib/analysis/blind'
import { compareAll, countMismatches, FIELD_SPECS } from '../lib/analysis/verdict'
import { PRODUCTS } from '../lib/products'
import { winningVariant } from '../lib/parse/winningVariant'

const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')
const only = process.argv.find((a) => a.startsWith('--task='))?.split('=')[1]
const productArg = process.argv.find((a) => a.startsWith('--product='))?.split('=')[1]
const skipTranscribe = process.argv.includes('--no-transcribe')

// Opus 5 pricing, $ per token.
const COST_IN = 5 / 1_000_000
const COST_OUT = 25 / 1_000_000

async function main() {
  const drive = driveClient()
  const anthropic = new Anthropic()

  let winners = await db
    .select({
      id: tasks.id, name: tasks.name, product: tasks.productName, link: tasks.driveLink,
      cAngle: tasks.claimedAngle, cPersona: tasks.claimedPersona, cFunnel: tasks.claimedFunnel,
      cAdType: tasks.claimedAdType, cHook: tasks.claimedHookType,
      cStructure: tasks.claimedCreativeStructure, cStyle: tasks.claimedProductionStyle,
      description: tasks.rawDescription,
    })
    .from(tasks)
    .where(and(
      inArray(tasks.category, ['winner', 'mild_winner', 'scale']),
      isNull(tasks.duplicateOfTaskId),
      isNotNull(tasks.driveLink),
    ))

  if (productArg) {
    const want = PRODUCTS.find((p) => p.listId === productArg || p.name.toLowerCase().includes(productArg.toLowerCase()))
    if (!want) {
      console.error(`Unknown product "${productArg}". Known: ${PRODUCTS.map((p) => p.name).join(', ')}`)
      process.exit(1)
    }
    winners = winners.filter((w) => w.product === want.name)
    console.log(`Scoped to ${want.name}\n`)
  }
  // Deterministic order so a resumed run is predictable, newest first.
  winners.sort((a, b) => b.name.localeCompare(a.name))
  if (only) winners = winners.filter((w) => w.name === only || w.id === only)
  if (limit) winners = winners.slice(0, limit)

  // House vocabulary per product. This is the team's existing label set across
  // the product — never the label on the creative being analysed — so derived
  // labels stay comparable with hand-tagged ones.
  const vocabRows = await db
    .select({ product: tasks.productName, angle: tasks.claimedAngle, persona: tasks.claimedPersona })
    .from(tasks)
    .where(isNull(tasks.duplicateOfTaskId))

  const vocabulary = new Map<string, { angles: string[]; personas: string[] }>()
  for (const row of vocabRows) {
    const v = vocabulary.get(row.product) ?? { angles: [], personas: [] }
    if (row.angle && !v.angles.includes(row.angle)) v.angles.push(row.angle)
    if (row.persona && !v.personas.includes(row.persona)) v.personas.push(row.persona)
    vocabulary.set(row.product, v)
  }

  console.log(`Backfilling ${winners.length} winners`)
  for (const [product, v] of vocabulary) {
    if (winners.some((w) => w.product === product)) {
      console.log(`  vocabulary · ${product}: ${v.angles.length} angles, ${v.personas.length} personas`)
    }
  }
  console.log()

  let done = 0, failed = 0, skipped = 0, totalIn = 0, totalOut = 0, totalMismatch = 0

  for (const w of winners) {
    const folderId = folderIdFromUrl(w.link)
    if (!folderId) { console.log(`  ✗ ${w.name} — unparseable Drive link`); failed++; continue }

    let files
    try { files = await listMedia(drive, folderId) }
    catch (e) { console.log(`  ✗ ${w.name} — ${(e as Error).message.slice(0, 50)}`); failed++; continue }

    let media = files.filter((f) => f.mimeType.startsWith('video/') || f.mimeType.startsWith('image/'))
    if (!media.length) { console.log(`  · ${w.name} — no media in folder`); continue }

    // When the team has noted which single variation won, read only that file.
    // Analysing all three would attribute the losing hooks to a winning task.
    const onlyVariant = winningVariant(w.description)
    let scopeNote = ''
    if (onlyVariant !== null) {
      const picked = media.filter((f) => variantIndex(f.name) === onlyVariant)
      if (picked.length) {
        skipped += media.length - picked.length
        scopeNote = `  → V${onlyVariant} only (${media.length - picked.length} skipped)`
        media = picked
      } else {
        // The note names a variant with no matching file; read everything
        // rather than silently analyse nothing.
        scopeNote = `  → V${onlyVariant} noted but no matching file, reading all`
      }
    }

    console.log(`  ${w.name}  (${media.length} files)${scopeNote}`)

    for (const file of media) {
      const creativeId = `${w.id}_${file.id}`
      const work = await mkdtemp(path.join(tmpdir(), 'strategist-'))
      try {
        const local = await downloadFile(drive, file.id, path.join(work, file.name))
        const meta = await probe(local)
        const cuts = meta.isVideo ? await detectCuts(local) : 0
        const frames = await extractFrames(local, path.join(work, 'frames'), {
          durationSec: meta.durationSec ?? 0,
        })

        let transcript = null
        if (meta.isVideo && meta.hasAudio && !skipTranscribe) {
          const wav = path.join(work, 'audio.wav')
          await extractAudio(local, wav)
          transcript = await transcribe(wav, path.join(work, 'whisper'))
        }

        const { observation, usage } = await analyseBlind(anthropic, {
          frames, transcript, meta, cuts, filename: file.name,
          vocabulary: vocabulary.get(w.product),
        })
        totalIn += usage.input_tokens
        totalOut += usage.output_tokens

        // ── persist the creative and everything derived from it ──
        await db.insert(creatives).values({
          id: creativeId, taskId: w.id, source: 'drive', sourceFileId: file.id,
          filename: file.name, mimeType: file.mimeType, sizeBytes: file.size,
          variantIndex: variantIndex(file.name), isVideo: meta.isVideo,
          durationSec: meta.durationSec, width: meta.width, height: meta.height,
          aspectRatio: meta.aspectRatio, cutCount: cuts,
          cutsPerMinute: cutsPerMinute(cuts, meta.durationSec),
          hasVoiceover: Boolean(transcript?.text), hasMusic: meta.hasAudio && !transcript?.text,
          analysedAt: new Date(),
        }).onConflictDoNothing()

        if (transcript) {
          await db.insert(transcriptsTable).values({
            creativeId, text: transcript.text, language: transcript.language,
            segments: transcript.segments, hookSpoken: transcript.hookSpoken,
          }).onConflictDoNothing()
        }

        await db.insert(observations).values({
          creativeId,
          observedAdType: observation.ad_type,
          observedCreativeStructure: observation.creative_structure,
          observedProductionStyle: observation.production_style,
          observedHookType: observation.hook_type,
          observedFunnel: observation.funnel,
          observedAngleSignal: observation.angle,
          observedPersonaSignal: observation.persona,
          hookText: observation.hook_text, ctaText: observation.cta_text,
          painPoints: observation.pain_points,
          confidence: {
            ad_type: observation.ad_type_confidence,
            production_style: observation.production_style_confidence,
            creative_structure: observation.creative_structure_confidence,
            hook_type: observation.hook_type_confidence,
            funnel: observation.funnel_confidence,
            angle: observation.angle_confidence,
            persona: observation.persona_confidence,
          },
          evidence: {
            production_style: observation.production_style_evidence,
            creative_structure: observation.creative_structure_evidence,
            hook_type: observation.hook_type_evidence,
            angle: observation.angle_rationale,
            persona: observation.persona_rationale,
          },
          model: MODEL, promptVersion: PROMPT_VERSION,
        }).onConflictDoNothing()

        const compared = compareAll(
          {
            ad_type: w.cAdType, production_style: w.cStyle, creative_structure: w.cStructure,
            hook_type: w.cHook, funnel: w.cFunnel, angle: w.cAngle, persona: w.cPersona,
          },
          {
            ad_type: observation.ad_type, production_style: observation.production_style,
            creative_structure: observation.creative_structure, hook_type: observation.hook_type,
            funnel: observation.funnel, angle: observation.angle,
            persona: observation.persona,
          },
          {
            ad_type: observation.ad_type_confidence,
            production_style: observation.production_style_confidence,
            creative_structure: observation.creative_structure_confidence,
            hook_type: observation.hook_type_confidence,
            funnel: observation.funnel_confidence,
            angle: observation.angle_confidence,
            persona: observation.persona_confidence,
          },
          {
            production_style: observation.production_style_evidence,
            creative_structure: observation.creative_structure_evidence,
            hook_type: observation.hook_type_evidence,
            angle: observation.angle_rationale,
            persona: observation.persona_rationale,
          },
        )

        for (const c of compared) {
          await db.insert(verdicts).values({
            id: `${creativeId}_${c.field}`, creativeId, field: c.field,
            verifiability: c.verifiability, claimedValue: c.claimed, observedValue: c.observed,
            verdict: c.verdict, confidence: c.confidence, evidence: c.evidence,
            resolvedValue: c.resolved,
          }).onConflictDoNothing()
        }

        if (observation.search_keywords.length) {
          await db.insert(keywords).values(
            observation.search_keywords.map((k, i) => ({
              id: `${creativeId}_k${i}`, creativeId, term: k.term, kind: k.kind,
              searchable: true, weight: 1,
            })),
          ).onConflictDoNothing()
        }

        const mism = countMismatches(compared)
        totalMismatch += mism
        done++
        console.log(
          `    ✓ ${file.name.padEnd(26).slice(0, 26)} ${observation.angle.padEnd(28).slice(0, 28)}` +
          `${observation.persona.padEnd(26).slice(0, 26)} ${mism ? `${mism} mismatch` : 'agrees'}`,
        )
      } catch (e) {
        failed++
        console.log(`    ✗ ${file.name} — ${(e as Error).message.slice(0, 400)}`)
      } finally {
        await rm(work, { recursive: true, force: true })
      }
    }
  }

  const cost = totalIn * COST_IN + totalOut * COST_OUT
  console.log(`\n  ${done} creatives analysed, ${failed} failed, ${skipped} skipped by winner note`)
  console.log(`  ${totalMismatch} field mismatches against ClickUp`)
  console.log(`  tokens: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out — $${cost.toFixed(2)}`)
  if (done) console.log(`  ≈ $${(cost / done).toFixed(3)} per creative`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

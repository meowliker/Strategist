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

const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0')
const only = process.argv.find((a) => a.startsWith('--task='))?.split('=')[1]
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
    })
    .from(tasks)
    .where(and(
      inArray(tasks.category, ['winner', 'mild_winner', 'scale']),
      isNull(tasks.duplicateOfTaskId),
      isNotNull(tasks.driveLink),
    ))

  if (only) winners = winners.filter((w) => w.name === only || w.id === only)
  if (limit) winners = winners.slice(0, limit)

  console.log(`Backfilling ${winners.length} winners\n`)

  let done = 0, failed = 0, totalIn = 0, totalOut = 0, totalMismatch = 0

  for (const w of winners) {
    const folderId = folderIdFromUrl(w.link)
    if (!folderId) { console.log(`  ✗ ${w.name} — unparseable Drive link`); failed++; continue }

    let files
    try { files = await listMedia(drive, folderId) }
    catch (e) { console.log(`  ✗ ${w.name} — ${(e as Error).message.slice(0, 50)}`); failed++; continue }

    const media = files.filter((f) => f.mimeType.startsWith('video/') || f.mimeType.startsWith('image/'))
    if (!media.length) { console.log(`  · ${w.name} — no media in folder`); continue }

    console.log(`  ${w.name}  (${media.length} files)`)

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
          observedAngleSignal: observation.angle_signal,
          observedPersonaSignal: observation.persona_signal,
          hookText: observation.hook_text, ctaText: observation.cta_text,
          painPoints: observation.pain_points,
          confidence: {
            ad_type: observation.ad_type_confidence,
            production_style: observation.production_style_confidence,
            creative_structure: observation.creative_structure_confidence,
            hook_type: observation.hook_type_confidence,
            funnel: observation.funnel_confidence,
          },
          evidence: {
            production_style: observation.production_style_evidence,
            creative_structure: observation.creative_structure_evidence,
            hook_type: observation.hook_type_evidence,
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
            funnel: observation.funnel, angle: observation.angle_signal,
            persona: observation.persona_signal,
          },
          {
            ad_type: observation.ad_type_confidence,
            production_style: observation.production_style_confidence,
            creative_structure: observation.creative_structure_confidence,
            hook_type: observation.hook_type_confidence,
            funnel: observation.funnel_confidence,
          },
          {
            production_style: observation.production_style_evidence,
            creative_structure: observation.creative_structure_evidence,
            hook_type: observation.hook_type_evidence,
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
          `    ✓ ${file.name.padEnd(30).slice(0, 30)} ${observation.production_style.padEnd(20).slice(0, 20)}` +
          ` ${mism ? `${mism} mismatch` : 'agrees'}` +
          (observation.hook_text ? `  "${observation.hook_text.slice(0, 42)}"` : ''),
        )
      } catch (e) {
        failed++
        console.log(`    ✗ ${file.name} — ${(e as Error).message.slice(0, 70)}`)
      } finally {
        await rm(work, { recursive: true, force: true })
      }
    }
  }

  const cost = totalIn * COST_IN + totalOut * COST_OUT
  console.log(`\n  ${done} creatives analysed, ${failed} failed`)
  console.log(`  ${totalMismatch} field mismatches against ClickUp`)
  console.log(`  tokens: ${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out — $${cost.toFixed(2)}`)
  if (done) console.log(`  ≈ $${(cost / done).toFixed(3)} per creative`)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })

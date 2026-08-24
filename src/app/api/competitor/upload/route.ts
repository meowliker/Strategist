import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '../../../../db/client'
import { competitorAds } from '../../../../db/schema'
import { probe, detectCuts } from '../../../../lib/media/probe'
import { extractFrames } from '../../../../lib/media/frames'
import { extractAudio, transcribe } from '../../../../lib/media/transcribe'
import { analyseBlind } from '../../../../lib/analysis/blind'
import { rm } from 'node:fs/promises'

export const dynamic = 'force-dynamic'
// Allow large video uploads (up to 500MB)
export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = form.get('file') as File | null
  const competitor = (form.get('competitor') as string | null)?.trim() || null
  const platform = (form.get('platform') as string | null)?.trim() || null
  const notes = (form.get('notes') as string | null)?.trim() || null

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const id = randomUUID()
  const ext = file.name.split('.').pop() ?? 'mp4'
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Save upload to persistent competitor dir
  const competitorDir = join(process.cwd(), 'data', 'competitor')
  await mkdir(competitorDir, { recursive: true })
  const filePath = join(competitorDir, `${id}.${ext}`)
  const bytes = await file.arrayBuffer()
  await writeFile(filePath, Buffer.from(bytes))

  // Run analysis in a temp work dir
  const work = await mkdtemp(join(tmpdir(), 'strategist-comp-'))
  try {
    const meta = await probe(filePath)
    const cuts = meta.isVideo ? await detectCuts(filePath) : 0
    const frames = await extractFrames(filePath, join(work, 'frames'), {
      durationSec: meta.durationSec ?? 0,
    })

    let transcript = null
    if (meta.isVideo && meta.hasAudio) {
      const wav = join(work, 'audio.wav')
      await extractAudio(filePath, wav)
      transcript = await transcribe(wav, join(work, 'whisper'))
    }

    const { observation } = await analyseBlind(client, {
      frames, transcript, meta, cuts, filename: safeFilename,
    })

    await db.insert(competitorAds).values({
      id,
      filename: safeFilename,
      competitor,
      platform,
      notes,
      filePath,
      analysedAt: new Date(),
      hookText: observation.hook_text || null,
      hookSpoken: transcript?.hookSpoken ?? null,
      angle: observation.angle || null,
      persona: observation.persona || null,
      hookType: observation.hook_type || null,
      productionStyle: observation.production_style || null,
      creativeStructure: observation.creative_structure || null,
      painPoints: observation.pain_points.length ? observation.pain_points : null,
      ctaText: observation.cta_text || null,
      durationSec: meta.durationSec,
      transcript: transcript?.text ?? null,
    })

    return NextResponse.json({ id, observation, durationSec: meta.durationSec })
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

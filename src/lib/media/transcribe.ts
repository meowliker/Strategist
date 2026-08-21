import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)

export interface Segment { start: number; end: number; text: string }
export interface Transcript {
  text: string
  language: string | null
  segments: Segment[]
  /** Words spoken in the first three seconds — the audio half of the hook. */
  hookSpoken: string | null
}

/** Strips the audio to 16 kHz mono, which is what Whisper wants anyway. */
export async function extractAudio(video: string, outWav: string): Promise<void> {
  await mkdir(path.dirname(outWav), { recursive: true })
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outWav,
  ], { maxBuffer: 16 * 1024 * 1024 })
}

/**
 * Transcribes with the local Whisper CLI.
 *
 * Running locally keeps every creative on this machine and removes any
 * per-minute API cost, which matters when re-running the pipeline after a
 * prompt change.
 */
export async function transcribe(
  audioFile: string,
  workDir: string,
  model = 'small',
): Promise<Transcript> {
  await mkdir(workDir, { recursive: true })
  await run('whisper', [
    audioFile,
    '--model', model,
    '--output_format', 'json',
    '--output_dir', workDir,
    '--verbose', 'False',
  ], { maxBuffer: 32 * 1024 * 1024, timeout: 15 * 60 * 1000 })

  const base = path.basename(audioFile).replace(/\.[^.]+$/, '')
  const raw = JSON.parse(await readFile(path.join(workDir, `${base}.json`), 'utf8')) as {
    text?: string
    language?: string
    segments?: { start: number; end: number; text: string }[]
  }

  const segments: Segment[] = (raw.segments ?? []).map((s) => ({
    start: s.start, end: s.end, text: s.text.trim(),
  }))

  const hookSpoken = segments
    .filter((s) => s.start < 3)
    .map((s) => s.text)
    .join(' ')
    .trim()

  return {
    text: (raw.text ?? '').trim(),
    language: raw.language ?? null,
    segments,
    hookSpoken: hookSpoken || null,
  }
}

export const cleanup = (dir: string) => rm(dir, { recursive: true, force: true })

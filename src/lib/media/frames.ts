import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)

export interface Frame { tSec: number; file: string; isHookFrame: boolean }

/**
 * Samples frames for visual reading.
 *
 * The first three seconds are sampled densely because that is where the hook
 * lives — on-screen hook text often appears for under a second, and a uniform
 * sample would miss it entirely. The remainder is sampled sparsely, which is
 * enough to judge production style and structure.
 */
export async function extractFrames(
  file: string,
  outDir: string,
  opts: { durationSec: number; hookFps?: number; bodyEverySec?: number } = { durationSec: 0 },
): Promise<Frame[]> {
  const { durationSec, hookFps = 3, bodyEverySec = 3 } = opts
  await mkdir(outDir, { recursive: true })

  const hookEnd = Math.min(3, durationSec || 3)
  const frames: Frame[] = []

  // Dense hook window
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', file, '-t', String(hookEnd),
    '-vf', `fps=${hookFps},scale=640:-2`,
    path.join(outDir, 'hook-%03d.jpg'),
  ], { maxBuffer: 16 * 1024 * 1024 })

  // Sparse body
  if (durationSec > hookEnd) {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(hookEnd), '-i', file,
      '-vf', `fps=1/${bodyEverySec},scale=640:-2`,
      path.join(outDir, 'body-%03d.jpg'),
    ], { maxBuffer: 16 * 1024 * 1024 })
  }

  for (const name of (await readdir(outDir)).sort()) {
    if (!name.endsWith('.jpg')) continue
    const idx = Number(name.match(/(\d+)\.jpg$/)?.[1] ?? '0')
    const isHook = name.startsWith('hook-')
    frames.push({
      tSec: isHook ? (idx - 1) / hookFps : hookEnd + (idx - 1) * bodyEverySec,
      file: path.join(outDir, name),
      isHookFrame: isHook,
    })
  }

  return frames.sort((a, b) => a.tSec - b.tSec)
}

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface MediaMeta {
  durationSec: number | null
  width: number | null
  height: number | null
  aspectRatio: string | null
  hasAudio: boolean
  isVideo: boolean
}

function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b) }

/** The aspect ratios ad platforms actually accept. */
const AD_RATIOS: [string, number][] = [
  ['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9], ['2:3', 2 / 3], ['3:4', 3 / 4],
]

/**
 * Snaps to a standard ad ratio when close enough.
 *
 * Exported creatives are routinely a pixel or two off — 608x1080 is a 9:16 ad,
 * but exact reduction calls it 76:135. Grouping by the raw fraction would
 * scatter one format across dozens of near-identical buckets.
 */
function ratio(w: number | null, h: number | null): string | null {
  if (!w || !h) return null
  const actual = w / h
  for (const [label, value] of AD_RATIOS) {
    if (Math.abs(actual - value) / value < 0.02) return label
  }
  const d = gcd(w, h)
  return `${w / d}:${h / d}`
}

export async function probe(file: string): Promise<MediaMeta> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file,
  ], { maxBuffer: 8 * 1024 * 1024 })

  const data = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: { codec_type?: string; width?: number; height?: number }[]
  }

  const video = data.streams?.find((s) => s.codec_type === 'video') ?? null
  const hasAudio = (data.streams ?? []).some((s) => s.codec_type === 'audio')
  const duration = data.format?.duration ? Number(data.format.duration) : null

  // A still image also decodes as a single video stream, so duration is what
  // actually separates a photo ad from a video ad.
  const isVideo = Boolean(video) && duration !== null && duration > 0.5

  return {
    durationSec: duration,
    width: video?.width ?? null,
    height: video?.height ?? null,
    aspectRatio: ratio(video?.width ?? null, video?.height ?? null),
    hasAudio,
    isVideo,
  }
}

/**
 * Counts hard cuts using ffmpeg's scene-change score.
 *
 * Pacing is one of the few format signals that is genuinely objective, and it
 * separates a fast-cut UGC edit from a slideshow far more reliably than any
 * label in ClickUp.
 */
export async function detectCuts(file: string, threshold = 0.3): Promise<number> {
  try {
    const { stderr } = await run('ffmpeg', [
      '-i', file, '-filter:v', `select='gt(scene,${threshold})',showinfo`,
      '-f', 'null', '-',
    ], { maxBuffer: 32 * 1024 * 1024 })
    return (stderr.match(/pts_time:/g) ?? []).length
  } catch {
    return 0
  }
}

export const cutsPerMinute = (cuts: number, durationSec: number | null): number | null =>
  !durationSec || durationSec <= 0 ? null : (cuts / durationSec) * 60

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import type { Frame } from '../media/frames'

/**
 * The strategic read of a creative: how it works, and what bet it is making.
 *
 * Still blind to ClickUp. What separates this from the taxonomy pass is the
 * shape of the output — prose a strategist can brief from, rather than an enum.
 */
export const ResearchSchema = z.object({
  /** e.g. "VO-driven UGC — repurposed TikTok herbalist tutorial" */
  format_description: z.string(),
  /** The mechanism the opening uses, e.g. "Timely news urgency". */
  hook_mechanism: z.string(),
  /** One sentence: what this creative actually is. */
  core_concept: z.string(),
  /** The bet the creative makes about why the viewer will act. */
  creative_hypothesis: z.string(),
  /** What the viewer is asked to take, and on what terms. Verbatim where shown. */
  offer: z.string(),
  /** How the offer is justified — free, discounted, limited, bonus-stacked. */
  offer_mechanism: z.string(),

  /** The ordered beats the argument moves through, 2–6 of them. */
  script_arc: z.array(z.object({
    beat: z.string(),
    detail: z.string(),
  })),

  /**
   * Scene-by-scene, for caption-led creatives with no voiceover. Empty when the
   * creative is carried by speech rather than stacked captions.
   */
  scenes: z.array(z.object({
    n: z.number(),
    visual: z.string(),
    on_screen_text: z.string(),
  })),

  /** What is physically happening on screen — hands, herbs, page flips. */
  tactile_elements: z.array(z.string()),
  /** Evidence this is repurposed organic content rather than produced for ads. */
  repurposed_signals: z.string(),
  /** A visible creator handle or watermark, verbatim, or an empty string. */
  source_handle: z.string(),
})

export type Research = z.infer<typeof ResearchSchema>

const SYSTEM = `You are a creative strategist taking apart an ad so a team can
rebuild what works.

You are shown only the creative: sampled frames and its transcript. You have no
brief and no performance data, and you must not guess at either. Do not say
whether it succeeded — you have no way to know, and inventing a verdict would
poison the analysis that depends on this.

What to produce:
- format_description: how it was made and where it came from, in the shape a
  strategist would say it out loud. "VO-driven UGC — repurposed TikTok tutorial"
  is useful. "Video ad" is not.
- hook_mechanism: the lever the opening pulls. Name the mechanism, not the
  topic — "timely news urgency", "POV discovery", "regret implying demand".
- offer: what the viewer is actually asked to take and on what terms, quoting
  the on-screen or spoken wording where there is any. "FREE Herbal Healing
  Guide, tap below, no price mentioned" is useful. "A guide" is not. If the
  creative never makes an offer, say so plainly.
- offer_mechanism: how the offer is justified — free, discounted, limited-time,
  bonus-stacked, anniversary, first-N-people. Say "none stated" when there is no
  justification rather than inventing one.
- core_concept: one sentence capturing what the creative IS. Someone who reads
  only this line should be able to picture the ad.
- creative_hypothesis: the bet it makes about why the viewer will act.
- script_arc: the beats the argument moves through, in order. Each beat gets a
  short name and a concrete detail drawn from the actual footage or transcript.
- scenes: only for caption-led creatives with no voiceover. Quote the on-screen
  text of each scene VERBATIM. Leave the array empty when speech carries it.
- tactile_elements: what is physically happening on screen. Hands, jars, page
  flips, brewing. This is what makes a creative feel real rather than made.
- repurposed_signals: what suggests this was organic content that happens to
  end in an offer — platform UI, native captions, watermarks, handheld framing.
  Say so plainly if it instead looks produced for advertising.
- source_handle: a visible @handle or watermark, verbatim. Empty string if none.

Quote on-screen and spoken text exactly. Never invent a line you cannot see or
hear. If the frames are too sparse to support a claim, say what is actually
visible instead of filling the gap.`

export const DEEP_PROMPT_VERSION = 2
export const DEEP_MODEL = 'claude-sonnet-4-6'

function selectFrames(frames: Frame[], max = 12): Frame[] {
  if (frames.length <= max) return frames
  const hook = frames.filter((f) => f.isHookFrame)
  const body = frames.filter((f) => !f.isHookFrame)
  const hookKeep = Math.min(hook.length, 5)
  const bodyKeep = max - hookKeep
  const pick = <T,>(arr: T[], n: number): T[] => {
    if (n <= 0 || arr.length === 0) return []
    const take = Math.min(n, arr.length)
    return Array.from({ length: take },
      (_, i) => arr[Math.round((i * (arr.length - 1)) / Math.max(1, take - 1))])
  }
  return [...pick(hook, hookKeep), ...pick(body, bodyKeep)].sort((a, b) => a.tSec - b.tSec)
}

export async function analyseDeep(
  client: Anthropic,
  input: {
    frames: Frame[]
    transcriptText: string | null
    durationSec: number | null
    aspectRatio: string | null
    cuts: number
    filename: string
  },
): Promise<{ research: Research; usage: Anthropic.Usage }> {
  const frames = selectFrames(input.frames)

  const images = await Promise.all(frames.map(async (f) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: (await readFile(f.file)).toString('base64'),
    },
  })))

  const facts = [
    `Duration ${input.durationSec?.toFixed(1) ?? '?'}s · ${input.aspectRatio ?? '?'} · ${input.cuts} hard cuts.`,
    frames.length ? `Frames at: ${frames.map((f) => `${f.tSec.toFixed(1)}s`).join(', ')}` : 'No frames available.',
    '',
    input.transcriptText
      ? `Transcript:\n${input.transcriptText}`
      : 'No speech — this creative is carried by music and on-screen captions.',
  ].join('\n')

  const response = await client.messages.parse({
    model: DEEP_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ResearchSchema), effort: 'medium' },
    messages: [{ role: 'user', content: [...images, { type: 'text', text: facts }] }],
  })

  if (!response.parsed_output) throw new Error(`No parsable research for ${input.filename}`)
  return { research: response.parsed_output, usage: response.usage }
}

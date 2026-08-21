import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import type { Frame } from '../media/frames'
import type { Transcript } from '../media/transcribe'
import type { MediaMeta } from '../media/probe'

/**
 * Vocabularies mirror the ClickUp dropdowns exactly, so AI-derived values and
 * hand-tagged values aggregate into the same buckets instead of forming a
 * parallel taxonomy nobody can compare.
 */
const PRODUCTION_STYLE = ['Organic / Raw UGC', 'Polished UGC', 'Professional Studio',
  'AI Generated', 'Screen Record', 'Animation / Motion', 'Static Graphic', 'Slideshow',
  'Repurposed Organic', 'Competitor Inspired'] as const

const CREATIVE_STRUCTURE = ['UGC', 'Testimonial', 'Demo', 'Tutorial / How-To',
  'Story / Narrative', 'Hook + Offer', 'Listicle', 'Static / Photo', 'Comparison',
  'Interview', 'Skit / Roleplay', 'AI / Voiceover'] as const

const HOOK_TYPE = ['Pain / Problem', 'Fear', 'Curiosity', 'Social Proof', 'Aspirational',
  'Direct Offer', 'Controversy / Bold Claim', 'POV', 'Question', 'News / Trend',
  'Pattern Interrupt'] as const

const conf = z.number().min(0).max(1)

export const ObservationSchema = z.object({
  ad_type: z.enum(['Photo', 'Video']),
  ad_type_confidence: conf,
  production_style: z.enum(PRODUCTION_STYLE),
  production_style_confidence: conf,
  production_style_evidence: z.string(),
  creative_structure: z.enum(CREATIVE_STRUCTURE),
  creative_structure_confidence: conf,
  creative_structure_evidence: z.string(),
  hook_type: z.enum(HOOK_TYPE),
  hook_type_confidence: conf,
  hook_type_evidence: z.string(),
  funnel: z.enum(['TOF', 'MOF', 'BOF']),
  funnel_confidence: conf,

  /** Interpretive — a signal read off the creative, never a claim about intent. */
  angle_signal: z.string(),
  persona_signal: z.string(),

  /** Verbatim on-screen text in the opening seconds. The most reusable artefact. */
  hook_text: z.string(),
  cta_text: z.string(),
  pain_points: z.array(z.string()),

  /**
   * Short phrases someone could paste into Instagram, Meta Ad Library or TikTok
   * search to surface comparable competitor creatives.
   */
  search_keywords: z.array(z.object({
    term: z.string(),
    kind: z.enum(['hook_phrase', 'pain_point', 'format', 'entity']),
  })),
})

export type Observation = z.infer<typeof ObservationSchema>

const SYSTEM = `You classify advertising creatives by watching them.

You are given ONLY the creative itself: sampled frames, its transcript, and
measured properties. You have no access to any brief, label, or metadata that a
human wrote about it, and you must not speculate about what such a label might
say. Judge only what is actually visible and audible.

Rules:
- hook_text must be the on-screen text in the opening seconds, transcribed
  VERBATIM. If there is no on-screen text, return an empty string. Never
  paraphrase and never invent text you cannot see.
- cta_text likewise: the literal call-to-action shown or spoken, else empty.
- Confidence is your genuine certainty. Use a value below 0.6 when the frames
  are ambiguous. Overconfident guesses are worse than admitting uncertainty,
  because a confident wrong answer will overwrite a human's correct label.
- angle_signal and persona_signal describe what the creative SIGNALS about who
  it targets and what it argues. Phrase them as observations, not conclusions.
- search_keywords should be short, concrete phrases that would actually work
  typed into a search box. Avoid generic marketing words like "engaging" or
  "high converting".`

/** Frames sent to the model, capped to keep per-creative cost predictable. */
function selectFrames(frames: Frame[], max = 10): Frame[] {
  if (frames.length <= max) return frames
  const hook = frames.filter((f) => f.isHookFrame)
  const body = frames.filter((f) => !f.isHookFrame)
  const hookKeep = Math.min(hook.length, 6)
  const bodyKeep = max - hookKeep
  const pick = <T,>(arr: T[], n: number) =>
    n <= 0 ? [] : Array.from({ length: Math.min(n, arr.length) },
      (_, i) => arr[Math.round((i * (arr.length - 1)) / Math.max(1, Math.min(n, arr.length) - 1))])
  return [...pick(hook, hookKeep), ...pick(body, bodyKeep)].sort((a, b) => a.tSec - b.tSec)
}

export interface BlindInput {
  frames: Frame[]
  transcript: Transcript | null
  meta: MediaMeta
  cuts: number
  filename: string
}

export const PROMPT_VERSION = 1
export const MODEL = 'claude-opus-5'

/**
 * Classifies a creative with no sight of ClickUp.
 *
 * The blindness is the point: shown the existing label and asked "is this
 * right?", a model overwhelmingly agrees, and the comparison becomes a rubber
 * stamp. Deriving the value independently is what makes the later diff mean
 * anything.
 */
export async function analyseBlind(
  client: Anthropic,
  input: BlindInput,
): Promise<{ observation: Observation; usage: Anthropic.Usage }> {
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
    `Measured properties (trust these over your visual impression):`,
    `- duration: ${input.meta.durationSec?.toFixed(1) ?? 'unknown'}s`,
    `- dimensions: ${input.meta.width}x${input.meta.height} (${input.meta.aspectRatio})`,
    `- audio track present: ${input.meta.hasAudio}`,
    `- hard cuts detected: ${input.cuts}`,
    '',
    frames.length
      ? `Frames follow at: ${frames.map((f) => `${f.tSec.toFixed(1)}s`).join(', ')}`
      : 'No frames could be sampled.',
    '',
    input.transcript?.text
      ? `Transcript:\n${input.transcript.text}`
      : 'No speech detected in the audio.',
    input.transcript?.hookSpoken ? `\nSpoken in first 3s: "${input.transcript.hookSpoken}"` : '',
  ].join('\n')

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ObservationSchema), effort: 'medium' },
    messages: [{ role: 'user', content: [...images, { type: 'text', text: facts }] }],
  })

  if (!response.parsed_output) {
    throw new Error(`Model returned no parsable output for ${input.filename}`)
  }
  return { observation: response.parsed_output, usage: response.usage }
}

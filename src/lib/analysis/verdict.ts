import type { VerdictKey } from '../data/types'

/**
 * How confidently a field can be judged from the creative alone.
 *
 * This tiering is the honest core of the comparison. An "objective" field is
 * settled by the file itself — a photo is not a video, and no amount of
 * ClickUp metadata changes that. An "interpretive" field describes intent,
 * which a creative can only ever *signal*. Overruling a human's Persona tag
 * because a model guessed differently would corrupt the briefing process, so
 * interpretive fields never produce a hard mismatch.
 */
export type Verifiability = 'objective' | 'semi' | 'interpretive'

export interface FieldSpec {
  field: string
  label: string
  verifiability: Verifiability
  /** Accepted vocabulary, mirroring the ClickUp dropdown where one exists. */
  vocabulary?: string[]
}

export const FIELD_SPECS: FieldSpec[] = [
  { field: 'ad_type', label: 'Photo / Video', verifiability: 'objective', vocabulary: ['Photo', 'Video'] },
  {
    field: 'production_style', label: 'Production Style', verifiability: 'objective',
    vocabulary: ['Organic / Raw UGC', 'Polished UGC', 'Professional Studio', 'AI Generated',
      'Screen Record', 'Animation / Motion', 'Static Graphic', 'Slideshow',
      'Repurposed Organic', 'Competitor Inspired'],
  },
  {
    field: 'creative_structure', label: 'Creative Structure', verifiability: 'objective',
    vocabulary: ['UGC', 'Testimonial', 'Demo', 'Tutorial / How-To', 'Story / Narrative',
      'Hook + Offer', 'Listicle', 'Static / Photo', 'Comparison', 'Interview',
      'Skit / Roleplay', 'AI / Voiceover'],
  },
  {
    field: 'hook_type', label: 'Hook Type', verifiability: 'semi',
    vocabulary: ['Pain / Problem', 'Fear', 'Curiosity', 'Social Proof', 'Aspirational',
      'Direct Offer', 'Controversy / Bold Claim', 'POV', 'Question',
      'News / Trend', 'Pattern Interrupt'],
  },
  { field: 'funnel', label: 'Funnel', verifiability: 'semi', vocabulary: ['TOF', 'MOF', 'BOF'] },
  { field: 'angle', label: 'Angle', verifiability: 'interpretive' },
  { field: 'persona', label: 'Persona', verifiability: 'interpretive' },
]

/** Collapses spacing, case and punctuation drift so equivalent labels compare equal. */
export function normalise(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const v = value
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s*([+/-])\s*/g, ' $1 ')
    .replace(/[^a-z0-9+/\- ]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return v === '' || v === '-' ? null : v
}

export interface CompareInput {
  spec: FieldSpec
  claimed: string | null
  observed: string | null
  /** Model confidence in the observation, 0..1. */
  confidence: number | null
  evidence: string | null
}

export interface ComparedField {
  field: string
  label: string
  verifiability: Verifiability
  claimed: string | null
  observed: string | null
  verdict: VerdictKey
  confidence: number | null
  evidence: string | null
  /** The value analytics aggregate on. */
  resolved: string | null
}

/**
 * Below this, an observation is not trusted enough to contradict a human.
 * A low-confidence disagreement is reported as unverifiable, not as a mismatch,
 * so the mismatch count stays meaningful.
 */
const CONFIDENCE_FLOOR = 0.6

export function compareField(input: CompareInput): ComparedField {
  const { spec, claimed, observed, confidence, evidence } = input
  const c = normalise(claimed)
  const o = normalise(observed)

  const base = {
    field: spec.field,
    label: spec.label,
    verifiability: spec.verifiability,
    claimed,
    observed,
    confidence,
    evidence,
  }

  if (c === null && o === null) {
    return { ...base, verdict: 'unverifiable', resolved: null }
  }

  // ClickUp left it blank and the creative supplied it — pure gain, no conflict.
  if (c === null && o !== null) {
    const trusted = (confidence ?? 0) >= CONFIDENCE_FLOOR
    return { ...base, verdict: 'missing', resolved: trusted ? observed : null }
  }

  // Nothing observed: either not analysed, or the creative cannot settle it.
  if (o === null) {
    return { ...base, verdict: 'unverifiable', resolved: claimed }
  }

  if (c === o) {
    return { ...base, verdict: 'match', resolved: claimed }
  }

  // They disagree. What that means depends on how knowable the field is.
  if (spec.verifiability === 'interpretive') {
    // The creative only signals intent. Report the divergence, keep the human's
    // value, and never call it a mismatch.
    return { ...base, verdict: 'unverifiable', resolved: claimed }
  }

  if ((confidence ?? 0) < CONFIDENCE_FLOOR) {
    return { ...base, verdict: 'unverifiable', resolved: claimed }
  }

  return { ...base, verdict: 'mismatch', resolved: observed }
}

export function compareAll(
  claimed: Record<string, string | null>,
  observed: Record<string, string | null>,
  confidence: Record<string, number> = {},
  evidence: Record<string, string> = {},
): ComparedField[] {
  return FIELD_SPECS.map((spec) =>
    compareField({
      spec,
      claimed: claimed[spec.field] ?? null,
      observed: observed[spec.field] ?? null,
      confidence: confidence[spec.field] ?? null,
      evidence: evidence[spec.field] ?? null,
    }),
  )
}

/** Only genuine contradictions count — see compareField. */
export const countMismatches = (fields: ComparedField[]) =>
  fields.filter((f) => f.verdict === 'mismatch').length

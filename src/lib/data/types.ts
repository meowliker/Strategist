/** View models the UI renders. Deliberately independent of ClickUp's shape. */

import type { ProductKey } from '../products'
export type { ProductKey }
export type StatusKey = 'win' | 'mild' | 'scale' | 'loss' | 'un'
export type VerdictKey = 'match' | 'mismatch' | 'missing' | 'differs' | 'unverifiable'

export interface FieldVerdict {
  field: string
  label: string
  claimed: string | null
  observed: string | null
  verdict: VerdictKey
  verifiability: 'objective' | 'semi' | 'interpretive'
  confidence: number | null
  evidence: string | null
  resolved: string | null
}

/** A field where ClickUp and the creative each hold a view. */
export interface DualValue {
  claimed: string | null
  observed: string | null
  verdict: VerdictKey
  rationale: string | null
  confidence: number | null
}

export interface CreativeRow {
  taskId: string
  /** Present once the creative file itself has been analysed. */
  creativeId?: string
  filename?: string
  variantIndex?: number | null
  name: string
  /** The ClickUp task name, kept alongside the filename so search matches both. */
  taskName: string
  url: string
  product: ProductKey
  productName: string
  status: StatusKey
  statusLabel: string
  assignee: string | null
  changedLever: string | null
  /** On-screen hook text read from the creative, falling back to the brief. */
  hook: string | null
  adType: string | null
  /** Both readings, shown side by side. Neither overwrites the other. */
  angle?: DualValue
  persona?: DualValue
  productionStyle?: DualValue
  creativeStructure?: DualValue
  hookType?: DualValue
  funnel?: DualValue
  adTypeDual?: DualValue
  durationSec?: number | null
  cutsPerMinute?: number | null
  /** Populated once the creative has been analysed. */
  verdicts: FieldVerdict[]
  mismatchCount: number
  analysed: boolean
}

export interface FormatRow {
  key: string
  code: string
  label: string
  description: string
  product: ProductKey
  wins: number
  losses: number
  tested: number
  winRate: number | null
}

export interface KeywordRow {
  term: string
  kind: 'hook_phrase' | 'pain_point' | 'format' | 'entity'
  product: ProductKey
  productName: string
  weight: number
  /** Number of winning creatives this term appears in. */
  wins: number
}

export interface Snapshot {
  generatedAt: string
  live: boolean
  totals: {
    tasks: number
    winners: number
    losers: number
    analysed: number
    mismatches: number
  }
  creatives: CreativeRow[]
  formats: FormatRow[]
  keywords: KeywordRow[]
  /** Per-field agreement between ClickUp and the creatives. */
  trust: { field: string; label: string; agree: number; total: number }[]
}

export const PRODUCT_LABEL: Record<ProductKey, string> = {
  hh: 'Herbal Healing',
  ad: 'ADHD',
  ca: 'Canva Mastery',
  ig: 'Instagram Growth',
  km: 'Kids Mental Health',
  kl: 'Kids Life Skill',
  ot: 'Other',
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  win: 'Winner',
  mild: 'Mild Winner',
  scale: 'Scale',
  loss: 'Loser',
  un: 'Untested',
}

/** Builds a search URL for each place the team hunts competitor creatives. */
export function searchLinks(term: string) {
  const q = encodeURIComponent(term)
  return {
    adLibrary: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered`,
    instagram: `https://www.instagram.com/explore/search/keyword/?q=${q}`,
    tiktok: `https://www.tiktok.com/search?q=${q}`,
  }
}

/**
 * The only ClickUp lists this system reads. Scope is deliberately narrow —
 * adding a product means adding it here and nowhere else.
 */
/** Short key used throughout the app and in the ?product= query string. */
export type ProductKey = 'hh' | 'ad' | 'ca' | 'ig' | 'km' | 'kl' | 'ot'

export interface ProductConfig {
  /** Short key used in URLs, CSS classes and the data layer */
  key: Exclude<ProductKey, 'ot'>
  /** ClickUp list id */
  listId: string
  /** Display name in the dashboard */
  name: string
  /** Short label for the product switcher */
  short: string
  /** Task-name prefix used by this list, e.g. "HH-027-INS-014" */
  codes: string[]
}

/**
 * Every product the system reads. Adding one is a single entry here — the
 * list→key map, the switcher and the colour tokens all derive from this.
 */
export const PRODUCTS: ProductConfig[] = [
  { key: 'hh', listId: '901613416500', name: 'Herbal Healing Handbook', short: 'Herbal', codes: ['HH', 'HHH', 'Herbal'] },
  { key: 'ad', listId: '901613119887', name: 'ADHD', short: 'ADHD', codes: ['AD', 'ADHD'] },
  { key: 'ca', listId: '901613035012', name: 'Canva Mastery', short: 'Canva', codes: ['CA'] },
  { key: 'ig', listId: '901615920553', name: 'Instagram Growth Bundle', short: 'Instagram', codes: ['IG', 'IGB'] },
  { key: 'km', listId: '901613118174', name: 'Kids Mental Health', short: 'Kids MH', codes: ['KM', 'KMH'] },
  { key: 'kl', listId: '901613067126', name: 'Kids Life Skill', short: 'Kids LS', codes: ['KL', 'KLS'] },
]

/** ClickUp list id → short product key. */
export const LIST_TO_KEY: Record<string, ProductKey> = Object.fromEntries(
  PRODUCTS.map((p) => [p.listId, p.key]),
)

export const keyToProduct = (key: string): ProductConfig | undefined =>
  PRODUCTS.find((p) => p.key === key)

export const PRODUCT_KEYS = PRODUCTS.map((p) => p.key)

export const LIST_IDS = PRODUCTS.map((p) => p.listId)

export const productByListId = (listId: string): ProductConfig | undefined =>
  PRODUCTS.find((p) => p.listId === listId)

/**
 * Statuses that count as a win. `scale` sits above `winner` in the ClickUp
 * ladder, so it is included.
 */
export const WINNING_STATUSES = ['winner', 'mild winner', 'scale'] as const

/** Statuses that represent a tested-and-failed creative. */
export const LOSING_STATUSES = ['loser'] as const

/**
 * Statuses with a DECIDED outcome. Only these belong in a win-rate denominator.
 *
 * `testing` is deliberately excluded: those creatives are in market but not yet
 * judged, so counting them as wins inflates every rate to 100%, and counting
 * them as losses deflates it. They belong in neither half of the fraction until
 * someone marks them.
 *
 * `in production` and friends never reached market at all.
 */
export const DECIDED_STATUSES = [
  ...WINNING_STATUSES,
  ...LOSING_STATUSES,
] as const

export type WinCategory = 'winner' | 'mild_winner' | 'scale' | 'loser' | 'untested'

export function categorise(status: string): WinCategory {
  switch (status.toLowerCase().trim()) {
    case 'winner':
      return 'winner'
    case 'mild winner':
      return 'mild_winner'
    case 'scale':
      return 'scale'
    case 'loser':
      return 'loser'
    default:
      return 'untested'
  }
}

export const isWin = (status: string) => categorise(status) !== 'loser' && categorise(status) !== 'untested'

/**
 * The only ClickUp lists this system reads. Scope is deliberately narrow —
 * adding a product means adding it here and nowhere else.
 */
export interface ProductConfig {
  /** ClickUp list id */
  listId: string
  /** Display name in the dashboard */
  name: string
  /** Task-name prefix used by this list, e.g. "HH-027-INS-014" */
  codes: string[]
}

export const PRODUCTS: ProductConfig[] = [
  { listId: '901613416500', name: 'Herbal Healing Handbook', codes: ['HH', 'HHH', 'Herbal'] },
  { listId: '901613119887', name: 'ADHD', codes: ['AD', 'ADHD'] },
  { listId: '901613035012', name: 'Canva Mastery', codes: ['CA'] },
  { listId: '901615920553', name: 'Instagram Growth Bundle', codes: ['IG', 'IGB'] },
]

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
 * Statuses where the creative has actually been in market. Only these belong in
 * a win-rate denominator — a task sitting in `in production` was never tested,
 * so counting it as a loss would understate every format.
 */
export const TESTED_STATUSES = [
  ...WINNING_STATUSES,
  ...LOSING_STATUSES,
  'testing',
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

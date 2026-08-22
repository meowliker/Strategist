import type { Snapshot, ProductKey } from './types'
import { computeTrust } from './trust'
import { PRODUCT_KEYS } from '../products'

export type ProductFilter = ProductKey | 'all'

export function readProduct(searchParams?: Record<string, string | string[] | undefined>): ProductFilter {
  const raw = searchParams?.product
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && (PRODUCT_KEYS as readonly string[]).includes(value)
    ? (value as ProductKey)
    : 'all'
}

/**
 * Narrows a snapshot to one product.
 *
 * Totals are recomputed from the filtered rows rather than carried over, so a
 * product view never shows workspace-wide numbers next to its own data.
 */
export function selectProduct(snap: Snapshot, product: ProductFilter): Snapshot {
  if (product === 'all') return snap

  const creatives = snap.creatives.filter((c) => c.product === product)
  const tasksOf = (pred: (c: typeof creatives[number]) => boolean) =>
    new Set(creatives.filter(pred).map((c) => c.taskId)).size

  return {
    ...snap,
    creatives,
    formats: snap.formats.filter((f) => f.product === product),
    keywords: snap.keywords.filter((k) => k.product === product),
    // Recomputed from this product's rows — the workspace-wide figures would
    // otherwise appear under a product heading.
    trust: computeTrust(creatives),
    totals: {
      tasks: new Set(creatives.map((c) => c.taskId)).size,
      winners: tasksOf((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale'),
      losers: tasksOf((c) => c.status === 'loss'),
      analysed: tasksOf((c) => c.analysed),
      mismatches: creatives.reduce((n, c) => n + c.mismatchCount, 0),
    },
  }
}

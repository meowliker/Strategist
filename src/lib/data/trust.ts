import type { CreativeRow } from './types'

const FIELDS: { key: keyof CreativeRow; field: string; label: string }[] = [
  { key: 'adTypeDual', field: 'ad_type', label: 'Photo / Video' },
  { key: 'productionStyle', field: 'production_style', label: 'Production Style' },
  { key: 'creativeStructure', field: 'creative_structure', label: 'Creative Structure' },
  { key: 'hookType', field: 'hook_type', label: 'Hook Type' },
  { key: 'funnel', field: 'funnel', label: 'Funnel' },
]

/**
 * How often ClickUp matches the footage, derived from the same rows the page
 * renders so a product view never reports workspace-wide numbers.
 *
 * `differs` and `unverifiable` are excluded from both halves. Angle and Persona
 * only ever reach those states, so they never appear here at all — two
 * defensible readings of intent say nothing about whether a field is accurate.
 */
export function computeTrust(creatives: CreativeRow[]) {
  return FIELDS.map(({ key, field, label }) => {
    let agree = 0, total = 0
    for (const c of creatives) {
      if (!c.analysed) continue
      const dv = c[key] as { verdict: string } | undefined
      if (!dv || dv.verdict === 'differs' || dv.verdict === 'unverifiable') continue
      total++
      if (dv.verdict === 'match') agree++
    }
    return { field, label, agree, total }
  })
    .filter((t) => t.total > 0)
    .sort((a, b) => a.agree / a.total - b.agree / b.total)
}

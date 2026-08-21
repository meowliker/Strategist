/**
 * Extracts the structured brief that the team embeds in ClickUp task
 * descriptions as a markdown table, plus the surrounding lineage annotations.
 *
 * This is ClickUp's *claimed* view of a creative. It is never treated as truth —
 * it is one half of the comparison against what the creative actually shows.
 */

export interface ParsedBrief {
  angle: string | null
  persona: string | null
  funnel: string | null
  adType: string | null
  hookType: string | null
  creativeStructure: string | null
  productionStyle: string | null
  /** Free-form hypothesis written under "🧠 Creative Hypothesis". */
  hypothesis: string | null
  /** Drive folder holding the competitor / reference ad. */
  inspirationLink: string | null
  /** ClickUp Doc page for the inspiration write-up. */
  inspirationBriefUrl: string | null
  sourceAdUrl: string | null
  notes: string | null
  /** Name of the task this one is a variation of. */
  variationOf: string | null
  parentTaskUrl: string | null
  /** What the variation changed, per the description (not the task name). */
  changes: string | null
  /** Any unrecognised table rows, kept so nothing is silently dropped. */
  extra: Record<string, string>
}

const EMPTY: ParsedBrief = {
  angle: null,
  persona: null,
  funnel: null,
  adType: null,
  hookType: null,
  creativeStructure: null,
  productionStyle: null,
  hypothesis: null,
  inspirationLink: null,
  inspirationBriefUrl: null,
  sourceAdUrl: null,
  notes: null,
  variationOf: null,
  parentTaskUrl: null,
  changes: null,
  extra: {},
}

/** Strips markdown link syntax down to the bare URL or label. */
function clean(value: string): string | null {
  const v = value
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, label, url) => url || label)
    .replace(/\\_/g, '_')
    .replace(/\*\*/g, '')
    .trim()
  if (!v || v === '—' || v === '-' || v.toLowerCase() === 'n/a') return null
  return v
}

const FIELD_MAP: Record<string, keyof ParsedBrief> = {
  angle: 'angle',
  persona: 'persona',
  funnel: 'funnel',
  'funnel type': 'funnel',
  'ad type': 'adType',
  'photo/video': 'adType',
  'hook type': 'hookType',
  'creative structure': 'creativeStructure',
  'production style': 'productionStyle',
  'inspiration link': 'inspirationLink',
}

function afterLabel(text: string, label: string): string | null {
  // Labels appear as "📌 Inspiration Brief: <value>" on their own line.
  const re = new RegExp(`${label}\\s*:?\\s*(.+)`, 'i')
  const line = text.split('\n').find((l) => re.test(l))
  if (!line) return null
  const m = line.match(re)
  return m ? clean(m[1]) : null
}

export function parseBrief(description: string | null | undefined): ParsedBrief {
  if (!description) return { ...EMPTY, extra: {} }

  const result: ParsedBrief = { ...EMPTY, extra: {} }

  // --- markdown table rows: | Field | Value | ---
  const rowRe = /^\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/gm
  for (const m of description.matchAll(rowRe)) {
    const key = m[1].trim().toLowerCase()
    const value = m[2]
    if (key === 'field' || /^-+$/.test(key)) continue // header / separator
    const mapped = FIELD_MAP[key]
    const cleaned = clean(value)
    if (!cleaned) continue
    if (mapped) {
      ;(result as unknown as Record<string, unknown>)[mapped] = cleaned
    } else {
      result.extra[m[1].trim()] = cleaned
    }
  }

  // --- labelled lines ---
  result.inspirationBriefUrl = afterLabel(description, '📌\\s*Inspiration Brief')
  result.sourceAdUrl = afterLabel(description, '🔗\\s*Source Ad')
  result.notes = afterLabel(description, '📝\\s*Notes')
  result.variationOf = afterLabel(description, '🔁\\s*Variation of')
  result.parentTaskUrl = afterLabel(description, '🔗\\s*Parent Task')
  result.changes = afterLabel(description, '📋\\s*Changes')

  // --- hypothesis block: everything between the heading and the next divider ---
  const hyp = description.match(/🧠\s*Creative Hypothesis\s*\n([\s\S]*?)(?:\n\s*━|$)/)
  if (hyp) result.hypothesis = clean(hyp[1].replace(/\n+/g, ' '))

  return result
}

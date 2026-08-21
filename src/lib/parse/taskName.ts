/**
 * Parses the naming convention used across the Script Banks lists.
 *
 * The convention is real but inconsistently applied over time, so this parser is
 * deliberately tolerant: every field is optional and a name that matches nothing
 * still round-trips as a usable record.
 *
 * Real examples this handles:
 *   AT-126-INS-063
 *   AR-189-INS-059 - V3 - Full Remake
 *   9645-2 - V5 - Custom - V4 - CTA
 *   KL - 12991/9821 (2 winner) - V16 - PS - V2 - Hook
 *   PHONICS - 13423 - V3 - Production Style [13898]
 *   NC-017-INS-014 - V4 - Change body ( Clip after the hook )
 *   IGB-FR-VID-01
 *   IGB-ICP1-A
 *   10168-1 winner P old
 */

export interface Variation {
  /** The N in "- V3 -" */
  index: number
  /** The lever that was changed: Hook, CTA, Text, Music, Full Remake, ... */
  lever: string
}

export interface ParsedTaskName {
  raw: string
  /** Name with the variation chain and trailing bracket refs removed. */
  baseName: string
  /** Two-to-three letter product prefix, e.g. AT / AD / HH / CA / IG. */
  productCode: string | null
  /** The serial number in AT-126-INS-063 -> 126. */
  serial: number | null
  /** The inspiration reference in AT-126-INS-063 -> "063". */
  inspirationId: string | null
  /**
   * Standalone 4-5 digit creative IDs. These are the cross-reference keys that
   * link a legacy winner to every later variation spawned from it, so a task
   * can carry several.
   */
  legacyIds: number[]
  /** Ordered variation chain, outermost first. */
  variations: Variation[]
  /** The most recent lever changed, i.e. what this task was actually testing. */
  changedLever: string | null
  /** IGB angle code: FR | VS | AA | MN. */
  igbAngle: string | null
  /** IGB asset type: VID | IMG. */
  igbAssetType: string | null
  /** IGB ICP marker, e.g. "ICP1-A". */
  icpMarker: string | null
  /** True when the name carries an "old winner" / "new winner" annotation. */
  hasLegacyWinnerNote: boolean
}

const VARIATION_MARKER = /\s-\sV(\d+)\s-\s/g
const IGB_ANGLE = /\bIGB-(FR|VS|AA|MN)-(VID|IMG)-(\d+)\b/i
const IGB_ICP = /\bIGB-(ICP\d+-[A-Z])\b/i
const PRODUCT_SERIAL_INS = /\b([A-Z]{2,4})-(\d{2,4})-INS-(\d{2,4})\b/i
const INS_ONLY = /\bINS-(\d{2,4})\b/i
const LEGACY_ID = /(?<![\d.])(\d{4,5})(?![\d.])/g
const LEGACY_WINNER_NOTE = /\b(old|new)\s+winner\b/i

/**
 * Splits the variation chain off the end of a name.
 *
 * Levers can themselves contain " - " (e.g. "Change body ( Clip after the hook )"),
 * so we locate every " - V<n> - " marker and treat the text between one marker
 * and the next as that variation's lever.
 */
function extractVariations(name: string): { baseName: string; variations: Variation[] } {
  const markers = [...name.matchAll(VARIATION_MARKER)]
  if (markers.length === 0) return { baseName: name.trim(), variations: [] }

  const variations: Variation[] = []
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    const start = marker.index! + marker[0].length
    const end = i + 1 < markers.length ? markers[i + 1].index! : name.length
    const lever = name.slice(start, end).trim()
    if (lever) variations.push({ index: Number(marker[1]), lever })
  }

  return { baseName: name.slice(0, markers[0].index!).trim(), variations }
}

export function parseTaskName(raw: string): ParsedTaskName {
  const name = raw.trim()

  // Trailing bracket references like "[13898]" are lineage pointers, not part of
  // the lever text — pull them out before anything else.
  const bracketIds: number[] = []
  const withoutBrackets = name.replace(/\[(\d{4,5})\]/g, (_, id) => {
    bracketIds.push(Number(id))
    return ' '
  })

  const { baseName, variations } = extractVariations(withoutBrackets)

  const psi = baseName.match(PRODUCT_SERIAL_INS)
  const insOnly = psi ? null : baseName.match(INS_ONLY)
  const igb = name.match(IGB_ANGLE)
  const icp = name.match(IGB_ICP)

  const legacyIds = [
    ...new Set([
      ...bracketIds,
      ...[...baseName.matchAll(LEGACY_ID)].map((m) => Number(m[1])),
    ]),
  ].sort((a, b) => a - b)

  return {
    raw,
    baseName: baseName.replace(/\s{2,}/g, ' ').trim(),
    productCode: psi ? psi[1].toUpperCase() : igb ? 'IGB' : null,
    serial: psi ? Number(psi[2]) : null,
    inspirationId: psi ? psi[3] : insOnly ? insOnly[1] : null,
    legacyIds,
    variations,
    changedLever: variations.length ? variations[variations.length - 1].lever : null,
    igbAngle: igb ? igb[1].toUpperCase() : null,
    igbAssetType: igb ? igb[2].toUpperCase() : null,
    icpMarker: icp ? icp[1].toUpperCase() : null,
    hasLegacyWinnerNote: LEGACY_WINNER_NOTE.test(name),
  }
}

/**
 * Canonical key for deduplication. The workspace contains genuine duplicate
 * tasks (same name, different task id), so grouping needs a stable key that
 * ignores whitespace and case drift.
 */
export function dedupeKey(listId: string, raw: string): string {
  return `${listId}::${raw.toLowerCase().replace(/\s+/g, ' ').trim()}`
}

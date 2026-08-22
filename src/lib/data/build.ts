import type { ClickUpTask } from '../clickup/client'
import { fieldMap } from '../clickup/client'
import { parseTaskName } from '../parse/taskName'
import { parseBrief } from '../parse/brief'
import { categorise, DECIDED_STATUSES, LIST_TO_KEY } from '../products'
import type {
  Snapshot, CreativeRow, FormatRow, ProductKey, StatusKey,
} from './types'
import { PRODUCT_LABEL, STATUS_LABEL } from './types'


const STATUS_TO_KEY: Record<string, StatusKey> = {
  winner: 'win',
  mild_winner: 'mild',
  scale: 'scale',
  loser: 'loss',
  untested: 'un',
}

/**
 * Turns raw ClickUp tasks into the snapshot the dashboard renders.
 *
 * Only fields that genuinely exist in ClickUp are populated here. Everything
 * that requires watching the creative — hook text, observed taxonomy, verdicts,
 * keywords — is left empty and filled by the media pipeline. Nothing is
 * inferred or invented to make a section look populated.
 */
export function buildSnapshot(tasks: ClickUpTask[], opts: { live: boolean } = { live: false }): Snapshot {
  const creatives: CreativeRow[] = []
  const seen = new Set<string>()

  for (const task of tasks) {
    // Genuine duplicates exist in the workspace (same name, different id).
    const key = `${task.list.id}::${task.name.toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) continue
    seen.add(key)

    const parsedName = parseTaskName(task.name)
    const brief = parseBrief(task.markdown_description ?? task.description)
    const fields = fieldMap(task)
    const category = categorise(task.status.status)
    const product = LIST_TO_KEY[task.list.id] ?? 'ot'

    creatives.push({
      taskId: task.id,
      name: task.name,
      taskName: task.name,
      url: task.url,
      product,
      productName: PRODUCT_LABEL[product],
      status: STATUS_TO_KEY[category],
      statusLabel: STATUS_LABEL[STATUS_TO_KEY[category]],
      assignee: task.assignees?.[0]?.username ?? fields['Editor'] ?? null,
      changedLever: parsedName.changedLever,
      // Until a creative is analysed there is no observed hook text. The brief's
      // notes are the closest ClickUp equivalent and are labelled as claimed.
      hook: brief.notes ?? brief.hypothesis ?? null,
      adType: fields['Photo/Video'] ?? brief.adType ?? null,
      verdicts: [],
      mismatchCount: 0,
      analysed: false,
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    live: opts.live,
    totals: {
      tasks: creatives.length,
      winners: creatives.filter((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale').length,
      losers: creatives.filter((c) => c.status === 'loss').length,
      analysed: 0,
      mismatches: 0,
    },
    creatives,
    formats: buildFormats(tasks, seen),
    keywords: [],
    trust: [],
  }
}

/**
 * Normalises a claimed taxonomy label so spacing and case drift collapse into
 * one bucket. ClickUp holds both "Hook + Offer" and "Hook+Offer"; without this
 * they compete as separate formats and each shows half the real sample.
 */
function normaliseLabel(raw: string): string {
  return raw
    .replace(/\s*([+/])\s*/g, ' $1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

function displayLabel(raw: string): string {
  const n = normaliseLabel(raw)
  return n.replace(/(^|\s|\/)([a-z])/g, (_, p, ch) => p + ch.toUpperCase())
}

/**
 * Win rates by Creative Structure, using ClickUp's claimed value.
 *
 * The denominator counts only creatives with a decided outcome — see
 * DECIDED_STATUSES. Rows stay unverified until the creatives are analysed.
 */
function buildFormats(tasks: ClickUpTask[], _seen: Set<string>): FormatRow[] {
  const buckets = new Map<string, { wins: number; losses: number; tested: number; product: ProductKey }>()

  for (const task of tasks) {
    const fields = fieldMap(task)
    const brief = parseBrief(task.markdown_description ?? task.description)
    const structure = fields['Creative Structure'] ?? brief.creativeStructure
    if (!structure) continue

    const status = task.status.status.toLowerCase()
    if (!(DECIDED_STATUSES as readonly string[]).includes(status)) continue

    const product = LIST_TO_KEY[task.list.id] ?? 'ot'
    const bucketKey = `${product}::${normaliseLabel(structure)}`
    const bucket = buckets.get(bucketKey) ?? { wins: 0, losses: 0, tested: 0, product }
    bucket.tested++
    if (categorise(status) === 'loser') bucket.losses++
    else bucket.wins++
    buckets.set(bucketKey, bucket)
  }

  return [...buckets.entries()]
    .map(([bucketKey, b]) => {
      const [, structure] = bucketKey.split('::')
      const label = displayLabel(structure)
      return {
        key: bucketKey,
        code: label.slice(0, 2).toUpperCase(),
        label,
        description: `${PRODUCT_LABEL[b.product]} · claimed by ClickUp, not yet verified against the creative`,
        product: b.product,
        wins: b.wins,
        losses: b.losses,
        tested: b.tested,
        winRate: b.tested > 0 ? b.wins / b.tested : null,
      }
    })
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.tested - a.tested)
}

export const EMPTY_SNAPSHOT: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  live: false,
  totals: { tasks: 0, winners: 0, losers: 0, analysed: 0, mismatches: 0 },
  creatives: [],
  formats: [],
  keywords: [],
  trust: [],
}

import {
  pgTable, text, integer, timestamp, jsonb, boolean, real, index, uniqueIndex, pgEnum,
} from 'drizzle-orm/pg-core'

/* ────────────────────────────────────────────────────────────────────────────
 * Core principle: ClickUp's claims and the creative's observed reality are
 * stored SEPARATELY and never overwrite each other. `resolved_*` is the value
 * the dashboard aggregates on, derived from both plus any human override.
 * Nothing in this schema is ever written back to ClickUp.
 * ──────────────────────────────────────────────────────────────────────────── */

export const winCategory = pgEnum('win_category', [
  'winner', 'mild_winner', 'scale', 'loser', 'untested',
])

export const verdictKind = pgEnum('verdict_kind', [
  'match',          // ClickUp and the creative agree
  'mismatch',       // they disagree — ClickUp is likely wrong
  'missing',        // ClickUp blank, the creative supplied a value
  'differs',        // both hold a considered view and they diverge; neither is
                    // authoritative. Angle and Persona only ever reach this.
  'unverifiable',   // the creative cannot settle this field (Angle, Persona)
  'no_claim_no_obs',
])

/** How confidently a field can be judged from the creative alone. */
export const verifiability = pgEnum('verifiability', ['objective', 'semi', 'interpretive'])

/* ── ClickUp mirror ──────────────────────────────────────────────────────── */

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),                       // ClickUp task id
  listId: text('list_id').notNull(),
  productName: text('product_name').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  status: text('status').notNull(),
  category: winCategory('category').notNull(),
  /** True only for statuses that actually reached market — the win-rate denominator. */
  wasTested: boolean('was_tested').notNull().default(false),

  dateCreated: timestamp('date_created', { withTimezone: true }),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  assignees: jsonb('assignees').$type<{ id: number; username: string }[]>().notNull().default([]),
  editor: text('editor'),

  // ── parsed from the task name ──
  productCode: text('product_code'),
  serial: integer('serial'),
  inspirationId: text('inspiration_id'),
  legacyIds: jsonb('legacy_ids').$type<number[]>().notNull().default([]),
  variationChain: jsonb('variation_chain').$type<{ index: number; lever: string }[]>().notNull().default([]),
  /** The lever this task was actually testing: Hook, CTA, Text, Music, ... */
  changedLever: text('changed_lever'),
  igbAngle: text('igb_angle'),
  parentTaskId: text('parent_task_id'),

  // ── CLAIMED: what ClickUp says, from custom fields + the brief table ──
  claimedAngle: text('claimed_angle'),
  claimedPersona: text('claimed_persona'),
  claimedFunnel: text('claimed_funnel'),
  claimedAdType: text('claimed_ad_type'),
  claimedHookType: text('claimed_hook_type'),
  claimedCreativeStructure: text('claimed_creative_structure'),
  claimedProductionStyle: text('claimed_production_style'),
  claimedUsp: text('claimed_usp'),
  hypothesis: text('hypothesis'),
  notes: text('notes'),
  driveLink: text('drive_link'),
  inspirationLink: text('inspiration_link'),
  inspirationBriefUrl: text('inspiration_brief_url'),

  rawDescription: text('raw_description'),
  /** Normalised duplicate-detection key; duplicates share it. */
  dedupeKey: text('dedupe_key').notNull(),
  duplicateOfTaskId: text('duplicate_of_task_id'),

  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('tasks_list_idx').on(t.listId),
  index('tasks_category_idx').on(t.category),
  index('tasks_dedupe_idx').on(t.dedupeKey),
])

/* ── One row per actual media file ───────────────────────────────────────── */

export const creatives = pgTable('creatives', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),

  source: text('source').notNull(),                  // 'drive' | 'clickup_attachment'
  sourceFileId: text('source_file_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes'),
  /** The -1 / -2 / -3 suffix: which hook variant of the task this file is. */
  variantIndex: integer('variant_index'),
  isVideo: boolean('is_video').notNull(),

  // ── measured directly from the file ──
  durationSec: real('duration_sec'),
  width: integer('width'),
  height: integer('height'),
  aspectRatio: text('aspect_ratio'),
  cutCount: integer('cut_count'),
  cutsPerMinute: real('cuts_per_minute'),
  hasVoiceover: boolean('has_voiceover'),
  hasMusic: boolean('has_music'),

  thumbnailPath: text('thumbnail_path'),             // Supabase Storage key
  analysedAt: timestamp('analysed_at', { withTimezone: true }),
  analysisError: text('analysis_error'),
}, (t) => [
  index('creatives_task_idx').on(t.taskId),
  uniqueIndex('creatives_source_idx').on(t.source, t.sourceFileId),
])

export const transcripts = pgTable('transcripts', {
  creativeId: text('creative_id').primaryKey().references(() => creatives.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  language: text('language'),
  segments: jsonb('segments').$type<{ start: number; end: number; text: string }[]>().notNull().default([]),
  /** Spoken words in the first 3 seconds — the audio half of the hook. */
  hookSpoken: text('hook_spoken'),
})

/** On-screen text read from sampled frames, dense over the opening seconds. */
export const frameTexts = pgTable('frame_texts', {
  id: text('id').primaryKey(),
  creativeId: text('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  tSec: real('t_sec').notNull(),
  text: text('text').notNull(),
  isHookFrame: boolean('is_hook_frame').notNull().default(false),
  framePath: text('frame_path'),
}, (t) => [index('frame_texts_creative_idx').on(t.creativeId)])

/* ── OBSERVED: derived blind from the creative, with no sight of ClickUp ──── */

export const observations = pgTable('observations', {
  creativeId: text('creative_id').primaryKey().references(() => creatives.id, { onDelete: 'cascade' }),

  observedAdType: text('observed_ad_type'),
  observedCreativeStructure: text('observed_creative_structure'),
  observedProductionStyle: text('observed_production_style'),
  observedHookType: text('observed_hook_type'),
  observedFunnel: text('observed_funnel'),
  /** Interpretive: what the creative *signals*, not a claim about intent. */
  observedAngleSignal: text('observed_angle_signal'),
  observedPersonaSignal: text('observed_persona_signal'),

  /** The on-screen hook text — the single most reusable artefact here. */
  hookText: text('hook_text'),
  ctaText: text('cta_text'),
  painPoints: jsonb('pain_points').$type<string[]>().notNull().default([]),

  confidence: jsonb('confidence').$type<Record<string, number>>().notNull().default({}),
  evidence: jsonb('evidence').$type<Record<string, string>>().notNull().default({}),

  model: text('model').notNull(),
  /** Bumped when the analysis prompt changes, so stale rows can be re-run. */
  promptVersion: integer('prompt_version').notNull().default(1),
  analysedAt: timestamp('analysed_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ── The comparison, one row per creative per field ──────────────────────── */

export const verdicts = pgTable('verdicts', {
  id: text('id').primaryKey(),
  creativeId: text('creative_id').notNull().references(() => creatives.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),                    // 'hook_type' | 'production_style' | ...
  verifiability: verifiability('verifiability').notNull(),

  claimedValue: text('claimed_value'),
  observedValue: text('observed_value'),
  verdict: verdictKind('verdict').notNull(),
  confidence: real('confidence'),
  evidence: text('evidence'),

  /** The value analytics aggregate on: observed when trusted, else claimed. */
  resolvedValue: text('resolved_value'),
  /** A human decision in the app always wins. Never leaves this database. */
  humanOverride: text('human_override'),
  overriddenBy: text('overridden_by'),
  overriddenAt: timestamp('overridden_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('verdicts_creative_field_idx').on(t.creativeId, t.field),
  index('verdicts_verdict_idx').on(t.verdict),
])

/* ── Keywords for competitor search on Instagram / Ad Library / TikTok ───── */

export const keywords = pgTable('keywords', {
  id: text('id').primaryKey(),
  creativeId: text('creative_id').references(() => creatives.id, { onDelete: 'cascade' }),
  term: text('term').notNull(),
  kind: text('kind').notNull(),                      // 'hook_phrase' | 'pain_point' | 'format' | 'entity'
  /** Short enough to paste into a search box, and specific enough to matter. */
  searchable: boolean('searchable').notNull().default(true),
  weight: real('weight').notNull().default(1),
}, (t) => [
  index('keywords_term_idx').on(t.term),
  index('keywords_creative_idx').on(t.creativeId),
])

/* ── Sync audit trail ────────────────────────────────────────────────────── */

export const syncRuns = pgTable('sync_runs', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  trigger: text('trigger').notNull(),                // 'webhook' | 'nightly' | 'manual'
  tasksSeen: integer('tasks_seen').notNull().default(0),
  tasksUpserted: integer('tasks_upserted').notNull().default(0),
  creativesQueued: integer('creatives_queued').notNull().default(0),
  error: text('error'),
})

import { sql } from 'drizzle-orm'
import { db } from './client'
import { tasks as tasksTable, syncRuns } from './schema'
import type { ClickUpTask } from '../lib/clickup/client'
import { fieldMap } from '../lib/clickup/client'
import { parseTaskName, dedupeKey } from '../lib/parse/taskName'
import { parseBrief } from '../lib/parse/brief'
import { categorise, DECIDED_STATUSES, productByListId } from '../lib/products'

const toDate = (ms?: string | null) => (ms ? new Date(Number(ms)) : null)

/**
 * Upserts the ClickUp mirror.
 *
 * Only `claimed_*` columns are written here — these are ClickUp's assertions
 * about each creative. Nothing in this function writes back to ClickUp, and the
 * observed/verdict columns are left untouched so a re-sync never clobbers
 * analysis results.
 */
export async function persistTasks(all: ClickUpTask[], trigger: string) {
  const runId = `run_${Date.now()}`
  await db.insert(syncRuns).values({ id: runId, trigger, tasksSeen: all.length })

  const seen = new Map<string, string>()
  const rows = []

  for (const task of all) {
    const key = dedupeKey(task.list.id, task.name)
    const duplicateOf = seen.get(key) ?? null
    if (!duplicateOf) seen.set(key, task.id)

    const parsed = parseTaskName(task.name)
    const brief = parseBrief(task.markdown_description ?? task.description)
    const f = fieldMap(task)
    const status = task.status.status.toLowerCase()

    rows.push({
      id: task.id,
      listId: task.list.id,
      productName: productByListId(task.list.id)?.name ?? task.list.name,
      name: task.name,
      url: task.url,
      status,
      category: categorise(status),
      wasTested: (DECIDED_STATUSES as readonly string[]).includes(status),
      dateCreated: toDate(task.date_created),
      dateUpdated: toDate(task.date_updated),
      tags: (task.tags ?? []).map((t) => t.name),
      assignees: (task.assignees ?? []).map((a) => ({ id: a.id, username: a.username })),
      editor: f['Editor'] ?? task.assignees?.[0]?.username ?? null,

      productCode: parsed.productCode,
      serial: parsed.serial,
      inspirationId: parsed.inspirationId,
      legacyIds: parsed.legacyIds,
      variationChain: parsed.variations,
      changedLever: parsed.changedLever,
      igbAngle: parsed.igbAngle,
      parentTaskId: null,

      claimedAngle: f['Angle Tag'] ?? brief.angle,
      claimedPersona: f['Persona Tag'] ?? brief.persona,
      claimedFunnel: f['Funnel Type'] ?? brief.funnel,
      claimedAdType: f['Photo/Video'] ?? brief.adType,
      claimedHookType: f['Hook Type'] ?? brief.hookType,
      claimedCreativeStructure: f['Creative Structure'] ?? brief.creativeStructure,
      claimedProductionStyle: f['Production Style'] ?? brief.productionStyle,
      claimedUsp: f['Creative USP'] ?? null,
      hypothesis: brief.hypothesis,
      notes: f['Notes'] ?? brief.notes,
      driveLink: f['Drive Link'] ?? brief.inspirationLink,
      inspirationLink: brief.inspirationLink,
      inspirationBriefUrl: brief.inspirationBriefUrl,

      rawDescription: task.markdown_description ?? task.description ?? null,
      dedupeKey: key,
      duplicateOfTaskId: duplicateOf,
      syncedAt: new Date(),
    })
  }

  // Chunked so a large workspace does not exceed the parameter limit.
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(tasksTable)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: tasksTable.id,
        set: {
          status: sql`excluded.status`,
          category: sql`excluded.category`,
          wasTested: sql`excluded.was_tested`,
          name: sql`excluded.name`,
          dateUpdated: sql`excluded.date_updated`,
          tags: sql`excluded.tags`,
          assignees: sql`excluded.assignees`,
          editor: sql`excluded.editor`,
          changedLever: sql`excluded.changed_lever`,
          legacyIds: sql`excluded.legacy_ids`,
          variationChain: sql`excluded.variation_chain`,
          claimedAngle: sql`excluded.claimed_angle`,
          claimedPersona: sql`excluded.claimed_persona`,
          claimedFunnel: sql`excluded.claimed_funnel`,
          claimedAdType: sql`excluded.claimed_ad_type`,
          claimedHookType: sql`excluded.claimed_hook_type`,
          claimedCreativeStructure: sql`excluded.claimed_creative_structure`,
          claimedProductionStyle: sql`excluded.claimed_production_style`,
          claimedUsp: sql`excluded.claimed_usp`,
          hypothesis: sql`excluded.hypothesis`,
          notes: sql`excluded.notes`,
          driveLink: sql`excluded.drive_link`,
          rawDescription: sql`excluded.raw_description`,
          duplicateOfTaskId: sql`excluded.duplicate_of_task_id`,
          syncedAt: sql`excluded.synced_at`,
        },
      })
  }

  await db
    .update(syncRuns)
    .set({ finishedAt: new Date(), tasksUpserted: rows.length })
    .where(sql`${syncRuns.id} = ${runId}`)

  return { upserted: rows.length, duplicates: rows.filter((r) => r.duplicateOfTaskId).length }
}

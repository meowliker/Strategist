import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '../../../../db/client'

export const dynamic = 'force-dynamic'

/**
 * Full detail for one creative, read straight from Postgres.
 *
 * Served on demand rather than baked into the snapshot: transcripts alone would
 * add megabytes to a file the dashboard loads on every page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const rows = (await db.execute(sql`
    select
      c.id, c.filename, c.source_file_id, c.variant_index, c.is_video,
      c.duration_sec, c.width, c.height, c.aspect_ratio,
      c.cut_count, c.cuts_per_minute, c.has_voiceover, c.has_music,
      t.id as task_id, t.name as task_name, t.url as task_url,
      t.product_name, t.category::text as category, t.editor,
      t.changed_lever, t.notes, t.drive_link, t.inspiration_link,
      t.claimed_angle, t.claimed_persona, t.claimed_funnel, t.claimed_ad_type,
      t.claimed_hook_type, t.claimed_creative_structure, t.claimed_production_style,
      t.claimed_usp, t.hypothesis as claimed_hypothesis,
      o.observed_angle_signal, o.observed_persona_signal, o.observed_funnel,
      o.observed_ad_type, o.observed_hook_type, o.observed_creative_structure,
      o.observed_production_style, o.hook_text, o.cta_text, o.pain_points,
      o.confidence, o.evidence,
      r.format_description, r.hook_mechanism, r.core_concept, r.creative_hypothesis,
      r.offer, r.offer_mechanism, r.script_arc, r.scenes, r.tactile_elements,
      r.repurposed_signals, r.source_handle,
      tr.text as transcript, tr.segments, tr.hook_spoken,
      (select jsonb_object_agg(v.field, jsonb_build_object(
          'verdict', v.verdict::text, 'claimed', v.claimed_value,
          'observed', v.observed_value, 'confidence', v.confidence))
       from verdicts v where v.creative_id = c.id) as verdicts,
      (select jsonb_agg(jsonb_build_object('term', k.term, 'kind', k.kind))
       from keywords k where k.creative_id = c.id) as keywords
    from creatives c
    join tasks t on t.id = c.task_id
    left join observations o on o.creative_id = c.id
    left join research r on r.creative_id = c.id
    left join transcripts tr on tr.creative_id = c.id
    where c.id = ${id}
    limit 1
  `)) as unknown as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const r = rows[0]
  return NextResponse.json({
    ...r,
    /** Drive's embeddable player for this exact file. */
    previewUrl: r.source_file_id
      ? `https://drive.google.com/file/d/${r.source_file_id}/preview`
      : null,
    watchUrl: r.source_file_id
      ? `https://drive.google.com/file/d/${r.source_file_id}/view`
      : null,
  })
}

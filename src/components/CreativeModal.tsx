'use client'
import { useEffect, useState } from 'react'
import { searchLinks } from '../lib/data/types'

interface Detail {
  id: string; filename: string; task_name: string; task_url: string
  product_name: string; category: string; editor: string | null
  duration_sec: number | null; aspect_ratio: string | null
  cut_count: number | null; cuts_per_minute: number | null
  has_voiceover: boolean | null; has_music: boolean | null
  drive_link: string | null; inspiration_link: string | null
  previewUrl: string | null; watchUrl: string | null
  hook_text: string | null; cta_text: string | null; hook_spoken: string | null
  pain_points: string[] | null
  transcript: string | null
  segments: { start: number; end: number; text: string }[] | null
  format_description: string | null; hook_mechanism: string | null
  core_concept: string | null; creative_hypothesis: string | null
  offer: string | null; offer_mechanism: string | null
  script_arc: { beat: string; detail: string }[] | null
  scenes: { n: number; visual: string; onScreenText: string }[] | null
  tactile_elements: string[] | null
  repurposed_signals: string | null; source_handle: string | null
  claimed_angle: string | null; claimed_persona: string | null
  claimed_hook_type: string | null; claimed_creative_structure: string | null
  claimed_production_style: string | null; claimed_funnel: string | null
  claimed_usp: string | null; notes: string | null
  observed_angle_signal: string | null; observed_persona_signal: string | null
  observed_hook_type: string | null; observed_creative_structure: string | null
  observed_production_style: string | null; observed_funnel: string | null
  verdicts: Record<string, { verdict: string; claimed: string | null; observed: string | null; confidence: number | null }> | null
  keywords: { term: string; kind: string }[] | null
}

const VERDICT_LABEL: Record<string, string> = {
  match: 'agree', mismatch: 'ClickUp wrong', missing: 'ClickUp blank',
  differs: 'two views', unverifiable: 'not verifiable',
}
const TIER: Record<string, string> = {
  winner: 'Winner', mild_winner: 'Mild Winner', scale: 'Scale', loser: 'Loser', untested: 'Untested',
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * The voiceover as flowing prose, with the timestamps stripped.
 *
 * Whisper's own transcript is preferred — its segments are cut on pauses, not
 * sentences, so rejoining them re-inserts spaces mid-sentence.
 */
function plainTranscript(d: Detail): string {
  if (d.transcript?.trim()) return d.transcript.trim()
  return (d.segments ?? []).map((s) => s.text.trim()).filter(Boolean).join(' ')
}

/**
 * Copies text, falling back to a hidden textarea.
 *
 * The async Clipboard API is refused in a few ordinary situations — an insecure
 * origin, a denied permission, a click the browser does not treat as user
 * activation — and the textarea path still works in most of them.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* fall through */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function CopyButton({
  text, copied, setCopied,
}: { text: string; copied: boolean; setCopied: (v: boolean) => void }) {
  const [failed, setFailed] = useState(false)
  if (!text) return null
  return (
    <button
      className={`mdl-copy${copied ? ' done' : ''}`}
      onClick={async () => {
        if (await copyText(text)) {
          setFailed(false); setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } else {
          // Say so rather than appear to have worked.
          setFailed(true)
          setTimeout(() => setFailed(false), 2500)
        }
      }}
      title="Copy the voiceover without timestamps"
    >
      {failed ? 'Copy blocked' : copied ? '✓ Copied' : 'Copy text'}
    </button>
  )
}

function Row({ label, field, d }: { label: string; field: string; d: Detail }) {
  const v = d.verdicts?.[field]
  if (!v || (!v.claimed && !v.observed)) return null
  return (
    <div className="dv">
      <div className="dv-hd">
        <span className="dv-fld">{label}</span>
        <span className={`vb ${v.verdict}`}>{VERDICT_LABEL[v.verdict] ?? v.verdict}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">ClickUp</span>
        <span className={`dv-val${v.claimed ? '' : ' none'}`}>{v.claimed ?? 'not set'}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">Creative</span>
        <span className={`dv-val${v.observed ? '' : ' none'}`}>{v.observed ?? 'not read'}</span>
        {v.confidence != null && v.observed && (
          <span className="dv-conf">{Math.round(v.confidence * 100)}%</span>
        )}
      </div>
    </div>
  )
}

export default function CreativeModal({
  creativeId, onClose,
}: { creativeId: string | null; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'summary' | 'transcript' | 'compare'>('summary')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!creativeId) { setD(null); return }
    setLoading(true); setTab('summary'); setCopied(false)
    fetch(`/api/creative/${creativeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setD)
      .finally(() => setLoading(false))
  }, [creativeId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const open = Boolean(creativeId)

  return (
    <>
      <div id="mov" className={open ? 'open' : ''} onClick={onClose} />
      <div id="modal" className={open ? 'open' : ''}>
        <div className="mdl" role="dialog" aria-modal="true" aria-label="Creative detail">
          <div className="mdl-hd">
            <div>
              <div className="mdl-ttl">{d?.filename ?? (loading ? 'Loading…' : '')}</div>
              {d && (
                <div className="mdl-sub">
                  <span>{TIER[d.category] ?? d.category}</span>
                  <span>{d.product_name}</span>
                  {d.duration_sec != null && <span>{d.duration_sec.toFixed(1)}s</span>}
                  {d.aspect_ratio && <span>{d.aspect_ratio}</span>}
                  {d.cuts_per_minute != null && <span>{d.cuts_per_minute.toFixed(0)} cuts/min</span>}
                  {d.source_handle && <span>source {d.source_handle}</span>}
                  <a href={d.task_url} target="_blank" rel="noopener">{d.task_name} ↗</a>
                </div>
              )}
            </div>
            <button className="tp-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {d && (
            <div className="mdl-tabs">
              {(['summary', 'transcript', 'compare'] as const).map((t) => (
                <button key={t} className={`mdl-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'summary' ? 'Summary' : t === 'transcript' ? 'Transcript' : 'ClickUp vs Creative'}
                </button>
              ))}
            </div>
          )}

          <div className="mdl-body">
            <div className="mdl-left">
              {d?.previewUrl ? (
                <div className="vid">
                  <iframe src={d.previewUrl} allow="autoplay" allowFullScreen title={d.filename} />
                </div>
              ) : (
                <div className="vid-none">
                  {loading ? 'Loading…' : 'No player — this creative has no Drive file on record.'}
                </div>
              )}

              {d && (
                <>
                  <div className="mdl-facts">
                    {d.watchUrl && (
                      <div className="mdl-fact">
                        <span className="mdl-fact-k">Drive file</span>
                        <a className="mdl-fact-v" href={d.watchUrl} target="_blank" rel="noopener">Open ↗</a>
                      </div>
                    )}
                    {d.drive_link && (
                      <div className="mdl-fact">
                        <span className="mdl-fact-k">Task folder</span>
                        <a className="mdl-fact-v" href={d.drive_link} target="_blank" rel="noopener">Open ↗</a>
                      </div>
                    )}
                    {d.inspiration_link && (
                      <div className="mdl-fact">
                        <span className="mdl-fact-k">Inspiration</span>
                        <a className="mdl-fact-v" href={d.inspiration_link} target="_blank" rel="noopener">Open ↗</a>
                      </div>
                    )}
                    <div className="mdl-fact">
                      <span className="mdl-fact-k">Audio</span>
                      <span className="mdl-fact-v">
                        {d.has_voiceover ? 'Voiceover' : d.has_music ? 'Music only' : 'Silent'}
                      </span>
                    </div>
                    {d.editor && (
                      <div className="mdl-fact"><span className="mdl-fact-k">Editor</span><span className="mdl-fact-v">{d.editor}</span></div>
                    )}
                  </div>

                  {d.keywords && d.keywords.length > 0 && (
                    <div>
                      <div className="mdl-sec-l">Search these on IG / Ad Library / TikTok</div>
                      <div className="mdl-kw">
                        {d.keywords.slice(0, 12).map((k, i) => (
                          <a key={i} href={searchLinks(k.term).adLibrary} target="_blank" rel="noopener">
                            {k.term}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mdl-right">
              {!d && <div className="mdl-p dim">{loading ? 'Loading…' : 'Nothing to show.'}</div>}

              {d && tab === 'summary' && (
                <>
                  {d.hook_text && (
                    <div>
                      <div className="mdl-sec-l">Hook — text on screen</div>
                      <div className="mdl-quote">&ldquo;{d.hook_text}&rdquo;</div>
                    </div>
                  )}
                  {d.hook_spoken && (
                    <div>
                      <div className="mdl-sec-l">Hook — first words spoken</div>
                      <div className="mdl-quote">&ldquo;{d.hook_spoken}&rdquo;</div>
                    </div>
                  )}
                  {d.hook_mechanism && (
                    <div>
                      <div className="mdl-sec-l">How the hook works</div>
                      <p className="mdl-p">{d.hook_mechanism}</p>
                    </div>
                  )}
                  {d.offer && (
                    <div>
                      <div className="mdl-sec-l">The offer</div>
                      <p className="mdl-p">{d.offer}</p>
                      {d.offer_mechanism && <p className="mdl-p dim" style={{ marginTop: 6 }}>Framed as: {d.offer_mechanism}</p>}
                    </div>
                  )}
                  {d.cta_text && (
                    <div>
                      <div className="mdl-sec-l">Call to action</div>
                      <div className="mdl-quote">&ldquo;{d.cta_text}&rdquo;</div>
                    </div>
                  )}
                  {d.format_description && (
                    <div>
                      <div className="mdl-sec-l">Format</div>
                      <p className="mdl-p">{d.format_description}</p>
                    </div>
                  )}
                  {d.core_concept && (
                    <div>
                      <div className="mdl-sec-l">What this creative is</div>
                      <p className="mdl-p">{d.core_concept}</p>
                    </div>
                  )}
                  {d.creative_hypothesis && (
                    <div>
                      <div className="mdl-sec-l">The bet it makes</div>
                      <p className="mdl-p">{d.creative_hypothesis}</p>
                    </div>
                  )}
                  {d.script_arc && d.script_arc.length > 0 && (
                    <div>
                      <div className="mdl-sec-l">How it unfolds</div>
                      <ol className="rs-arc">
                        {d.script_arc.map((b, i) => (
                          <li key={i}>
                            <span className="rs-beat">{b.beat}</span>
                            {b.detail && <> — <span className="rs-detail">{b.detail}</span></>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {d.scenes && d.scenes.length > 0 && (
                    <div>
                      <div className="mdl-sec-l">Scene by scene</div>
                      <ol className="rs-arc">
                        {d.scenes.map((s) => (
                          <li key={s.n}>
                            <span className="rs-detail">{s.visual}</span>
                            {s.onScreenText && <> — <span className="rs-beat">&ldquo;{s.onScreenText}&rdquo;</span></>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {d.pain_points && d.pain_points.length > 0 && (
                    <div>
                      <div className="mdl-sec-l">Pain points it names</div>
                      <div className="rs-chips">
                        {d.pain_points.map((p, i) => <span className="rs-chip" key={i}>{p}</span>)}
                      </div>
                    </div>
                  )}
                  {d.tactile_elements && d.tactile_elements.length > 0 && (
                    <div>
                      <div className="mdl-sec-l">What&rsquo;s physically on screen</div>
                      <div className="rs-chips">
                        {d.tactile_elements.map((t, i) => <span className="rs-chip" key={i}>{t}</span>)}
                      </div>
                    </div>
                  )}
                  {d.repurposed_signals && (
                    <div>
                      <div className="mdl-sec-l">Repurposed or made for ads?</div>
                      <p className="mdl-p dim">{d.repurposed_signals}</p>
                    </div>
                  )}
                  {!d.format_description && (
                    <p className="mdl-p dim">
                      This creative has been watched but not yet given the deeper strategic read.
                      Run <code>npm run enrich</code>.
                    </p>
                  )}
                </>
              )}

              {d && tab === 'transcript' && (
                <>
                  {d.segments && d.segments.length > 0 ? (
                    <div>
                      <div className="mdl-sec-row">
                        <div className="mdl-sec-l">Voiceover, timestamped</div>
                        <CopyButton text={plainTranscript(d)} copied={copied} setCopied={setCopied} />
                      </div>
                      <div className="mdl-tx" style={{ whiteSpace: 'normal' }}>
                        {d.segments.map((s, i) => (
                          <div className="mdl-seg" key={i}>
                            <span className="mdl-seg-t">{mmss(s.start)}</span>
                            <span>{s.text.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : d.transcript ? (
                    <div>
                      <div className="mdl-sec-row">
                        <div className="mdl-sec-l">Voiceover</div>
                        <CopyButton text={plainTranscript(d)} copied={copied} setCopied={setCopied} />
                      </div>
                      <div className="mdl-tx">{d.transcript}</div>
                    </div>
                  ) : (
                    <p className="mdl-p dim">
                      No speech in this creative — it is carried by music and on-screen captions.
                      The scene breakdown on the Summary tab has the on-screen text.
                    </p>
                  )}
                </>
              )}

              {d && tab === 'compare' && (
                <>
                  <p className="mdl-p dim">
                    The creative was classified without sight of its ClickUp label. Angle and
                    Persona describe intent, so a difference there is two readings — not an error.
                  </p>
                  <Row label="Angle" field="angle" d={d} />
                  <Row label="Persona" field="persona" d={d} />
                  <Row label="Hook Type" field="hook_type" d={d} />
                  <Row label="Creative Structure" field="creative_structure" d={d} />
                  <Row label="Production Style" field="production_style" d={d} />
                  <Row label="Funnel" field="funnel" d={d} />
                  <Row label="Photo / Video" field="ad_type" d={d} />
                  {d.claimed_usp && (
                    <div>
                      <div className="mdl-sec-l">Creative USP (from ClickUp)</div>
                      <p className="mdl-p">{d.claimed_usp}</p>
                    </div>
                  )}
                  {d.notes && (
                    <div>
                      <div className="mdl-sec-l">Notes (from ClickUp)</div>
                      <p className="mdl-p dim">{d.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

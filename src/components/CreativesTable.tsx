'use client'
import { useMemo, useState } from 'react'
import type { CreativeRow, DualValue, Snapshot } from '../lib/data/types'
import { PRODUCT_LABEL } from '../lib/data/types'

const VERDICT_LABEL: Record<string, string> = {
  match: 'agree', mismatch: 'ClickUp wrong', missing: 'ClickUp blank',
  differs: 'two views', unverifiable: 'not verifiable',
}

type View = 'watched' | 'winners' | 'all'

/**
 * Both readings of one field. For Angle and Persona neither side is
 * authoritative — the creative signals intent but cannot prove it — so they are
 * shown as two views rather than a correction.
 */
function Dual({ field, v }: { field: string; v?: DualValue }) {
  if (!v || (!v.claimed && !v.observed)) return null
  return (
    <div className="dv">
      <div className="dv-hd">
        <span className="dv-fld">{field}</span>
        <span className={`vb ${v.verdict}`}>{VERDICT_LABEL[v.verdict] ?? v.verdict}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">ClickUp</span>
        <span className={`dv-val${v.claimed ? '' : ' none'}`}>{v.claimed ?? 'not set'}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">Creative</span>
        <span className={`dv-val${v.observed ? '' : ' none'}`}>{v.observed ?? 'not analysed'}</span>
        {v.confidence !== null && v.observed && (
          <span className="dv-conf">{Math.round(v.confidence * 100)}%</span>
        )}
      </div>
      {v.rationale && <div className="dv-why">{v.rationale}</div>}
    </div>
  )
}

const AV = ['av-a', 'av-b', 'av-c', 'av-d']
const avatar = (n: string | null) => {
  if (!n) return 'av-un'
  let h = 0
  for (const ch of n) h = (h + ch.charCodeAt(0)) % 997
  return AV[h % AV.length]
}
const initials = (n: string | null) =>
  !n ? '?' : (n.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase()

export default function CreativesTable({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<View>('watched')
  const [panel, setPanel] = useState<CreativeRow | null>(null)

  const rows = useMemo(() => {
    if (view === 'watched') return snapshot.creatives.filter((c) => c.analysed)
    if (view === 'winners') {
      return snapshot.creatives.filter(
        (c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale',
      )
    }
    return snapshot.creatives
  }, [view, snapshot.creatives])

  const VIEWS: { key: View; label: string; count: number }[] = [
    { key: 'watched', label: 'Watched', count: snapshot.creatives.filter((c) => c.analysed).length },
    { key: 'winners', label: 'Winners', count: new Set(snapshot.creatives.filter((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale').map((c) => c.taskId)).size },
    { key: 'all', label: 'All tasks', count: snapshot.creatives.length },
  ]

  return (
    <>
      <div className="filt">
        {VIEWS.map((v) => (
          <button key={v.key} className={`fb${view === v.key ? ' on' : ''}`}
            onClick={() => setView(v.key)}>{v.label} · {v.count}</button>
        ))}
        <span className="fc">{rows.length} shown</span>
      </div>

      <div className="t-hd">
        <div className="t-hd-c" />
        <div className="t-hd-c">Creative</div>
        <div className="t-hd-c hs">Angle — ClickUp / Creative</div>
        <div className="t-hd-c">Product</div>
        <div className="t-hd-c">Status</div>
        <div className="t-hd-c hs">Owner</div>
      </div>

      <div>
        {rows.length === 0 && (
          <div className="empty">
            Nothing here yet. Creatives appear here once their video file has been watched.
          </div>
        )}
        {rows.map((c) => (
          <div key={c.creativeId ?? c.taskId} className="t-row" tabIndex={0} role="button"
            aria-label={`${c.name} — ${c.statusLabel}`}
            onClick={() => setPanel(c)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanel(c) } }}>
            <div className={`t-stripe ${c.product}`} />
            <div className="t-c"><span className="t-id">{c.name}</span></div>
            <div className="t-c hs">
              <span className="t-hook">
                {c.angle?.claimed ?? '—'}
                {c.angle?.observed && c.angle.verdict !== 'match' && (
                  <span style={{ color: 'var(--ca)', fontStyle: 'normal' }}> → {c.angle.observed}</span>
                )}
              </span>
            </div>
            <div className="t-c"><span className={`t-ang ${c.product}`}>{c.product.toUpperCase()}</span></div>
            <div className="t-c"><div className="t-st"><div className={`std ${c.status}`} /><span className="stt">{c.statusLabel}</span></div></div>
            <div className="t-c hs">
              <div className="t-who">
                <div className={`av ${avatar(c.assignee)}`}>{initials(c.assignee)}</div>
                <span className="av-nm">{c.assignee ?? 'Unassigned'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div id="tov" className={panel ? 'open' : ''} onClick={() => setPanel(null)} />
      <aside id="tpanel" className={panel ? 'open' : ''} role="dialog" aria-modal="true"
        aria-label="Creative detail">
        <div className="tp-hdr">
          <div className="tp-name">{panel?.name ?? ''}</div>
          <button className="tp-close" onClick={() => setPanel(null)} aria-label="Close">✕</button>
        </div>
        {panel && (
          <div className="tp-body">
            <div><span className={`tp-angle-badge ${panel.product}`}>{PRODUCT_LABEL[panel.product]}</span></div>

            {panel.hook && (
              <div>
                <div className="tp-hook-lbl">
                  {panel.analysed ? 'Hook (read from the creative)' : 'Note (claimed in ClickUp)'}
                </div>
                <div className="tp-hook">{panel.hook}</div>
              </div>
            )}

            <div className="tp-kv">
              <div className="tp-kv-r"><span className="tp-kv-k">Status</span><span className="tp-kv-v">{panel.statusLabel}</span></div>
              {panel.changedLever && (
                <div className="tp-kv-r"><span className="tp-kv-k">Lever changed</span><span className="tp-kv-v">{panel.changedLever}</span></div>
              )}
              {panel.durationSec != null && (
                <div className="tp-kv-r"><span className="tp-kv-k">Duration</span><span className="tp-kv-v">{panel.durationSec.toFixed(1)}s</span></div>
              )}
              {panel.cutsPerMinute != null && (
                <div className="tp-kv-r"><span className="tp-kv-k">Cut rate</span><span className="tp-kv-v">{panel.cutsPerMinute.toFixed(0)}/min</span></div>
              )}
              <div className="tp-kv-r"><span className="tp-kv-k">Owner</span><span className="tp-kv-v">{panel.assignee ?? 'Unassigned'}</span></div>
            </div>

            {panel.analysed ? (
              <div>
                <div className="tp-hook-lbl">ClickUp vs. the creative</div>
                <Dual field="Angle" v={panel.angle} />
                <Dual field="Persona" v={panel.persona} />
                <Dual field="Production Style" v={panel.productionStyle} />
                <Dual field="Creative Structure" v={panel.creativeStructure} />
                <Dual field="Hook Type" v={panel.hookType} />
              </div>
            ) : (
              <div className="empty" style={{ padding: 0, fontSize: 12 }}>
                This creative has not been read yet, so only ClickUp&rsquo;s side exists.
              </div>
            )}

            <div className="tp-actions">
              <a className="tp-btn tp-btn-primary" href={panel.url} target="_blank" rel="noopener">
                Open in ClickUp ↗
              </a>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

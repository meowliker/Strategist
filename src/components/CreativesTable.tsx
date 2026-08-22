'use client'
import { useMemo, useState } from 'react'
import type { Snapshot } from '../lib/data/types'
import CreativeModal from './CreativeModal'

type View = 'watched' | 'winners' | 'music' | 'voiceover' | 'all'

const isMusicStyle = (c: { productionStyle?: { claimed?: string | null; observed?: string | null }; hookType?: { claimed?: string | null; observed?: string | null } }) => {
  const text = [c.productionStyle?.observed, c.productionStyle?.claimed, c.hookType?.observed, c.hookType?.claimed]
    .filter(Boolean).join(' ').toLowerCase()
  return /music|song|ugc.music|sound.on|caption.only|caption.led|no.voiceover|no.vo\b/.test(text)
}

const isVoiceoverStyle = (c: { productionStyle?: { claimed?: string | null; observed?: string | null }; hookType?: { claimed?: string | null; observed?: string | null } }) => {
  const text = [c.productionStyle?.observed, c.productionStyle?.claimed, c.hookType?.observed, c.hookType?.claimed]
    .filter(Boolean).join(' ').toLowerCase()
  return /voiceover|voice.over|\bvo\b|narrat|spoken|talking.head|to.camera/.test(text)
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
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const inView = useMemo(() => {
    if (view === 'watched') return snapshot.creatives.filter((c) => c.analysed)
    if (view === 'winners') return snapshot.creatives.filter((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale')
    if (view === 'music') return snapshot.creatives.filter((c) => c.analysed && isMusicStyle(c))
    if (view === 'voiceover') return snapshot.creatives.filter((c) => c.analysed && isVoiceoverStyle(c))
    return snapshot.creatives
  }, [view, snapshot.creatives])

  /**
   * Free-text search across the fields someone would actually recall: the file,
   * the task it came from, either reading of the angle, and who owned it.
   * Terms are ANDed so "adhd hook" narrows rather than widens.
   */
  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return inView
    return inView.filter((c) => {
      const hay = [
        c.name, c.taskName, c.assignee, c.changedLever,
        c.angle?.claimed, c.angle?.observed,
        c.persona?.claimed, c.persona?.observed,
        c.statusLabel, c.productName,
      ].filter(Boolean).join(' ').toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [inView, query])

  const VIEWS: { key: View; label: string; count: number }[] = [
    { key: 'watched', label: 'Watched', count: snapshot.creatives.filter((c) => c.analysed).length },
    {
      key: 'winners', label: 'Winners',
      count: new Set(
        snapshot.creatives
          .filter((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale')
          .map((c) => c.taskId),
      ).size,
    },
    { key: 'music', label: '🎵 Music', count: snapshot.creatives.filter((c) => c.analysed && isMusicStyle(c)).length },
    { key: 'voiceover', label: '🎙 Voiceover', count: snapshot.creatives.filter((c) => c.analysed && isVoiceoverStyle(c)).length },
    { key: 'all', label: 'All tasks', count: snapshot.creatives.length },
  ]

  return (
    <>
      <div className="filt">
        {VIEWS.map((v) => (
          <button key={v.key} className={`fb${view === v.key ? ' on' : ''}`}
            onClick={() => setView(v.key)}>{v.label} · {v.count}</button>
        ))}
        <div className="srch">
          <input
            className="srch-in"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search task, file, angle, owner…"
            aria-label="Search creatives"
          />
          {query && (
            <button className="srch-x" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <span className="fc">
          {rows.length} shown{query && inView.length !== rows.length ? ` of ${inView.length}` : ''}
        </span>
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
            {query
              ? <>No creative matches &ldquo;{query}&rdquo; in this view. Try the All tasks tab, or clear the search.</>
              : 'Nothing here yet. Creatives appear once their video file has been watched.'}
          </div>
        )}
        {rows.map((c) => {
          const openable = Boolean(c.creativeId)
          return (
            <div key={c.creativeId ?? c.taskId}
              className="t-row"
              tabIndex={openable ? 0 : -1}
              role={openable ? 'button' : undefined}
              aria-label={`${c.name} — ${c.statusLabel}`}
              style={openable ? undefined : { opacity: 0.72 }}
              onClick={() => openable && setOpenId(c.creativeId!)}
              onKeyDown={(e) => {
                if (openable && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setOpenId(c.creativeId!)
                }
              }}>
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
              <div className="t-c">
                <div className="t-st"><div className={`std ${c.status}`} /><span className="stt">{c.statusLabel}</span></div>
              </div>
              <div className="t-c hs">
                <div className="t-who">
                  <div className={`av ${avatar(c.assignee)}`}>{initials(c.assignee)}</div>
                  <span className="av-nm">{c.assignee ?? 'Unassigned'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <CreativeModal creativeId={openId} onClose={() => setOpenId(null)} />
    </>
  )
}

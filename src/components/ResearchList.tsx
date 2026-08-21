'use client'
import { useMemo, useState } from 'react'
import type { ResearchCard } from '../lib/data/research'

/** The teardown body, shown once a row is expanded. */
function Body({ r }: { r: ResearchCard }) {
  return (
    <div className="rl-body">
      <p className="rs-format">{r.formatDescription}</p>

      {r.hookText && <div className="rs-hook">&ldquo;{r.hookText}&rdquo;</div>}

      <div className="rs-grid">
        <div>
          <div className="rs-blk-l">Hook mechanism</div>
          <div className="rs-blk-v">{r.hookMechanism}</div>
        </div>
        <div>
          <div className="rs-blk-l">Core concept</div>
          <div className="rs-blk-v">{r.coreConcept}</div>
        </div>
        <div>
          <div className="rs-blk-l">The bet it makes</div>
          <div className="rs-blk-v">{r.creativeHypothesis}</div>
        </div>
      </div>

      {r.offer && (
        <div style={{ marginBottom: 20 }}>
          <div className="rs-blk-l">The offer</div>
          <div className="rs-blk-v">{r.offer}</div>
          {r.offerMechanism && (
            <div className="rs-blk-v" style={{ color: 'var(--ink2)', marginTop: 5 }}>
              Framed as: {r.offerMechanism}
            </div>
          )}
        </div>
      )}

      {r.scriptArc.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="rs-blk-l">Script arc</div>
          <ol className="rs-arc">
            {r.scriptArc.map((b, i) => (
              <li key={i}>
                <span className="rs-beat">{b.beat}</span>
                {b.detail && <> — <span className="rs-detail">{b.detail}</span></>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {r.scenes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="rs-blk-l">Scene breakdown</div>
          <ol className="rs-arc">
            {r.scenes.map((s) => (
              <li key={s.n}>
                <span className="rs-detail">{s.visual}</span>
                {s.onScreenText && <> — <span className="rs-beat">&ldquo;{s.onScreenText}&rdquo;</span></>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {r.tactileElements.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="rs-blk-l">On screen</div>
          <div className="rs-chips">
            {r.tactileElements.map((t, i) => <span className="rs-chip" key={i}>{t}</span>)}
          </div>
        </div>
      )}

      {r.repurposedSignals && (
        <div style={{ marginBottom: 16 }}>
          <div className="rs-blk-l">Repurposed or produced?</div>
          <div className="rs-blk-v" style={{ color: 'var(--ink2)' }}>{r.repurposedSignals}</div>
        </div>
      )}

      <a className="rl-btn" href={r.taskUrl} target="_blank" rel="noopener"
        style={{ display: 'inline-block' }}>
        Open {r.taskName} ↗
      </a>
    </div>
  )
}

export default function ResearchList({
  cards, label,
}: { cards: ResearchCard[]; label: string }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())

  /**
   * Search across the fields someone would recall — the file, the task it came
   * from, the mechanism, the hook wording, the format. Terms are ANDed.
   */
  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return cards
    return cards.filter((c) => {
      const hay = [
        c.filename, c.taskName, c.hookMechanism, c.hookText, c.formatDescription,
        c.coreConcept, c.tierLabel, c.sourceHandle,
      ].filter(Boolean).join(' ').toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [cards, query])

  const allOpen = rows.length > 0 && rows.every((r) => open.has(r.creativeId))

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <>
      <div className="rl-bar">
        <div className="srch">
          <input
            className="srch-in"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label} by task, file, hook…`}
            aria-label={`Search ${label}`}
          />
          {query && (
            <button className="srch-x" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
          )}
        </div>
        <button
          className="rl-btn"
          onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((r) => r.creativeId)))}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
        <span className="rl-count">
          {rows.length}{query && rows.length !== cards.length ? ` of ${cards.length}` : ''} shown
        </span>
      </div>

      {rows.length === 0 && (
        <div className="empty">
          {query ? <>Nothing matches &ldquo;{query}&rdquo;.</> : 'Nothing analysed yet in this view.'}
        </div>
      )}

      {rows.map((r) => {
        const isOpen = open.has(r.creativeId)
        return (
          <div className={`rl-item${isOpen ? ' open' : ''}`} key={r.creativeId}>
            <button
              className="rl-head"
              aria-expanded={isOpen}
              onClick={() => toggle(r.creativeId)}
            >
              <span className={`rl-stripe ${r.tier}`} />
              <span className="rl-file">{r.filename}</span>
              <span className="rl-tier">{r.tierLabel}</span>
              <span className="rl-mech">
                {r.hookText ? `“${r.hookText}”` : r.hookMechanism}
              </span>
              <span className="rl-car">▶</span>
            </button>
            {isOpen && <Body r={r} />}
          </div>
        )
      })}
    </>
  )
}

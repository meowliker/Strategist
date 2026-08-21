import { readProduct } from '../../lib/data/select'
import { loadResearch, loadSynthesis, type ResearchCard } from '../../lib/data/research'

export const dynamic = 'force-dynamic'

function Card({ r }: { r: ResearchCard }) {
  return (
    <div className="rs">
      <div className="rs-hd">
        <span className="rs-name">{r.filename}</span>
        <span className={`rs-tier ${r.tier}`}>{r.tierLabel}</span>
        <a className="rs-task" href={r.taskUrl} target="_blank" rel="noopener">{r.taskName} ↗</a>
        {r.sourceHandle && <span className="rs-task">source {r.sourceHandle}</span>}
      </div>

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
        <div>
          <div className="rs-blk-l">Repurposed or produced?</div>
          <div className="rs-blk-v" style={{ color: 'var(--ink2)' }}>{r.repurposedSignals}</div>
        </div>
      )}
    </div>
  )
}

export default async function Research({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const [cards, syntheses] = await Promise.all([loadResearch(product), loadSynthesis(product)])

  const winners = cards.filter((c) => c.tier !== 'loss' && c.tier !== 'un')
  const losers = cards.filter((c) => c.tier === 'loss')

  return (
    <>
      <div className="phead">
        <p className="phead-ey">06 · Research</p>
        <h1 className="phead-ttl">Why they won</h1>
        <p className="phead-sub">
          Every analysed creative taken apart: the format, the mechanism the hook pulls, the beats
          the argument moves through, and what is physically on screen. Read from the footage —
          no brief, no labels.
        </p>
      </div>

      {syntheses.map((s) => (
        <section key={s.productKey}>
          {s.topPattern && (
            <div className="sy-top">
              <div className="sy-top-l">
                {s.productName} · the pattern to replicate ·
                {' '}{s.winnersAnalysed} winning / {s.losersAnalysed} losing creatives
              </div>
              <div className="sy-top-v">{s.topPattern}</div>
            </div>
          )}

          {s.hookFormulas.length > 0 && (
            <>
              <div className="sec-hdr">
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>Hook formulas that worked</h2>
                <span className="sec-sub">ranked on this product&rsquo;s own data</span>
              </div>
              <div className="d-list">
                {s.hookFormulas.map((f) => (
                  <div className="d-it" key={f.rank}>
                    <div className="d-n">{String(f.rank).padStart(2, '0')}</div>
                    <div className="d-stripe" style={{ background: 'var(--g)' }} />
                    <div className="d-nm">{f.hookType}</div>
                    <div className="d-fmt">{f.wins}W / {f.losses}L</div>
                    <div className="d-ds">&ldquo;{f.example}&rdquo;</div>
                    <div className="d-ds">{f.whyItWorks}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {s.winnerVsMild.length > 0 && (
            <>
              <div className="sec-hdr">
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>Winners vs. mild winners</h2>
              </div>
              <div style={{ padding: '0 48px 28px' }}>
                <ul className="sy-list">
                  {s.winnerVsMild.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </>
          )}

          {s.huntFor.length > 0 && (
            <>
              <div className="sec-hdr">
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>What to hunt for</h2>
                <span className="sec-sub">competitor content worth adapting</span>
              </div>
              {s.huntFor.map((h) => (
                <div className="sy-hunt" key={h.priority}>
                  <div className="sy-pri">#{h.priority} PRIORITY</div>
                  <div className="sy-title">{h.title}</div>
                  <div className="sy-ev">{h.evidence}</div>
                  <div className="sy-cols">
                    <div>
                      <div className="rs-blk-l">What to look for</div>
                      <ul className="sy-list">{h.lookFor.map((l, i) => <li key={i}>{l}</li>)}</ul>
                    </div>
                    <div>
                      <div className="rs-blk-l">Signals it&rsquo;s the right content</div>
                      <ul className="sy-list">{h.signals.map((l, i) => <li key={i}>{l}</li>)}</ul>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {s.avoid.length > 0 && (
            <>
              <div className="sec-hdr">
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>What to avoid</h2>
                <span className="sec-sub">grounded in what lost here</span>
              </div>
              <div style={{ padding: '0 48px 30px' }}>
                <ul className="sy-list sy-avoid">
                  {s.avoid.map((a, i) => (
                    <li key={i}><strong style={{ color: 'var(--ink)' }}>{a.thing}</strong> — {a.reason}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      ))}

      <div className="sec-hdr">
        <h2 className="sec-ttl" style={{ fontSize: 26 }}>Winning creatives, taken apart</h2>
        <span className="sec-sub">{winners.length} analysed</span>
      </div>
      {winners.length === 0 && (
        <div className="empty">
          Nothing analysed yet in this view. Run <code>npm run enrich</code>.
        </div>
      )}
      {winners.map((r) => <Card key={r.creativeId} r={r} />)}

      {losers.length > 0 && (
        <>
          <div className="sec-hdr">
            <h2 className="sec-ttl" style={{ fontSize: 26 }}>What lost</h2>
            <span className="sec-sub">{losers.length} analysed — the contrast is the lesson</span>
          </div>
          {losers.map((r) => <Card key={r.creativeId} r={r} />)}
        </>
      )}
    </>
  )
}

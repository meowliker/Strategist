import { readProduct } from '../../lib/data/select'
import { loadResearch, loadSynthesis, loadCombinations } from '../../lib/data/research'
import ResearchList from '../../components/ResearchList'

export const dynamic = 'force-dynamic'

export default async function Research({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const [cards, syntheses, combos] = await Promise.all([loadResearch(product), loadSynthesis(product), loadCombinations(product)])

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

      {syntheses.length === 0 && cards.length > 0 && (
        <div className="empty">
          The cross-creative synthesis — hook formulas ranked, winners vs mild winners, what to
          hunt for — has not been generated for this view yet. Run <code>npm run synthesize</code>.
        </div>
      )}

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

      {(combos.bets.length > 0 || combos.dying.length > 0) && (
        <section>
          {combos.bets.length > 0 && (
            <>
              <div className="sec-hdr">
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>Combinations to bet on</h2>
                <span className="sec-sub">angle × persona × hook type — ranked by wins</span>
              </div>
              <div className="combo-list">
                {combos.bets.map((c, i) => (
                  <div className="combo-row" key={i}>
                    <div className="combo-n">{String(i + 1).padStart(2, '0')}</div>
                    <div className="combo-body">
                      <span className="combo-tag">{c.angle}</span>
                      <span className="combo-sep">×</span>
                      <span className="combo-tag">{c.persona}</span>
                      <span className="combo-sep">×</span>
                      <span className="combo-tag">{c.hookType}</span>
                    </div>
                    <div className="combo-score">
                      <span className="combo-w">{c.wins}W</span>
                      {c.losses > 0 && <span className="combo-l"> / {c.losses}L</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {combos.dying.length === 0 && losers.length === 0 && (
            <div className="combo-notice">
              ⚠ No losers marked for this product yet — the &ldquo;What&rsquo;s dying&rdquo; comparison can&rsquo;t be built.
              Mark losing tasks in ClickUp, sync, and re-enrich to see what&rsquo;s not working.
            </div>
          )}

          {combos.dying.length > 0 && (
            <>
              <div className="sec-hdr" style={{ marginTop: 32 }}>
                <h2 className="sec-ttl" style={{ fontSize: 22 }}>What&rsquo;s dying — don&rsquo;t bother</h2>
                <span className="sec-sub">0 wins, at least 1 loss</span>
              </div>
              <div className="combo-list dying">
                {combos.dying.map((c, i) => (
                  <div className="combo-row" key={i}>
                    <div className="combo-n">✗</div>
                    <div className="combo-body">
                      <span className="combo-tag">{c.angle}</span>
                      <span className="combo-sep">×</span>
                      <span className="combo-tag">{c.persona}</span>
                      <span className="combo-sep">×</span>
                      <span className="combo-tag">{c.hookType}</span>
                    </div>
                    <div className="combo-score combo-l">{c.losses}L</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {combos.fadingPatterns.length > 0 && (
            <div style={{ padding: '16px 48px 0' }}>
              <ul className="sy-list sy-avoid">
                {combos.fadingPatterns.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="sec-hdr">
        <h2 className="sec-ttl" style={{ fontSize: 26 }}>Winning creatives, taken apart</h2>
        <span className="sec-sub">{winners.length} analysed · click any row to expand</span>
      </div>
      {winners.length === 0 ? (
        <div className="empty">
          Nothing analysed yet in this view. Run <code>npm run enrich</code>.
        </div>
      ) : (
        <ResearchList cards={winners} label="winners" />
      )}

      {losers.length > 0 && (
        <>
          <div className="sec-hdr">
            <h2 className="sec-ttl" style={{ fontSize: 26 }}>What lost</h2>
            <span className="sec-sub">{losers.length} analysed — the contrast is the lesson</span>
          </div>
          <ResearchList cards={losers} label="losers" />
        </>
      )}
    </>
  )
}

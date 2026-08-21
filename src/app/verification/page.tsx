import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'

export const dynamic = 'force-dynamic'

export default async function Verification({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const snap = selectProduct(await loadSnapshot(), product)

  const verified = snap.creatives.filter((c) => c.analysed)
  const pct = snap.totals.winners
    ? Math.round((snap.totals.analysed / snap.totals.winners) * 100)
    : 0

  // Fields where the creative settles the question, so a disagreement is a
  // genuine error rather than a second opinion.
  const corrections = verified.flatMap((c) =>
    [
      { f: 'Production Style', v: c.productionStyle },
      { f: 'Creative Structure', v: c.creativeStructure },
      { f: 'Hook Type', v: c.hookType },
    ]
      .filter((x) => x.v?.verdict === 'mismatch')
      .map((x) => ({ name: c.name, product: c.product, field: x.f, ...x.v! })),
  )

  return (
    <>
      <div className="phead">
        <p className="phead-ey">05 · Verification</p>
        <h1 className="phead-ttl">ClickUp vs. <em>the creative</em></h1>
        <p className="phead-sub">
          Each creative is classified without sight of its ClickUp label, then the two are
          compared. Angle and Persona are excluded from these scores — they describe intent,
          which a creative can signal but never prove.
        </p>
      </div>

      <div className="dlv-bar-wrap" style={{ paddingTop: 28 }}>
        <div className="dlv-hdr">
          <span className="dlv-pct">{pct}%</span>
          <span className="dlv-pct-lbl">
            of winners read from their files ({snap.totals.analysed} of {snap.totals.winners})
          </span>
        </div>
        <div className="dlv-bar"><div className="dlv-fill" style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="sec-hdr">
        <h2 className="sec-ttl" style={{ fontSize: 24 }}>Field accuracy</h2>
        <span className="sec-sub">how often ClickUp matches the footage</span>
      </div>
      <div className="d-list">
        {snap.trust.length === 0 && <div className="empty">No creatives verified yet.</div>}
        {snap.trust.map((t, i) => {
          const acc = t.total ? Math.round((t.agree / t.total) * 100) : 0
          return (
            <div key={t.field} className="d-it">
              <div className="d-n">{String(i + 1).padStart(2, '0')}</div>
              <div className="d-stripe" style={{ background: acc >= 75 ? 'var(--hh-c)' : acc >= 50 ? 'var(--ca)' : 'var(--ig)' }} />
              <div className="d-nm">{t.label}</div>
              <div className="d-fmt">{acc}% accurate</div>
              <div className="d-ds">{t.agree} of {t.total} agreed</div>
              <div />
            </div>
          )
        })}
      </div>

      <div className="sec-hdr">
        <h2 className="sec-ttl" style={{ fontSize: 24 }}>Corrections</h2>
        <span className="sec-sub">{corrections.length} places the footage disagrees</span>
      </div>
      <div className="d-list">
        {corrections.length === 0 && (
          <div className="empty">No confident disagreements on verifiable fields.</div>
        )}
        {corrections.map((c, i) => (
          <div key={`${c.name}-${c.field}-${i}`} className="d-it">
            <div className="d-n">{String(i + 1).padStart(2, '0')}</div>
            <div className={`d-stripe ${c.product}`} />
            <div className="d-nm">{c.name}</div>
            <div className="d-fmt">{c.field}</div>
            <div className="d-ds">
              <span style={{ color: 'var(--ink3)' }}>{c.claimed ?? 'blank'}</span>
              {' → '}
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.observed}</span>
            </div>
            <div className="d-fmt">{c.confidence ? `${Math.round(c.confidence * 100)}%` : ''}</div>
          </div>
        ))}
      </div>
    </>
  )
}

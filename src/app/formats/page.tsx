import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'

export const dynamic = 'force-dynamic'

/** Below this the sample is too thin to read anything into. */
const MIN_SAMPLE = 4

export default async function Formats({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const snap = selectProduct(await loadSnapshot(), product)
  const solid = snap.formats.filter((f) => f.tested >= MIN_SAMPLE)
  const thin = snap.formats.filter((f) => f.tested < MIN_SAMPLE)

  return (
    <>
      <div className="phead">
        <p className="phead-ey">02 · Formats</p>
        <h1 className="phead-ttl">Winning ad formats</h1>
        <p className="phead-sub">
          Win rate is wins ÷ creatives with a decided outcome. Anything still in testing counts
          in neither half — including it would push every format toward 100%.
        </p>
      </div>

      <div className="ar-list">
        {solid.length === 0 && (
          <div className="empty">
            No format has {MIN_SAMPLE} or more decided creatives yet in this view.
          </div>
        )}
        {solid.map((f) => (
          <div key={f.key} className={`ar ${f.product}`}>
            <div className="ar-main">
              <div className="ar-code">{f.code}</div>
              <div className="ar-body">
                <div className="ar-name">{f.label}</div>
                <div className="ar-hook">{f.description}</div>
              </div>
              <div className="ar-right">
                <div className="ar-cnt">{f.winRate === null ? '—' : `${Math.round(f.winRate * 100)}%`}</div>
                <div className="ar-sts">
                  <div className="ar-st"><div className="ar-st-d win" />{f.wins} won</div>
                  <div className="ar-st"><div className="ar-st-d loss" />{f.losses} lost</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {thin.length > 0 && (
        <>
          <div className="sec-hdr">
            <h2 className="sec-ttl" style={{ fontSize: 24 }}>Too thin to judge</h2>
            <span className="sec-sub">fewer than {MIN_SAMPLE} decided creatives</span>
          </div>
          <div className="d-list">
            {thin.map((f, i) => (
              <div key={f.key} className="d-it">
                <div className="d-n">{String(i + 1).padStart(2, '0')}</div>
                <div className={`d-stripe ${f.product}`} />
                <div className="d-nm">{f.label}</div>
                <div className="d-fmt">{f.wins}W / {f.losses}L</div>
                <div className="d-ds">{f.description}</div>
                <div />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

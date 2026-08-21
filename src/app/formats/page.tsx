import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'
import type { FormatRow } from '../../lib/data/types'

export const dynamic = 'force-dynamic'

/** Below this the sample is too thin to read anything into. */
const MIN_SAMPLE = 4

function rateClass(rate: number | null) {
  if (rate === null) return ''
  return rate >= 0.7 ? 'hi' : rate >= 0.4 ? 'mid' : 'lo'
}

function Card({ f, thin }: { f: FormatRow; thin?: boolean }) {
  const pct = f.winRate === null ? null : Math.round(f.winRate * 100)
  return (
    <div className={`fcard ${f.product}${thin ? ' thin' : ''}`}>
      <div className="fc-top">
        <span className="fc-name">{f.label}</span>
        <span className={`fc-rate ${rateClass(f.winRate)}`}>{pct === null ? '—' : `${pct}%`}</span>
      </div>
      <div className="fc-meta">{f.description}</div>
      {!thin && (
        <div className="fc-bar">
          {f.wins > 0 && <div className="fc-bar-w" style={{ flex: f.wins }} />}
          {f.losses > 0 && <div className="fc-bar-l" style={{ flex: f.losses }} />}
        </div>
      )}
      <div className="fc-legend">
        <span className="fc-lg"><span className="fc-lg-d w" />{f.wins} won</span>
        <span className="fc-lg"><span className="fc-lg-d l" />{f.losses} lost</span>
      </div>
    </div>
  )
}

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

      {solid.length === 0 ? (
        <div className="empty">
          No format has {MIN_SAMPLE} or more decided creatives yet in this view.
        </div>
      ) : (
        <div className="fgrid">
          {solid.map((f) => <Card key={f.key} f={f} />)}
        </div>
      )}

      {thin.length > 0 && (
        <>
          <div className="sec-hdr">
            <h2 className="sec-ttl" style={{ fontSize: 22 }}>Too thin to judge</h2>
            <span className="sec-sub">
              {thin.length} formats with fewer than {MIN_SAMPLE} decided creatives
            </span>
          </div>
          <div className="fgrid">
            {thin.map((f) => <Card key={f.key} f={f} thin />)}
          </div>
        </>
      )}
    </>
  )
}

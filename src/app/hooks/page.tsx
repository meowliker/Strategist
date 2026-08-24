import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'

export const dynamic = 'force-dynamic'

export default async function HooksPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const snap = selectProduct(await loadSnapshot(), product)

  const winners = snap.creatives.filter(
    (c) => c.hook && (c.status === 'win' || c.status === 'mild' || c.status === 'scale'),
  )

  // Group by angle (observed first, fall back to claimed, fall back to "Unknown")
  const grouped = new Map<string, typeof winners>()
  for (const c of winners) {
    const angle = c.angle?.observed ?? c.angle?.claimed ?? 'Unknown'
    if (!grouped.has(angle)) grouped.set(angle, [])
    grouped.get(angle)!.push(c)
  }

  // Sort angles by number of hooks desc
  const sorted = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)

  return (
    <>
      <div className="phead">
        <p className="phead-ey">07 · Hooks</p>
        <h1 className="phead-ttl">Winner hooks by angle</h1>
        <p className="phead-sub">
          Every hook line from winning creatives, grouped by the angle they used.
          {winners.length > 0 && ` ${winners.length} hooks across ${sorted.length} angles.`}
        </p>
      </div>

      {sorted.length === 0 && (
        <div className="empty" style={{ margin: '48px' }}>
          No winning creatives with hook text yet. Run Watch on winners first.
        </div>
      )}

      <div className="hooks-wrap">
        {sorted.map(([angle, creatives]) => (
          <div className="hooks-group" key={angle}>
            <div className="hooks-angle">
              <span className="hooks-angle-name">{angle}</span>
              <span className="hooks-angle-count">{creatives.length}</span>
            </div>
            <div className="hooks-list">
              {creatives.map((c) => (
                <div className="hooks-row" key={c.creativeId ?? c.taskId}>
                  <div className="hooks-text">{c.hook}</div>
                  <div className="hooks-meta">
                    <span className={`t-ang ${c.product}`}>{c.product.toUpperCase()}</span>
                    <span className={`std ${c.status}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
                    <span className="hooks-status">{c.statusLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

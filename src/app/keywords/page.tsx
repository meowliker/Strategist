import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'
import { searchLinks } from '../../lib/data/types'

export const dynamic = 'force-dynamic'

export default async function Keywords({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const snap = selectProduct(await loadSnapshot(), product)

  const groups = ['hook_phrase', 'pain_point', 'format', 'entity'] as const
  const LABEL: Record<string, string> = {
    hook_phrase: 'Hook phrases', pain_point: 'Pain points',
    format: 'Format cues', entity: 'Entities',
  }

  return (
    <>
      <div className="phead">
        <p className="phead-ey">04 · Keywords</p>
        <h1 className="phead-ttl">Winning keywords</h1>
        <p className="phead-sub">
          Mined from what the winning creatives actually say and show — not from ClickUp text.
          Each term links straight into Instagram, Meta Ad Library and TikTok search.
        </p>
      </div>

      {snap.keywords.length === 0 && (
        <div className="empty">
          No keywords yet in this view. They appear once the creatives have been transcribed
          and read.
        </div>
      )}

      {groups.map((g) => {
        const rows = snap.keywords.filter((k) => k.kind === g)
        if (!rows.length) return null
        return (
          <section key={g}>
            <div className="sec-hdr">
              <h2 className="sec-ttl" style={{ fontSize: 24 }}>{LABEL[g]}</h2>
              <span className="sec-sub">{rows.length} terms</span>
            </div>
            <div className="d-list">
              {rows.map((k, i) => {
                const l = searchLinks(k.term)
                return (
                  <div key={`${k.term}-${i}`} className="d-it">
                    <div className="d-n">{String(i + 1).padStart(2, '0')}</div>
                    <div className={`d-stripe ${k.product}`} />
                    <div className="d-nm">{k.term}</div>
                    <div className="d-fmt">{k.wins} winner{k.wins === 1 ? '' : 's'}</div>
                    <div className="d-ds">{k.productName}</div>
                    <div className="d-links">
                      <a className="d-lnk" href={l.adLibrary} target="_blank" rel="noopener">Ad Lib</a>
                      <a className="d-lnk" href={l.instagram} target="_blank" rel="noopener">IG</a>
                      <a className="d-lnk" href={l.tiktok} target="_blank" rel="noopener">TikTok</a>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}

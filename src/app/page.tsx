import Link from 'next/link'
import { loadSnapshot } from '../lib/data/load'
import { readProduct, selectProduct } from '../lib/data/select'
import { PRODUCT_LABEL } from '../lib/data/types'

export const dynamic = 'force-dynamic'

const CARDS = [
  { href: '/formats', n: '02', t: 'Formats', d: 'Win rate by creative structure, counted only on creatives with a decided outcome.' },
  { href: '/creatives', n: '03', t: 'Creatives', d: 'Every task, and every hook variant we have watched, with ClickUp and the creative side by side.' },
  { href: '/keywords', n: '04', t: 'Keywords', d: 'Phrases mined from what winning creatives actually say, linked to Instagram, Ad Library and TikTok.' },
  { href: '/verification', n: '05', t: 'Verification', d: 'Which ClickUp fields hold up against the footage, and which do not.' },
]

export default async function Overview({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const product = readProduct(sp)
  const snap = selectProduct(await loadSnapshot(), product)
  const t = snap.totals
  const q = product === 'all' ? '' : `?product=${product}`
  const scope = product === 'all' ? 'four products' : PRODUCT_LABEL[product]

  return (
    <>
      <div className="phead">
        <p className="phead-ey">{scope} · read-only view of ClickUp</p>
        <h1 className="phead-ttl">What wins, <em>and why it wins.</em></h1>
        <p className="phead-sub">
          Every winning creative is watched, transcribed and classified without sight of its
          ClickUp label — then the two readings are placed side by side.
        </p>
      </div>

      <div className="band">
        <div className="band-c"><div className="band-n">{t.tasks}</div><div className="band-l">Tasks synced</div></div>
        <div className="band-c"><div className="band-n win">{t.winners}</div><div className="band-l">Winners</div></div>
        <div className="band-c"><div className="band-n loss">{t.losers}</div><div className="band-l">Losers</div></div>
        <div className="band-c"><div className="band-n">{t.analysed}</div><div className="band-l">Videos watched</div></div>
        <div className="band-c"><div className="band-n flag">{t.mismatches}</div><div className="band-l">Field mismatches</div></div>
      </div>

      <div className="cards">
        {CARDS.map((c) => (
          <Link key={c.href} href={`${c.href}${q}`} className="card">
            <span className="card-n">{c.n}</span>
            <span className="card-t">{c.t}</span>
            <span className="card-d">{c.d}</span>
            <span className="card-go">Open →</span>
          </Link>
        ))}
      </div>

      {t.analysed < t.winners && (
        <div className="empty">
          {t.analysed} of {t.winners} winning tasks watched so far. The rest are still processing —
          run <code>npm run snapshot</code> to pull in new results.
        </div>
      )}
    </>
  )
}

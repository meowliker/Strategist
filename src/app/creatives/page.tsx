import { loadSnapshot } from '../../lib/data/load'
import { readProduct, selectProduct } from '../../lib/data/select'
import CreativesTable from '../../components/CreativesTable'

export const dynamic = 'force-dynamic'

export default async function Creatives({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const product = readProduct(await searchParams)
  const snap = selectProduct(await loadSnapshot(), product)

  return (
    <>
      <div className="phead">
        <p className="phead-ey">03 · Creatives</p>
        <h1 className="phead-ttl">Winning creatives</h1>
        <p className="phead-sub">
          {snap.totals.analysed} of {snap.totals.winners} winners have been read from their files.
          A verified task appears once per hook variant, because one label cannot describe three
          different hooks.
        </p>
      </div>
      <CreativesTable snapshot={snap} />
    </>
  )
}

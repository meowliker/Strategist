import { loadSnapshot } from '../lib/data/load'
import Dashboard from '../components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const snapshot = await loadSnapshot()
  return <Dashboard snapshot={snapshot} />
}

import './globals.css'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Chrome from '../components/Chrome'
import { loadSnapshot } from '../lib/data/load'

export const metadata: Metadata = {
  title: 'Strategist — Creative Intelligence',
  description: 'What wins across Herbal Healing, ADHD, Canva Mastery and Instagram Growth.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const snap = await loadSnapshot()
  const synced = snap.totals.tasks === 0
    ? 'No snapshot'
    : `Synced ${new Date(snap.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <Chrome syncedAt={synced} live={snap.live} />
        </Suspense>
        <div className="page">{children}</div>
        <footer className="site-ft">
          <span className="ft-note">Read-only view · no ClickUp data is ever modified</span>
          <a className="ft-lnk" href="https://app.clickup.com/9016762494/v/f/90168119851"
            target="_blank" rel="noopener">Open in ClickUp →</a>
        </footer>
      </body>
    </html>
  )
}

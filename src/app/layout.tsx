import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Strategist — Creative Intelligence',
  description: 'Winning creative patterns across Herbal Healing, ADHD, Canva Mastery and Instagram Growth.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

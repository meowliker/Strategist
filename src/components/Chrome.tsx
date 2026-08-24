'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Cursor from './Cursor'
import JobControls from './JobControls'
import type { ProductKey } from '../lib/data/types'
import { PRODUCTS as CONFIGURED } from '../lib/products'

export const PAGES = [
  { href: '/', n: '01', label: 'Overview' },
  { href: '/formats', n: '02', label: 'Formats' },
  { href: '/creatives', n: '03', label: 'Creatives' },
  { href: '/keywords', n: '04', label: 'Keywords' },
  { href: '/verification', n: '05', label: 'Verification' },
  { href: '/research', n: '06', label: 'Research' },
  { href: '/hooks', n: '07', label: 'Hooks' },
]

/** Derived from the product config so a new product appears here automatically. */
export const PRODUCTS: { key: ProductKey | 'all'; label: string; short: string }[] = [
  { key: 'all', label: 'All products', short: 'All' },
  ...CONFIGURED.map((p) => ({ key: p.key as ProductKey, label: p.name, short: p.short })),
]

/**
 * Persistent chrome: header, product switcher and page nav.
 *
 * The product choice lives in the query string so it survives navigation and
 * stays shareable — a teammate can paste a link and land on the same slice.
 */
export default function Chrome({ syncedAt, live }: { syncedAt: string; live: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const product = (params.get('product') ?? 'all') as ProductKey | 'all'
  const [open, setOpen] = useState(false)
  const indicator = useRef<HTMLDivElement>(null)
  const navRow = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const withProduct = (href: string) =>
    product === 'all' ? href : `${href}?product=${product}`

  const selectProduct = (key: string) => {
    setOpen(false)
    const qs = key === 'all' ? '' : `?product=${key}`
    router.push(`${pathname}${qs}`)
  }

  useEffect(() => {
    const btn = navRow.current?.querySelector<HTMLElement>('.snav-btn.act')
    if (!btn || !indicator.current || !navRow.current) return
    const row = navRow.current.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    indicator.current.style.left = `${b.left - row.left}px`
    indicator.current.style.width = `${b.width}px`
  }, [pathname])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const current = PRODUCTS.find((p) => p.key === product) ?? PRODUCTS[0]

  return (
    <>
      <Cursor />
      <header id="hdr">
        <Link href={withProduct('/')} className="hdr-mark">
          <div className="hdr-mark-dot" />Strategist
        </Link>
        <div className="hdr-sep" />

        <div className="psw" ref={menu}>
          <button className="psw-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {current.label}
            <span className="psw-car">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <div className="psw-menu">
              {PRODUCTS.map((p) => (
                <button key={p.key}
                  className={`psw-item${p.key === product ? ' on' : ''}`}
                  onClick={() => selectProduct(p.key)}>
                  {p.label}
                  {p.key === product && <span className="psw-tick">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hdr-sp" />
        <JobControls product={current.key === 'all' ? null : current.label} />
        <div id="sync-wrap">
          <div className={`s-dot${live ? ' live' : ''}`} />
          <span>{syncedAt}</span>
        </div>
        <a className="hb dark" href="https://app.clickup.com/9016762494/v/f/90168119851"
          target="_blank" rel="noopener">ClickUp ↗</a>
      </header>

      <nav id="snav" aria-label="Pages">
        <div className="snav-row" ref={navRow}>
          {PAGES.map((p) => (
            <Link key={p.href} href={withProduct(p.href)}
              className={`snav-btn${pathname === p.href ? ' act' : ''}`}>
              <span className="nb">{p.n}</span>{p.label}
            </Link>
          ))}
          <div className="snav-line" />
          <div className="snav-ind" ref={indicator} />
        </div>
      </nav>
    </>
  )
}

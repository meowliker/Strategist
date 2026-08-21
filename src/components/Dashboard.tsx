'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Snapshot, CreativeRow, ProductKey, DualValue } from '../lib/data/types'
import { PRODUCT_LABEL, searchLinks } from '../lib/data/types'
import Cursor from './Cursor'
import HeroCanvas from './HeroCanvas'

const SECTIONS = [
  { id: 's1', n: '01', label: 'Overview' },
  { id: 's2', n: '02', label: 'Formats' },
  { id: 's3', n: '03', label: 'Creatives' },
  { id: 's4', n: '04', label: 'Keywords' },
  { id: 's5', n: '05', label: 'Verification' },
]

const FILTERS: { key: ProductKey | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'hh', label: 'Herbal' },
  { key: 'ad', label: 'ADHD' },
  { key: 'ca', label: 'Canva' },
  { key: 'ig', label: 'Instagram' },
]

const AVATAR_CLASSES = ['av-a', 'av-b', 'av-c', 'av-d']

function avatarClass(name: string | null) {
  if (!name) return 'av-un'
  let hash = 0
  for (const ch of name) hash = (hash + ch.charCodeAt(0)) % 997
  return AVATAR_CLASSES[hash % AVATAR_CLASSES.length]
}
function initials(name: string | null) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

const VERDICT_LABEL: Record<string, string> = {
  match: 'agree', mismatch: 'ClickUp wrong', missing: 'ClickUp blank',
  differs: 'two views', unverifiable: 'not verifiable',
}

/**
 * Shows both readings of a field. For Angle and Persona neither side is
 * authoritative — the creative signals intent but cannot prove it — so they are
 * presented as two views rather than a correction.
 */
function Dual({ field, v }: { field: string; v?: DualValue }) {
  if (!v || (!v.claimed && !v.observed)) return null
  return (
    <div className="dv">
      <div className="dv-hd">
        <span className="dv-fld">{field}</span>
        <span className={`vb ${v.verdict}`}>{VERDICT_LABEL[v.verdict] ?? v.verdict}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">ClickUp</span>
        <span className={`dv-val${v.claimed ? '' : ' none'}`}>{v.claimed ?? 'not set'}</span>
      </div>
      <div className="dv-side">
        <span className="dv-src">Creative</span>
        <span className={`dv-val${v.observed ? '' : ' none'}`}>{v.observed ?? 'not analysed'}</span>
        {v.confidence !== null && v.observed && (
          <span className="dv-conf">{Math.round(v.confidence * 100)}%</span>
        )}
      </div>
      {v.rationale && <div className="dv-why">{v.rationale}</div>}
    </div>
  )
}

function goSec(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const cs = getComputedStyle(document.documentElement)
  const offset = parseInt(cs.getPropertyValue('--hh')) + parseInt(cs.getPropertyValue('--nh'))
  window.scrollTo({ top: el.offsetTop - offset + 1, behavior: 'smooth' })
}

export default function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const [filter, setFilter] = useState<ProductKey | 'all'>('all')
  const [panel, setPanel] = useState<CreativeRow | null>(null)
  const [active, setActive] = useState('s1')
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])
  const indicator = useRef<HTMLDivElement>(null)
  const navRow = useRef<HTMLDivElement>(null)

  const toast = (msg: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }

  const shown = useMemo(
    () => (filter === 'all' ? snapshot.creatives : snapshot.creatives.filter((c) => c.product === filter)),
    [filter, snapshot.creatives],
  )
  const winners = useMemo(
    () => shown.filter((c) => c.status === 'win' || c.status === 'mild' || c.status === 'scale'),
    [shown],
  )

  // Section nav indicator follows the section in the middle of the viewport.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
    )
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const btn = document.querySelector<HTMLElement>(`.snav-btn[data-sec="${active}"]`)
    if (!btn || !indicator.current || !navRow.current) return
    const rowRect = navRow.current.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    indicator.current.style.left = `${btnRect.left - rowRect.left}px`
    indicator.current.style.width = `${btnRect.width}px`
  }, [active])

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target) } })
    }, { threshold: 0.1 })
    document.querySelectorAll('.rv:not(.in)').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const empty = snapshot.totals.tasks === 0

  return (
    <>
      <Cursor />

      <header id="hdr">
        <div className="hdr-mark"><div className="hdr-mark-dot" />Strategist</div>
        <div className="hdr-sep" />
        <span className="hdr-name">Creative Intelligence</span>
        <div className="hdr-sp" />
        <div id="sync-wrap">
          <div className={`s-dot${snapshot.live ? ' live' : ''}`} />
          <span>
            {empty ? 'No snapshot' : snapshot.live ? `Synced ${new Date(snapshot.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Snapshot'}
          </span>
        </div>
        <button className="hb" onClick={() => toast('Sync runs server-side. Trigger it with: npm run sync')}>↻ Refresh</button>
        <a className="hb dark" href="https://app.clickup.com/9016762494/v/f/90168119851" target="_blank" rel="noopener">ClickUp ↗</a>
      </header>

      <nav id="snav" aria-label="Sections">
        <div className="snav-row" ref={navRow}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={`snav-btn${active === s.id ? ' act' : ''}`}
              data-sec={s.id} onClick={() => goSec(s.id)}>
              <span className="nb">{s.n}</span>{s.label}
            </button>
          ))}
          <div className="snav-line" />
          <div className="snav-ind" ref={indicator} />
        </div>
      </nav>

      <div className="page">
        {/* ── 01 OVERVIEW ── */}
        <section id="s1">
          <HeroCanvas />
          <div className="hero-badge" aria-hidden="true">
            <svg className="badge-svg" viewBox="0 0 110 110" width="110" height="110">
              <defs><path id="bp" d="M55,55 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
              <text fontSize="9" fontWeight="700" letterSpacing="3.2" fill="var(--ink3)" textAnchor="middle">
                <textPath href="#bp">STRATEGIST · WINNING PATTERNS · </textPath>
              </text>
            </svg>
            <div className="badge-inner">
              <svg className="badge-star" viewBox="0 0 16 16" fill="none">
                <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z" stroke="var(--ink3)" strokeWidth="1" fill="none" />
              </svg>
            </div>
          </div>
          <div className="hero-inner">
            <p className="hero-ey">4 products · read-only view of ClickUp</p>
            <h1 className="hero-hl">What wins, and <em>why it wins.</em></h1>
            <div className="hero-nums">
              <div className="hn-blk"><span className="hn-n">{snapshot.totals.tasks}</span><span className="hn-lbl">Tasks Synced</span></div>
              <div className="hero-divl" />
              <div className="hn-blk"><span className="hn-n c-win">{snapshot.totals.winners}</span><span className="hn-lbl">Winners</span></div>
              <div className="hero-divl" />
              <div className="hn-blk"><span className="hn-n c-loss">{snapshot.totals.losers}</span><span className="hn-lbl">Losers</span></div>
              <div className="hero-divl" />
              <div className="hn-blk"><span className="hn-n c-flag">{snapshot.totals.mismatches}</span><span className="hn-lbl">Field Mismatches</span></div>
              <button className="hero-cta" onClick={() => goSec('s3')}>
                <div className="hero-cta-dot" />View Creatives
              </button>
            </div>
          </div>
        </section>

        <div className="mq" aria-hidden="true">
          <div className="mq-t">
            {[0, 1].map((rep) => (
              <span key={rep} style={{ display: 'flex' }}>
                {['Herbal Healing', '·', 'ADHD', '·', 'Canva Mastery', '·', 'Instagram Growth', '·',
                  'Read-Only', '·', 'Verified Against The Creative', '·', 'Never Writes To ClickUp', '·'].map((s, i) => (
                    <span className="mq-i" key={i}>{s}</span>
                  ))}
              </span>
            ))}
          </div>
        </div>

        {/* ── 02 FORMATS ── */}
        <section id="s2">
          <div className="sec-hdr rv">
            <h2 className="sec-ttl">Winning Ad Formats</h2>
            <span className="sec-sub">win rate = wins ÷ creatives that reached market</span>
          </div>
          <div className="ar-list">
            {snapshot.formats.length === 0 && (
              <div className="empty">
                No format data yet. Run <code>npm run sync</code> to pull ClickUp, then the media
                pipeline to verify each format against the actual creative.
              </div>
            )}
            {snapshot.formats.map((f) => (
              <div key={f.key} className={`ar ${f.product} rv`}
                onClick={() => { setFilter(f.product); goSec('s3') }}>
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
                      <div className="ar-st"><div className="ar-st-d un" />{f.tested} tested</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 03 CREATIVES ── */}
        <section id="s3">
          <div className="sec-hdr rv">
            <h2 className="sec-ttl">Winning Creatives</h2>
            <span className="sec-sub">{snapshot.totals.tasks} tasks</span>
          </div>
          <div className="filt rv">
            {FILTERS.map((f) => (
              <button key={f.key} className={`fb${filter === f.key ? ' on' : ''}`}
                onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
            <span className="fc">{winners.length} winners of {shown.length} shown</span>
          </div>
          <div className="t-hd">
            <div className="t-hd-c" />
            <div className="t-hd-c">Task</div>
            <div className="t-hd-c hs">Angle — ClickUp / Creative</div>
            <div className="t-hd-c">Product</div>
            <div className="t-hd-c">Status</div>
            <div className="t-hd-c hs">Assignee</div>
          </div>
          <div>
            {shown.length === 0 && <div className="empty">No creatives synced yet. Run <code>npm run sync</code>.</div>}
            {shown.map((c) => (
              <div key={c.taskId} className="t-row" tabIndex={0} role="button"
                aria-label={`${c.name} — ${c.statusLabel}`}
                onClick={() => setPanel(c)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPanel(c) } }}>
                <div className={`t-stripe ${c.product}`} />
                <div className="t-c"><span className="t-id">{c.name}</span></div>
                <div className="t-c hs">
                  <span className="t-hook">
                    {c.angle?.claimed ?? '—'}
                    {c.angle?.observed && c.angle.verdict !== 'match' && (
                      <span style={{ color: 'var(--ca)', fontStyle: 'normal' }}> → {c.angle.observed}</span>
                    )}
                  </span>
                </div>
                <div className="t-c"><span className={`t-ang ${c.product}`}>{c.product.toUpperCase()}</span></div>
                <div className="t-c"><div className="t-st"><div className={`std ${c.status}`} /><span className="stt">{c.statusLabel}</span></div></div>
                <div className="t-c hs">
                  <div className="t-who">
                    <div className={`av ${avatarClass(c.assignee)}`}>{initials(c.assignee)}</div>
                    <span className="av-nm">{c.assignee ?? 'Unassigned'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 04 KEYWORDS ── */}
        <section id="s4">
          <div className="sec-hdr rv">
            <h2 className="sec-ttl">Winning Keywords</h2>
            <span className="sec-sub">search Instagram · Meta Ad Library · TikTok</span>
          </div>
          <div className="d-list">
            {snapshot.keywords.length === 0 && (
              <div className="empty">
                Keywords are mined from what the winning creatives actually say and show, so they
                appear once the media pipeline has transcribed and read them. Nothing is generated
                from ClickUp text alone.
              </div>
            )}
            {snapshot.keywords.map((k, i) => {
              const links = searchLinks(k.term)
              return (
                <div key={`${k.term}-${i}`} className="d-it">
                  <div className="d-n">{String(i + 1).padStart(2, '0')}</div>
                  <div className={`d-stripe ${k.product}`} />
                  <div className="d-nm">{k.term}</div>
                  <div className="d-fmt">{k.kind.replace('_', ' ')}</div>
                  <div className="d-ds">{k.wins} winning creatives</div>
                  <div className="d-links">
                    <a className="d-lnk" href={links.adLibrary} target="_blank" rel="noopener">Ad Lib</a>
                    <a className="d-lnk" href={links.instagram} target="_blank" rel="noopener">IG</a>
                    <a className="d-lnk" href={links.tiktok} target="_blank" rel="noopener">TikTok</a>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 05 VERIFICATION ── */}
        <section id="s5" style={{ paddingBottom: 100, borderTop: '1px solid var(--brd)' }}>
          <div className="sec-hdr rv">
            <h2 className="sec-ttl">Verification</h2>
            <span className="sec-sub">ClickUp&rsquo;s claim vs. what the creative shows</span>
          </div>
          <div className="dlv-bar-wrap rv">
            <div className="dlv-hdr">
              <span className="dlv-pct">
                {snapshot.totals.tasks ? `${Math.round((snapshot.totals.analysed / snapshot.totals.tasks) * 100)}%` : '—'}
              </span>
              <span className="dlv-pct-lbl">of synced creatives have been watched and verified</span>
            </div>
            <div className="dlv-bar">
              <div className="dlv-fill" style={{
                width: snapshot.totals.tasks ? `${(snapshot.totals.analysed / snapshot.totals.tasks) * 100}%` : '0%',
              }} />
            </div>
          </div>
          <div className="brief-g rv">
            <div>
              <p className="bp">A field is only trustworthy once the creative <em>agrees with it.</em></p>
              <div className="bkv">
                {snapshot.trust.length === 0 && (
                  <div className="bkv-r"><span className="bkv-k">No creatives analysed yet</span><span className="bkv-v">—</span></div>
                )}
                {snapshot.trust.map((t) => (
                  <div className="bkv-r" key={t.field}>
                    <span className="bkv-k">{t.label}</span>
                    <span className="bkv-v">{t.total ? `${Math.round((t.agree / t.total) * 100)}% accurate` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="bp" style={{ marginBottom: 16 }}>How each field is judged</p>
              <ul className="gl">
                <li className="do">Photo vs Video — the file settles it outright</li>
                <li className="do">Production Style — read from the frames</li>
                <li className="do">Creative Structure — read from pacing and shot pattern</li>
                <li className="do">Hook Type — read from the first three seconds</li>
                <li className="no">Angle — the creative only signals it; never overruled outright</li>
                <li className="no">Persona — inferred from casting and language, flagged low confidence</li>
              </ul>
            </div>
          </div>
        </section>

        <footer className="site-ft">
          <span className="ft-note">Read-only view · no ClickUp data is ever modified</span>
          <a className="ft-lnk" href="https://app.clickup.com/9016762494/v/f/90168119851" target="_blank" rel="noopener">Open in ClickUp →</a>
        </footer>
      </div>

      {/* ── DETAIL PANEL ── */}
      <div id="tov" className={panel ? 'open' : ''} onClick={() => setPanel(null)} />
      <aside id="tpanel" className={panel ? 'open' : ''} role="dialog" aria-modal="true" aria-label="Creative detail">
        <div className="tp-hdr">
          <div className="tp-name">{panel?.name ?? ''}</div>
          <button className="tp-close" onClick={() => setPanel(null)} aria-label="Close">✕</button>
        </div>
        {panel && (
          <div className="tp-body">
            <div><span className={`tp-angle-badge ${panel.product}`}>{PRODUCT_LABEL[panel.product]}</span></div>
            <div>
              <div className="tp-hook-lbl">{panel.analysed ? 'Hook (read from the creative)' : 'Note (claimed in ClickUp)'}</div>
              <div className="tp-hook">{panel.hook ?? 'No hook text yet — this creative has not been analysed.'}</div>
            </div>
            <div className="tp-kv">
              <div className="tp-kv-r"><span className="tp-kv-k">Status</span><span className="tp-kv-v">{panel.statusLabel}</span></div>
              <div className="tp-kv-r"><span className="tp-kv-k">Lever changed</span><span className="tp-kv-v">{panel.changedLever ?? '—'}</span></div>
              <div className="tp-kv-r"><span className="tp-kv-k">Assignee</span><span className="tp-kv-v">{panel.assignee ?? 'Unassigned'}</span></div>
              {panel.durationSec != null && (
                <div className="tp-kv-r"><span className="tp-kv-k">Duration</span><span className="tp-kv-v">{panel.durationSec.toFixed(1)}s</span></div>
              )}
              {panel.cutsPerMinute != null && (
                <div className="tp-kv-r"><span className="tp-kv-k">Cut rate</span><span className="tp-kv-v">{panel.cutsPerMinute.toFixed(0)}/min</span></div>
              )}
            </div>

            {panel.analysed ? (
              <div>
                <div className="tp-hook-lbl">ClickUp vs. the creative</div>
                <Dual field="Angle" v={panel.angle} />
                <Dual field="Persona" v={panel.persona} />
                <Dual field="Production Style" v={panel.productionStyle} />
                <Dual field="Creative Structure" v={panel.creativeStructure} />
                <Dual field="Hook Type" v={panel.hookType} />
              </div>
            ) : (
              <div className="dv">
                <div className="dv-side">
                  <span className="dv-val none">
                    This creative has not been analysed yet, so only ClickUp&rsquo;s side exists.
                  </span>
                </div>
              </div>
            )}
            {panel.verdicts.length > 0 && (
              <div className="tp-kv">
                {panel.verdicts.map((v) => (
                  <div className="tp-kv-r" key={v.field}>
                    <span className="tp-kv-k">{v.label}</span>
                    <span className="tp-kv-v">
                      <span className={`vb ${v.verdict}`}>{v.verdict}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="tp-actions">
              <a className="tp-btn tp-btn-primary" href={panel.url} target="_blank" rel="noopener">Open in ClickUp ↗</a>
              <button className="tp-btn tp-btn-ghost"
                onClick={() => { navigator.clipboard?.writeText(panel.name); toast('Task name copied.') }}>
                Copy Name
              </button>
            </div>
          </div>
        )}
      </aside>

      <div id="toasts" aria-live="polite">
        {toasts.map((t) => <div className="tst" key={t.id}>{t.msg}</div>)}
      </div>
    </>
  )
}

'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface JobState {
  kind: string; product: string | null; startedAt: number
  finishedAt: number | null; exitCode: number | null; log: string[]; error: string | null
}
interface Status {
  jobs: Record<string, JobState | null>
  /** Scoped to the selected product when one is chosen. */
  pending: { toWatch: number; toEnrich: number }
  byProduct: Record<string, { toWatch: number; toEnrich: number }>
}

/**
 * Watch / Enrich / Refresh.
 *
 * Both jobs skip work already done, so pressing a button twice costs nothing —
 * the counts show how much is genuinely outstanding. Polling only runs while
 * something is in flight.
 */
export default function JobControls({ product }: { product: string | null }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const router = useRouter()
  const wasRunning = useRef(false)

  const load = useCallback(async () => {
    try {
      const qs = product ? `?product=${encodeURIComponent(product)}` : ''
      const r = await fetch(`/api/jobs${qs}`, { cache: 'no-store' })
      if (r.ok) setStatus(await r.json())
    } catch { /* transient; the next poll retries */ }
  }, [product])

  useEffect(() => { load() }, [load])

  const running = status
    ? Object.values(status.jobs).some((j) => j && j.finishedAt === null)
    : false

  // Poll only while a job is in flight, then refresh the page data once it ends.
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) {
        wasRunning.current = false
        router.refresh()
      }
      return
    }
    wasRunning.current = true
    setDismissed(false)
    const id = setInterval(load, 2500)
    return () => clearInterval(id)
  }, [running, load, router])

  const start = async (kind: string) => {
    setBusy(kind)
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, product }),
      })
      await load()
    } finally { setBusy(null) }
  }

  const refresh = async () => {
    setBusy('snapshot')
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'snapshot' }),
      })
      await load()
    } finally { setBusy(null) }
  }

  const active = status
    ? Object.values(status.jobs).find((j) => j && j.finishedAt === null) ?? null
    : null
  const toWatch = status?.pending.toWatch ?? 0
  const toEnrich = status?.pending.toEnrich ?? 0
  const jobBusy = (k: string) => status?.jobs[k]?.finishedAt === null

  return (
    <>
      <div className="jobs">
        <button className={`jb${jobBusy('watch') ? ' busy' : ''}`}
          disabled={busy !== null || running}
          onClick={() => start('watch')}
          title={product
            ? `${toWatch} winning task(s) in ${product} have no creatives yet`
            : `${toWatch} winning task(s) across all products have no creatives yet`}>
          {jobBusy('watch') && <span className="jb-spin" />}
          Watch
          {toWatch > 0 && !running && <span className="jb-n">{toWatch}</span>}
        </button>

        <button className={`jb${jobBusy('enrich') ? ' busy' : ''}`}
          disabled={busy !== null || running}
          onClick={() => start('enrich')}
          title={product
            ? `${toEnrich} watched creative(s) in ${product} have no deep read yet`
            : `${toEnrich} watched creative(s) across all products have no deep read yet`}>
          {jobBusy('enrich') && <span className="jb-spin" />}
          Enrich
          {toEnrich > 0 && !running && <span className="jb-n">{toEnrich}</span>}
        </button>

        <button className={`jb${jobBusy('snapshot') ? ' busy' : ''}`}
          disabled={busy !== null}
          onClick={refresh} title="Rebuild the dashboard view from the database">
          ↻
        </button>
      </div>

      {active && !dismissed && (
        <div id="joblog">
          <div className="jl-header">
            <span className="jl-tag">{active.kind}{active.product ? ` · ${active.product}` : ''}</span>
            <button className="jl-x" onClick={() => setDismissed(true)} aria-label="Hide">✕</button>
          </div>
          <span className="jl-line">{active.log[active.log.length - 1] ?? 'starting…'}</span>
          <div className="jl-bar"><div className="jl-bar-fill" /></div>
        </div>
      )}
    </>
  )
}

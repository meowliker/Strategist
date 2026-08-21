import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export type JobKind = 'watch' | 'enrich' | 'sync' | 'snapshot' | 'synthesize'

export interface JobState {
  kind: JobKind
  product: string | null
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  /** Tail of the job's output, for the progress line in the UI. */
  log: string[]
  error: string | null
}

/**
 * In-process job registry.
 *
 * Held on globalThis so it survives Next.js hot reloads in development — the
 * same reason the database client is cached there. One job per kind at a time:
 * two backfills racing the same product would each pay to watch the creatives
 * the other is halfway through.
 */
const g = globalThis as unknown as {
  __strategistJobs?: Map<JobKind, JobState>
  __strategistProcs?: Map<JobKind, ChildProcess>
}
const jobs = (g.__strategistJobs ??= new Map<JobKind, JobState>())
const procs = (g.__strategistProcs ??= new Map<JobKind, ChildProcess>())

const SCRIPT: Record<JobKind, string> = {
  watch: 'src/scripts/backfill.ts',
  enrich: 'src/scripts/enrich.ts',
  sync: 'src/scripts/sync.ts',
  snapshot: 'src/scripts/snapshot.ts',
  synthesize: 'src/scripts/synthesize.ts',
}

const MAX_LOG = 40

export function isRunning(kind: JobKind): boolean {
  const j = jobs.get(kind)
  return Boolean(j && j.finishedAt === null)
}

export function getJobs(): Record<string, JobState | null> {
  const out: Record<string, JobState | null> = {}
  for (const kind of Object.keys(SCRIPT) as JobKind[]) out[kind] = jobs.get(kind) ?? null
  return out
}

export function startJob(kind: JobKind, product?: string | null): { ok: boolean; reason?: string } {
  if (isRunning(kind)) return { ok: false, reason: `${kind} is already running` }

  const args = ['--env-file=.env', path.join('src', 'scripts', path.basename(SCRIPT[kind]))]
  if (product && (kind === 'watch' || kind === 'enrich' || kind === 'sync')) {
    args.push(`--product=${product}`)
  }

  const state: JobState = {
    kind, product: product ?? null, startedAt: Date.now(),
    finishedAt: null, exitCode: null, log: [], error: null,
  }
  jobs.set(kind, state)

  const child = spawn('npx', ['tsx', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, PG_POOL_MAX: '2' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  procs.set(kind, child)

  const append = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      const t = line.trim()
      if (!t) continue
      state.log.push(t)
      if (state.log.length > MAX_LOG) state.log.shift()
    }
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)

  child.on('error', (err) => {
    state.error = err.message
    state.finishedAt = Date.now()
    state.exitCode = -1
  })
  child.on('close', (code) => {
    state.exitCode = code
    state.finishedAt = Date.now()
    procs.delete(kind)
  })

  return { ok: true }
}

export function stopJob(kind: JobKind): boolean {
  const child = procs.get(kind)
  if (!child) return false
  child.kill('SIGTERM')
  return true
}

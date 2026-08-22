import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Snapshot } from './types'
import { EMPTY_SNAPSHOT } from './build'

const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'snapshot.json')

/**
 * Loads the current snapshot.
 *
 * Prefers the file written by `npm run snapshot`. A freshly deployed container
 * has no such file — its filesystem starts empty and is ephemeral — so this
 * falls back to projecting one straight from Postgres and caches it in memory.
 * Without that fallback the first visitor to a new deploy sees an empty
 * dashboard and no indication why.
 */
const g = globalThis as unknown as { __strategistSnapshot?: { at: number; snap: Snapshot } }
const MEMO_MS = 60_000

export async function loadSnapshot(): Promise<Snapshot> {
  try {
    return JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as Snapshot
  } catch {
    // no file — fall through to the database
  }

  const cached = g.__strategistSnapshot
  if (cached && Date.now() - cached.at < MEMO_MS) return cached.snap

  try {
    const { projectSnapshot } = await import('./project')
    const snap = await projectSnapshot()
    g.__strategistSnapshot = { at: Date.now(), snap }
    return snap
  } catch (e) {
    console.error('[snapshot] could not project from database:', (e as Error).message)
    return EMPTY_SNAPSHOT
  }
}

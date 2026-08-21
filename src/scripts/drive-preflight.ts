/**
 * Verifies Drive access before the backfill runs.
 *
 * A service account with no folder share authenticates perfectly and then lists
 * zero files, which is indistinguishable from "this task has no videos" unless
 * something checks explicitly. This does that check and names the folders it
 * cannot reach.
 */
import { db } from '../db/client'
import { tasks } from '../db/schema'
import { and, inArray, isNull, isNotNull } from 'drizzle-orm'
import { driveClient, folderIdFromUrl, listMedia, variantIndex } from '../lib/drive/client'

const SHARE_ROOT = '1ckrPzkIptcixWzeN-pk6yNTRAKMs_Ouu' // "ECOM ( Creative Team)"

async function main() {
  const drive = driveClient()

  process.stdout.write('Root folder access… ')
  try {
    const res = await drive.files.get({ fileId: SHARE_ROOT, fields: 'id,name', supportsAllDrives: true })
    console.log(`✓ "${res.data.name}"`)
  } catch {
    console.log('✗ NOT SHARED')
    console.log('\n  Share this folder with the service account as Viewer:')
    console.log(`  https://drive.google.com/drive/folders/${SHARE_ROOT}\n`)
    process.exit(1)
  }

  const winners = await db
    .select({ id: tasks.id, name: tasks.name, product: tasks.productName, link: tasks.driveLink })
    .from(tasks)
    .where(and(
      inArray(tasks.category, ['winner', 'mild_winner', 'scale']),
      isNull(tasks.duplicateOfTaskId),
      isNotNull(tasks.driveLink),
    ))

  console.log(`\nChecking ${winners.length} winner folders…\n`)

  let reachable = 0, videos = 0, images = 0
  const failed: string[] = []

  for (const w of winners) {
    const folderId = folderIdFromUrl(w.link)
    if (!folderId) { failed.push(`${w.name} — unparseable link`); continue }
    try {
      const files = await listMedia(drive, folderId)
      reachable++
      videos += files.filter((f) => f.mimeType.startsWith('video/')).length
      images += files.filter((f) => f.mimeType.startsWith('image/')).length
      const variants = files.map((f) => variantIndex(f.name)).filter((v) => v !== null)
      console.log(
        `  ✓ ${w.name.padEnd(34).slice(0, 34)} ${String(files.length).padStart(2)} files` +
        (variants.length ? `  variants ${variants.join(',')}` : ''),
      )
    } catch (e) {
      failed.push(`${w.name} — ${(e as Error).message.slice(0, 60)}`)
      console.log(`  ✗ ${w.name}`)
    }
  }

  console.log(`\n  reachable ${reachable}/${winners.length} · ${videos} videos · ${images} images`)
  if (failed.length) {
    console.log(`\n  ${failed.length} unreachable:`)
    failed.slice(0, 15).forEach((f) => console.log(`    · ${f}`))
  }
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error(e.message); process.exit(1) })

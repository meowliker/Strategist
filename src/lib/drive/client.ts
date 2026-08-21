import { google, type drive_v3 } from 'googleapis'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

/**
 * READ-ONLY Google Drive access.
 *
 * Scoped to drive.readonly so the credential physically cannot modify or delete
 * anything in the Drive, matching the read-only guarantee the ClickUp client
 * makes. Two auth modes are supported:
 *
 *  - Service account (preferred for Railway): no token expiry to manage, but
 *    the target folder must be shared with the service account's email or it
 *    sees nothing at all.
 *  - OAuth refresh token: works with a personal Google account. Note that if
 *    the consent screen is still in "Testing" publishing status, Google expires
 *    refresh tokens after 7 days and the deploy silently stops syncing.
 */
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

export function driveClient(): drive_v3.Drive {
  const sa = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (sa) {
    const creds = JSON.parse(sa) as { client_email: string; private_key: string }
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    })
    return google.drive({ version: 'v3', auth })
  }

  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env
  if (GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET && GOOGLE_OAUTH_REFRESH_TOKEN) {
    const auth = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN })
    return google.drive({ version: 'v3', auth })
  }

  throw new Error(
    'No Drive credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON, or all three of ' +
    'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN.',
  )
}

/** Pulls the folder id out of any of the Drive URL shapes ClickUp holds. */
export function folderIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return (
    url.match(/\/folders\/([A-Za-z0-9_-]{20,})/)?.[1] ??
    url.match(/\/file\/d\/([A-Za-z0-9_-]{20,})/)?.[1] ??
    url.match(/[?&]id=([A-Za-z0-9_-]{20,})/)?.[1] ??
    null
  )
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number | null
}

/** Lists media files in a folder, newest first, following pagination. */
export async function listMedia(drive: drive_v3.Drive, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'video/' or mimeType contains 'image/')`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue
      out.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? '', size: f.size ? Number(f.size) : null })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function downloadFile(drive: drive_v3.Drive, fileId: string, dest: string): Promise<string> {
  await mkdir(path.dirname(dest), { recursive: true })
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  await pipeline(res.data as NodeJS.ReadableStream, createWriteStream(dest))
  return dest
}

/**
 * The -1 / -2 / -3 suffix on an export, which identifies which hook variant of
 * a task a file is. Files without a suffix are the task's only asset.
 */
export function variantIndex(filename: string): number | null {
  const m = filename.replace(/\.[^.]+$/, '').match(/-(\d{1,2})$/)
  return m ? Number(m[1]) : null
}

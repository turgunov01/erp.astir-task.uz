import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { homedir } from 'node:os'
import { storage, type StoredFile } from '../../src/lib/storage'
import { log } from './lib'

/**
 * Real files for the showcase, taken from a folder on this machine.
 *
 * The seed only needs "an image", "a short video", "a PDF": whatever the
 * folder holds is rotated through those pools. Nothing is copied verbatim
 * by name, so the same script works on any machine with any folder, and
 * with no folder at all every attachment simply stays metadata-only.
 */
const MEDIA_DIR = process.env.SHOWCASE_MEDIA_DIR ?? join(homedir(), 'Downloads')

/** Videos above this are skipped: a demo does not need a 200 MB blob per version. */
const MAX_VIDEO_BYTES = 12 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  // The API only accepts text/plain for notes, so Markdown travels as that.
  '.md': 'text/plain',
  '.txt': 'text/plain'
}

export interface MediaFile {
  path: string
  name: string
  ext: string
  mimeType: string
  size: number
}

export type Pool = 'image' | 'video' | 'pdf' | 'docx' | 'xlsx' | 'csv' | 'text' | 'zip'

function poolOf(ext: string, size: number): Pool | null {
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image'
  if (['.mp4', '.webm', '.mov'].includes(ext)) return size <= MAX_VIDEO_BYTES ? 'video' : null
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (ext === '.xlsx') return 'xlsx'
  if (ext === '.csv') return 'csv'
  if (ext === '.md' || ext === '.txt') return 'text'
  if (ext === '.zip') return 'zip'
  return null
}

const pools: Record<Pool, MediaFile[]> = {
  image: [], video: [], pdf: [], docx: [], xlsx: [], csv: [], text: [], zip: []
}
const cursors: Record<Pool, number> = {
  image: 0, video: 0, pdf: 0, docx: 0, xlsx: 0, csv: 0, text: 0, zip: 0
}

export function scanMedia() {
  let entries: string[] = []
  try {
    entries = readdirSync(MEDIA_DIR)
  } catch {
    log('media: folder ' + MEDIA_DIR + ' not readable, attachments stay metadata-only')
    return
  }
  for (const name of entries.sort()) {
    const path = join(MEDIA_DIR, name)
    let size = 0
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      size = stat.size
    } catch {
      continue
    }
    const ext = extname(name).toLowerCase()
    const pool = poolOf(ext, size)
    if (!pool) continue
    pools[pool].push({ path, name, ext, mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream', size })
  }
  log(
    'media: ' + Object.entries(pools)
      .map(([pool, files]) => pool + '=' + files.length)
      .join(', ') + ' from ' + MEDIA_DIR
  )
}

/** Next file of a kind, cycling so a small folder still covers every slot. */
export function next(pool: Pool): MediaFile | null {
  const files = pools[pool]
  if (files.length === 0) return null
  const file = files[cursors[pool] % files.length] as MediaFile
  cursors[pool] += 1
  return file
}

export interface Attachment extends StoredFile {
  /** Display name the ERP shows; the blob keeps only the extension. */
  name: string
}

/**
 * Copy a file into the ERP's storage under `prefix`, exactly as an upload
 * through POST /api/files would, and hand back what the row needs.
 */
export async function attach(
  file: MediaFile | null,
  prefix: string,
  displayName: string
): Promise<Attachment | null> {
  if (!file) return null
  const buffer = readFileSync(file.path)
  const stored = await storage.save({
    buffer,
    originalName: displayName + file.ext,
    mimeType: file.mimeType,
    prefix
  })
  return { ...stored, name: displayName + file.ext }
}

/** Convenience: attach the next file of a pool, or null when the pool is empty. */
export function attachNext(pool: Pool, prefix: string, displayName: string) {
  return attach(next(pool), prefix, displayName)
}

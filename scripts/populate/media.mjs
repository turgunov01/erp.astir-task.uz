'use strict'
/** Real files from a local folder, rotated through typed pools (same idea as prisma/showcase/media.ts). */
import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { homedir } from 'node:os'

const MEDIA_DIR = process.env.MEDIA_DIR ?? join(homedir(), 'Downloads')
const MAX_VIDEO_BYTES = 6 * 1024 * 1024

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv', '.md': 'text/plain', '.txt': 'text/plain'
}

function poolOf(ext, size) {
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

const pools = { image: [], video: [], pdf: [], docx: [], xlsx: [], csv: [], text: [], zip: [] }
const cursors = Object.fromEntries(Object.keys(pools).map(k => [k, 0]))

export function scanMedia() {
  let entries = []
  try { entries = readdirSync(MEDIA_DIR) } catch { return summary() }
  for (const name of entries.sort()) {
    const path = join(MEDIA_DIR, name)
    let size = 0
    try { const st = statSync(path); if (!st.isFile()) continue; size = st.size } catch { continue }
    const ext = extname(name).toLowerCase()
    const pool = poolOf(ext, size)
    if (pool) pools[pool].push({ path, ext, mimeType: MIME[ext] ?? 'application/octet-stream', size })
  }
  return summary()
}
function summary() {
  return Object.entries(pools).map(([k, v]) => k + '=' + v.length).join(', ') + ' from ' + MEDIA_DIR
}

/** Next file of a kind under a display name, or null when the pool is empty. */
export function next(pool, displayName) {
  const files = pools[pool]
  if (!files.length) return null
  const file = files[cursors[pool] % files.length]
  cursors[pool] += 1
  return { ...file, name: displayName + file.ext }
}

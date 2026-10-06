/**
 * What the file viewer needs to know about anything it can open.
 *
 * Documents, versions and asset thumbnails all have a URL and a mime type under
 * different column names; each surface maps its row into this shape once, and
 * the viewer, the thumbnail tiles and the info panel only ever read this.
 */
export interface ViewerItem {
  id: string
  name: string
  url: string
  mimeType: string | null
  /** Bytes; the API sends BigInt columns as strings. */
  size?: string | number | null
  author?: string | null
  createdAt?: string | null
  /** A lighter still for tiles and the strip, when the record has one. */
  previewUrl?: string | null
  /** One line of context: the task, the version, the asset. */
  caption?: string | null
}

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file'

const EXTENSION_KIND: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', avif: 'image', svg: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
  pdf: 'pdf',
  txt: 'text', csv: 'text'
}

/** Mime type first; the extension only when the type is missing. */
export function mediaKind(mimeType: string | null | undefined, name?: string | null): MediaKind {
  const mime = mimeType ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/plain' || mime === 'text/csv') return 'text'
  if (mime) return 'file'
  const extension = (name ?? '').split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_KIND[extension] ?? 'file'
}

export const MEDIA_KIND_ICON: Record<MediaKind, string> = {
  image: 'lucide:image',
  video: 'lucide:video',
  audio: 'lucide:music',
  pdf: 'lucide:file-text',
  text: 'lucide:file-text',
  file: 'lucide:file'
}

/**
 * The format as people name it — «DOCX», «MP4» — from the file extension.
 * A MIME type like application/vnd.openxmlformats-… is for machines, not for
 * the viewer's caption.
 */
export function fileFormat(name: string | null | undefined) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name ?? '')
  return match ? match[1]!.toUpperCase() : ''
}

/** Kind names in the current language; each read is a lookup, so they follow a language switch. */
export const MEDIA_KIND_LABEL: Record<MediaKind, string> = Object.freeze(
  (['image', 'video', 'audio', 'pdf', 'text', 'file'] as const).reduce((map, kind) => Object.defineProperty(map, kind, {
    enumerable: true,
    get: () => translate('projects.media.kind.' + kind)
  }), {} as Record<MediaKind, string>)
)

export function formatBytes(bytes: string | number | null | undefined) {
  if (bytes === null || bytes === undefined || bytes === '') return ''
  const value = Number(bytes)
  if (!Number.isFinite(value)) return ''
  // Decimals in the reader's convention: «2,2 МБ» in Russian, «2.2 MB» in English.
  const local = (n: number, digits: number) =>
    n.toLocaleString(intlTag(), { maximumFractionDigits: digits, minimumFractionDigits: digits })
  if (value < 1024) return translate('common.units.bytes', { n: value })
  if (value < 1024 * 1024) return translate('common.units.kilobytes', { n: Math.round(value / 1024) })
  if (value < 1024 * 1024 * 1024) return translate('common.units.megabytes', { n: local(value / (1024 * 1024), 1) })
  return translate('common.units.gigabytes', { n: local(value / (1024 * 1024 * 1024), 2) })
}

/**
 * Only site-relative, http(s) and blob URLs reach a src or href.
 *
 * Preview and thumbnail URLs can be typed in by hand, and a javascript: URL in
 * an iframe src would run in the app's origin.
 */
export function safeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const value = url.trim()
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (/^(https?:|blob:)/i.test(value)) return value
  return null
}

/** A row of /api/files, as every file list receives it. */
export interface DocumentLike {
  id: string
  name: string
  fileUrl: string
  mimeType: string | null
  fileSize?: string | number | null
  createdAt?: string | null
  uploadedBy?: { firstName: string, lastName: string } | null
  task?: { title: string } | null
}

export function documentToViewerItem(doc: DocumentLike): ViewerItem {
  return {
    id: doc.id,
    name: doc.name,
    url: doc.fileUrl,
    mimeType: doc.mimeType,
    size: doc.fileSize ?? null,
    author: doc.uploadedBy ? doc.uploadedBy.firstName + ' ' + doc.uploadedBy.lastName : null,
    createdAt: doc.createdAt ?? null,
    caption: doc.task?.title ?? null
  }
}

/** Seconds as h:mm:ss or m:ss, for durations in the info panel. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return ''
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s)
}

/**
 * Shot display code, e.g. EP01_SC03_SH014 (spec 14).
 *
 * Stored denormalised on the shot so lists and search hit one indexed column
 * instead of joining episode and scene on every row. Segments are omitted when
 * the shot is not attached to an episode or scene, which keeps codes valid for
 * one-off commercial work that has no episode structure.
 */
export interface ShotCodeParts {
  episodeNumber?: number | null
  sceneNumber?: number | null
  shotNumber: number
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

export function buildShotCode(parts: ShotCodeParts): string {
  const segments: string[] = []
  if (parts.episodeNumber != null) segments.push('EP' + pad(parts.episodeNumber, 2))
  if (parts.sceneNumber != null) segments.push('SC' + pad(parts.sceneNumber, 2))
  segments.push('SH' + pad(parts.shotNumber, 3))
  return segments.join('_')
}

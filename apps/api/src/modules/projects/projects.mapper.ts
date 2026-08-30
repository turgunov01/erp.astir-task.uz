/**
 * Project type lives under two names.
 *
 * Prisma identifiers cannot start with a digit, so the schema declares
 * ANIMATION_2D @map("2D_ANIMATION"). The database column and the public API
 * both use the spec value 2D_ANIMATION; only the generated client differs.
 * Translation is confined to this file so the mismatch never leaks further.
 */

const TO_PRISMA: Record<string, string> = {
  '2D_ANIMATION': 'ANIMATION_2D',
  '3D_ANIMATION': 'ANIMATION_3D'
}

const TO_WIRE: Record<string, string> = {
  ANIMATION_2D: '2D_ANIMATION',
  ANIMATION_3D: '3D_ANIMATION'
}

export function toPrismaProjectType<T extends string | undefined | null>(value: T): T {
  if (!value) return value
  return (TO_PRISMA[value] ?? value) as T
}

export function toWireProjectType<T extends string | undefined | null>(value: T): T {
  if (!value) return value
  return (TO_WIRE[value] ?? value) as T
}

/** Rewrite projectType on a single record before it leaves the API. */
export function toWireProject<T extends { projectType?: string }>(project: T): T {
  if (!project || typeof project.projectType !== 'string') return project
  return { ...project, projectType: toWireProjectType(project.projectType) }
}

export function toWireProjects<T extends { projectType?: string }>(projects: T[]): T[] {
  return projects.map(toWireProject)
}

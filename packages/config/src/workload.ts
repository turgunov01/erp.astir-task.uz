/** Utilisation bands shown on /team/workload (spec 32). */
export const UTILISATION_BANDS = [
  { max: 60, label: 'Available', tone: 'muted' },
  { max: 85, label: 'Normal', tone: 'success' },
  { max: 100, label: 'High', tone: 'warning' },
  { max: Infinity, label: 'Overloaded', tone: 'danger' }
] as const

export type UtilisationTone = (typeof UTILISATION_BANDS)[number]['tone']

export function utilisationBand(percent: number) {
  return UTILISATION_BANDS.find(band => percent <= band.max) ?? UTILISATION_BANDS[3]
}

/**
 * Project risk thresholds (spec 57).
 *
 * The core signal is schedule drift: elapsed time against progress. A project
 * 80% through its calendar but only 55% complete is drifting by 25 points.
 */
export const RISK_THRESHOLDS = {
  driftMedium: 10,
  driftHigh: 20,
  driftCritical: 35,
  /** Overdue tasks needed to escalate a level regardless of drift. */
  overdueTasksHigh: 5,
  overdueTasksCritical: 12
} as const

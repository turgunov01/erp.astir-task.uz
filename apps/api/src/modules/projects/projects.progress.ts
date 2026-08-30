import { RISK_THRESHOLDS } from '@astir/config'

export interface StageProgressRow {
  progress: number
  weight: number
  status: string
}

/**
 * Weighted project completion (spec 56).
 *
 * Progress is always derived, never typed in by a user, so the number on the
 * dashboard cannot drift from what the pipeline actually shows.
 */
export function calculateProgress(stages: StageProgressRow[]): number {
  if (stages.length === 0) return 0
  let weighted = 0
  let totalWeight = 0
  for (const stage of stages) {
    const weight = stage.weight > 0 ? stage.weight : 1
    const progress = stage.status === 'DONE' ? 100 : stage.progress
    weighted += progress * weight
    totalWeight += weight
  }
  return totalWeight === 0 ? 0 : Math.round(weighted / totalWeight)
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface RiskInput {
  progress: number
  startDate: Date | null
  deadline: Date | null
  overdueTasks: number
  now?: Date
}

/**
 * Schedule-drift risk (spec 57).
 *
 * Drift is elapsed calendar percentage minus completion percentage: a project
 * 80% through its schedule at 55% done is drifting 25 points. Overdue tasks
 * escalate independently, so a project can be flagged before its deadline
 * window even looks tight.
 */
export function calculateRisk(input: RiskInput): RiskLevel {
  const now = input.now ?? new Date()

  let level: RiskLevel = 'LOW'

  if (input.startDate && input.deadline) {
    const total = input.deadline.getTime() - input.startDate.getTime()
    const elapsed = now.getTime() - input.startDate.getTime()

    if (total > 0) {
      const elapsedPercent = Math.min(100, Math.max(0, (elapsed / total) * 100))
      const drift = elapsedPercent - input.progress

      if (drift >= RISK_THRESHOLDS.driftCritical) level = 'CRITICAL'
      else if (drift >= RISK_THRESHOLDS.driftHigh) level = 'HIGH'
      else if (drift >= RISK_THRESHOLDS.driftMedium) level = 'MEDIUM'
    }

    // Past the deadline and unfinished is critical regardless of drift maths.
    if (now.getTime() > input.deadline.getTime() && input.progress < 100) {
      level = 'CRITICAL'
    }
  }

  const order: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  const escalateTo = (target: RiskLevel) => {
    if (order.indexOf(target) > order.indexOf(level)) level = target
  }

  if (input.overdueTasks >= RISK_THRESHOLDS.overdueTasksCritical) escalateTo('CRITICAL')
  else if (input.overdueTasks >= RISK_THRESHOLDS.overdueTasksHigh) escalateTo('HIGH')

  return level
}

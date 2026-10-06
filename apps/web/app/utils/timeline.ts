/**
 * Shared vocabulary of the timeline page: payload types, status colours,
 * date arithmetic and grouping. The three views (list, charts, Gantt) read
 * the same payload, so they also agree on what "late" and "this group" mean.
 */
import { TASK_STATUS_LABEL, enumLabel } from './labels'

export interface TimelineTask {
  id: string
  title: string
  status: string
  priority: string
  startDate: string | null
  deadline: string | null
  projectId: string
  stageId: string | null
  assignee: { id: string, firstName: string, lastName: string } | null
  dependencies: Array<{ dependsOnTaskId: string }>
}

export interface TimelineMilestone {
  id: string
  name: string
  dueDate: string | null
  completedAt: string | null
}

export interface TimelineProject {
  id: string
  code: string
  name: string
  startDate: string | null
  deadline: string | null
  progress: number
  stages: Array<{ id: string, name: string, order: number }>
  milestones: TimelineMilestone[]
}

export interface TimelinePayload {
  projects: TimelineProject[]
  tasks: TimelineTask[]
  undated: number
  truncated: boolean
  limit: number
}

export type TimelineView = 'line' | 'chart' | 'gantt'
export type TimelineGroup = 'project' | 'stage' | 'assignee' | 'status'
export type TimelineScale = 'day' | 'week' | 'month'

export const TIMELINE_VIEWS: ReadonlyArray<{ key: TimelineView, label: string, icon: string }> = [
  { key: 'gantt', label: 'Гант', icon: 'lucide:chart-gantt' },
  { key: 'line', label: 'Лента', icon: 'lucide:list' },
  { key: 'chart', label: 'Графики', icon: 'lucide:chart-column-stacked' }
]

export const TIMELINE_GROUPS: ReadonlyArray<{ key: TimelineGroup, label: string }> = [
  { key: 'project', label: 'По проектам' },
  { key: 'stage', label: 'По этапам' },
  { key: 'assignee', label: 'По исполнителям' },
  { key: 'status', label: 'По статусам' }
]

export const TIMELINE_SCALES: ReadonlyArray<{ key: TimelineScale, label: string }> = [
  { key: 'day', label: 'Дни' },
  { key: 'week', label: 'Недели' },
  { key: 'month', label: 'Месяцы' }
]

/** Workflow order, used for legends, stacks and the status filter. */
export const TIMELINE_STATUS_ORDER = [
  'BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'DONE', 'BLOCKED'
] as const

/** Bar fill per status. Semantic: violet is work, amber waits on someone, green is done. */
export const TIMELINE_STATUS_BG: Record<string, string> = {
  BACKLOG: 'bg-slate-400 dark:bg-slate-500',
  READY: 'bg-sky-500',
  IN_PROGRESS: 'bg-violet-500',
  REVIEW: 'bg-amber-500',
  REVISION: 'bg-orange-500',
  APPROVED: 'bg-teal-500',
  DONE: 'bg-emerald-600',
  BLOCKED: 'bg-rose-700'
}

export function statusBg(status: string) {
  return TIMELINE_STATUS_BG[status] ?? 'bg-slate-400'
}

const FINISHED = new Set(['DONE', 'APPROVED'])

export function isFinished(status: string) {
  return FINISHED.has(status)
}

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(value: Date | number | string) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(value: Date, days: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return date
}

/** Monday of the week that contains the date (Russian weeks start on Monday). */
export function startOfWeek(value: Date) {
  const date = startOfDay(value)
  const shift = (date.getDay() + 6) % 7
  return addDays(date, -shift)
}

export function startOfMonth(value: Date) {
  const date = startOfDay(value)
  date.setDate(1)
  return date
}

/** yyyy-mm-dd in local time, the format the URL and date inputs use. */
export function toIsoDay(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return value.getFullYear() + '-' + pad(value.getMonth() + 1) + '-' + pad(value.getDate())
}

/** Whole days between two dates, robust to DST shifts. */
export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

/**
 * The days a task occupies, inclusive of its deadline day.
 *
 * A task with only a deadline is drawn as that one day; with only a start, as
 * the start day. Reversed dates (deadline before start) are swapped rather
 * than drawn as a negative bar.
 */
export function taskSpan(task: Pick<TimelineTask, 'startDate' | 'deadline'>) {
  const a = startOfDay(task.startDate ?? task.deadline ?? Date.now())
  const b = startOfDay(task.deadline ?? task.startDate ?? Date.now())
  const [first, last] = a <= b ? [a, b] : [b, a]
  return { start: first, end: addDays(last, 1) }
}

/** Late: the deadline day is over and the work is not finished. */
export function isLate(task: Pick<TimelineTask, 'deadline' | 'status'>, today = startOfDay(Date.now())) {
  if (!task.deadline || isFinished(task.status)) return false
  return startOfDay(task.deadline) < today
}

/** "1 задача", "3 задачи", "5 задач". */
export function tasksWord(count: number) {
  const tens = count % 100
  const ones = count % 10
  if (tens >= 11 && tens <= 14) return count + ' задач'
  if (ones === 1) return count + ' задача'
  if (ones >= 2 && ones <= 4) return count + ' задачи'
  return count + ' задач'
}

export function personName(person: { firstName: string, lastName: string } | null) {
  return person ? person.firstName + ' ' + person.lastName : 'Без исполнителя'
}

export function shortDay(value: Date | string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export interface TimelineGroupRow {
  key: string
  label: string
  /** Link for the header, only where a real page exists. */
  to?: string
  tasks: TimelineTask[]
}

interface GroupContext {
  projects: Map<string, TimelineProject>
  stages: Map<string, { name: string, order: number, projectId: string }>
}

export function groupContext(projects: TimelineProject[]): GroupContext {
  const stages = new Map<string, { name: string, order: number, projectId: string }>()
  for (const project of projects) {
    for (const stage of project.stages) {
      stages.set(stage.id, { name: stage.name, order: stage.order, projectId: project.id })
    }
  }
  return { projects: new Map(projects.map(project => [project.id, project])), stages }
}

function compareTasks(a: TimelineTask, b: TimelineTask) {
  const sa = taskSpan(a).start.getTime()
  const sb = taskSpan(b).start.getTime()
  return sa - sb || a.title.localeCompare(b.title, 'ru')
}

/**
 * Bucket tasks into the chosen grouping, groups in a stable meaningful order:
 * projects by code, stages by pipeline order, people by name, statuses by
 * workflow. Tasks inside a group run by start date.
 */
export function groupTasks(
  tasks: TimelineTask[],
  group: TimelineGroup,
  context: GroupContext,
  multiProject: boolean
): TimelineGroupRow[] {
  const buckets = new Map<string, TimelineGroupRow & { sort: string }>()

  for (const task of tasks) {
    const project = context.projects.get(task.projectId)
    let key: string
    let label: string
    let sort: string
    let to: string | undefined

    if (group === 'project') {
      key = task.projectId
      label = project ? project.code + ' · ' + project.name : 'Проект'
      sort = project?.code ?? ''
      to = '/projects/' + task.projectId
    } else if (group === 'stage') {
      const stage = task.stageId ? context.stages.get(task.stageId) : null
      key = task.stageId ?? 'none:' + (multiProject ? task.projectId : '')
      const prefix = multiProject && project ? project.code + ' · ' : ''
      label = prefix + (stage?.name ?? 'Без этапа')
      sort = (project?.code ?? '') + String(stage?.order ?? 9999).padStart(5, '0')
    } else if (group === 'assignee') {
      key = task.assignee?.id ?? 'none'
      label = personName(task.assignee)
      sort = task.assignee ? label : '￿'
    } else {
      key = task.status
      label = enumLabel(TASK_STATUS_LABEL, task.status)
      const index = (TIMELINE_STATUS_ORDER as readonly string[]).indexOf(task.status)
      sort = String(index < 0 ? 99 : index).padStart(2, '0')
    }

    const bucket = buckets.get(key)
    if (bucket) bucket.tasks.push(task)
    else buckets.set(key, { key, label, to, sort, tasks: [task] })
  }

  return [...buckets.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort, 'ru'))
    .map(({ sort: _sort, ...row }) => ({ ...row, tasks: [...row.tasks].sort(compareTasks) }))
}

export interface StatusCount {
  status: string
  count: number
}

/** Counts per status in workflow order, zero rows dropped. */
export function countByStatus(tasks: TimelineTask[]): StatusCount[] {
  const counts = new Map<string, number>()
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1)
  return TIMELINE_STATUS_ORDER
    .map(status => ({ status, count: counts.get(status) ?? 0 }))
    .filter(row => row.count > 0)
}

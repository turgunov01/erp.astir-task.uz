/**
 * Enum labels and the formatters every page shares, in the current language.
 *
 * The database stores English enum members; the words people read live in
 * i18n/locales/<lang>/common.json under `common.enum.<name>.<VALUE>`. The maps
 * below keep the names and shape existing code imports (`TASK_STATUS_LABEL`,
 * `labelOf(map, value)`, `enumOptions(map)`), but every lookup is a getter that
 * reads the active language, so a label re-renders when the language changes
 * and a page nobody has converted yet still shows its badges translated.
 *
 * Adding a member: add its key to the list here and its words to all four
 * common.json files (`pnpm check:i18n` reports a missing one).
 */

type LabelMap = Record<string, string>

/**
 * A map whose values are looked up when read. Keys keep declaration order, so
 * `enumOptions(map)` lists choices the way they are written here.
 */
function enumLabels(name: string, keys: readonly string[]): LabelMap {
  const map: LabelMap = {}
  for (const key of keys) {
    Object.defineProperty(map, key, {
      enumerable: true,
      get: () => translate('common.enum.' + name + '.' + key)
    })
  }
  return Object.freeze(map)
}

/** Several maps as one; for a key in more than one, the later map wins. */
function mergeLabels(...maps: LabelMap[]): LabelMap {
  const merged: LabelMap = {}
  for (const map of maps) {
    for (const key of Object.keys(map)) {
      Object.defineProperty(merged, key, {
        enumerable: true,
        configurable: true,
        get: () => map[key] as string
      })
    }
  }
  return Object.freeze(merged)
}

export const ASSET_TYPE_LABEL = enumLabels('assetType', [
  'CHARACTER', 'ENVIRONMENT', 'PROP', 'MODEL', 'RIG', 'TEXTURE', 'ANIMATION',
  'AUDIO', 'REFERENCE', 'TEMPLATE', 'OTHER'
])

export const PRIORITY_LABEL = enumLabels('priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT'])

export const REVISION_STATUS_LABEL = enumLabels('revisionStatus', [
  'OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'COMPLETED', 'CANCELLED'
])

export const RENDER_STATUS_LABEL = enumLabels('renderStatus', [
  'QUEUED', 'RENDERING', 'COMPLETED', 'FAILED', 'CANCELLED'
])

export const PRODUCTION_STATUS_LABEL = enumLabels('productionStatus', [
  'NOT_STARTED', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'COMPLETED', 'ON_HOLD'
])

/*
 * Uzbek always goes through the catalogue: browsers differ in whether they
 * carry Uzbek calendar data, and the server and the browser must print the
 * same string or hydration breaks. Other languages fall back only when the
 * runtime turns out to lack their data.
 */
function catalogueDates(): boolean {
  return currentLocale() === 'uz' || !hasIntlData()
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

/** «31-okt, 2026», the Uzbek short form, built from catalogue month names. */
function catalogueDay(date: Date) {
  return pad2(date.getDate()) + '-' + monthShortName(date.getMonth()) + ', ' + date.getFullYear()
}

/** Full date and time, for detail panels where precision matters. */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (catalogueDates()) {
    return catalogueDay(date) + ', ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes())
  }
  return date.toLocaleString(intlTag(), {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

/** Day-level date, for table cells and deadlines. */
export function formatDay(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (catalogueDates()) return catalogueDay(date)
  return date.toLocaleDateString(intlTag(), {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

/** How Uzbek writes currencies after the amount. */
const UZ_CURRENCY_SUFFIX: Record<string, string> = { UZS: 'so‘m', USD: 'US$', EUR: '€', RUB: '₽' }

/** «36 000 US$»: space-grouped, comma decimals, currency after the amount. */
function catalogueMoney(value: number, currency: string, maximumFractionDigits: number) {
  const digits = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0, maximumFractionDigits
  }).format(value)
  return digits + ' ' + (UZ_CURRENCY_SUFFIX[currency] ?? currency)
}

/**
 * Money with its own currency, in the reader's number conventions.
 *
 * Records keep the kopecks by default; roll-ups pass 0, because a portfolio
 * total to the kopeck is false precision nobody reads.
 */
export function formatMoney(
  value: number | null | undefined,
  currency = 'USD',
  maximumFractionDigits = 2
) {
  if (value === null || value === undefined) return '—'
  if (currentLocale() === 'uz') return catalogueMoney(value, currency, maximumFractionDigits)
  return new Intl.NumberFormat(intlTag(), {
    style: 'currency', currency, maximumFractionDigits
  }).format(value)
}

export function fullName(
  person: { firstName: string, lastName: string } | null | undefined
) {
  return person ? person.firstName + ' ' + person.lastName : '—'
}

export const CLIENT_STATUS_LABEL = enumLabels('clientStatus', ['ACTIVE', 'INACTIVE', 'ARCHIVED'])

export const ROLE_LABEL = enumLabels('role', [
  'OWNER', 'ADMIN', 'PRODUCER', 'PROJECT_MANAGER', 'ART_DIRECTOR', 'ARTIST', 'CLIENT', 'FINANCE'
])

const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED', 'PROJECT_ASSIGNED', 'TASK_REVIEW', 'TASK_OVERDUE', 'COMMENT_MENTION',
  'VERSION_SUBMITTED', 'VERSION_APPROVED', 'CHANGES_REQUESTED', 'REVISION_CREATED',
  'PROJECT_DEADLINE', 'SHOT_DEADLINE', 'RENDER_FAILED'
] as const

/** Notification types as the preferences screen names them, in its order. */
export const NOTIFICATION_TYPE_LABEL: Record<string, { title: string, hint: string }> = (() => {
  const map: Record<string, { title: string, hint: string }> = {}
  for (const type of NOTIFICATION_TYPES) {
    Object.defineProperty(map, type, {
      enumerable: true,
      get: () => ({
        title: translate('common.enum.notificationType.' + type + '.title'),
        hint: translate('common.enum.notificationType.' + type + '.hint')
      })
    })
  }
  return Object.freeze(map)
})()

export const EMPLOYMENT_TYPE_LABEL = enumLabels('employmentType', [
  'FULL_TIME', 'PART_TIME', 'FREELANCE', 'INTERN'
])

export const EMPLOYEE_STATUS_LABEL = enumLabels('employeeStatus', ['ACTIVE', 'ON_LEAVE', 'INACTIVE'])

export const DOCUMENT_TYPE_LABEL = enumLabels('documentType', [
  'CONTRACT', 'BRIEF', 'SPECIFICATION', 'INVOICE', 'ACT', 'NDA', 'OTHER'
])

export const REVIEW_STATUS_LABEL = enumLabels('reviewStatus', [
  'PENDING', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED',
  // Deadline passed with nobody deciding: the discussion window closed.
  'EXPIRED'
])

export const REVIEW_TYPE_LABEL = enumLabels('reviewType', ['INTERNAL', 'ART_DIRECTOR', 'CLIENT', 'FINAL'])

/** Turn a label map into select options, preserving declaration order. */
export function enumOptions(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }))
}

export const PROJECT_STATUS_LABEL = enumLabels('projectStatus', [
  'DRAFT', 'PLANNING', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'CLIENT_REVIEW',
  'DELIVERY', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'ARCHIVED'
])

export const PROJECT_TYPE_LABEL = enumLabels('projectType', [
  '2D_ANIMATION', '3D_ANIMATION', 'MOTION_DESIGN', 'COMMERCIAL', 'SHORT_FILM',
  'SERIES', 'FEATURE_FILM', 'OTHER'
])

export const TASK_STATUS_LABEL = enumLabels('taskStatus', [
  'BACKLOG', 'READY', 'IN_PROGRESS', 'REVIEW', 'REVISION', 'APPROVED', 'DONE', 'BLOCKED'
])

/** Shown when a value has no translation, never the raw English member: «Не указано». */
export function unknownLabel() {
  return translate('common.unknown')
}

/**
 * The one way to put an enum value in front of a user.
 *
 * A missing translation must not leak `IN_PROGRESS` into the interface, so an
 * unknown member falls back to a neutral word, never the raw value.
 */
export function labelOf(
  map: Record<string, string>,
  value: string | null | undefined,
  fallback?: string
) {
  const neutral = fallback ?? unknownLabel()
  if (value === null || value === undefined || value === '') return neutral
  return map[value] ?? neutral
}

/** Kept for existing callers; same contract as labelOf. */
export function enumLabel(map: Record<string, string>, value: string | null | undefined) {
  return labelOf(map, value)
}

/** «В работе» → «На проверке»: a task status move as people read it in history. */
export function statusChangeText(from: string, to: string) {
  return translate('common.statusChange', {
    from: labelOf(TASK_STATUS_LABEL, from),
    to: labelOf(TASK_STATUS_LABEL, to)
  })
}

/** Pipeline stage state, shared by project stages and shot stages. */
export const STAGE_STATUS_LABEL = enumLabels('stageStatus', [
  'NOT_STARTED', 'READY', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE'
])

export const VERSION_STATUS_LABEL = enumLabels('versionStatus', [
  'WORKING', 'SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUPERSEDED'
])

export const NOTIFICATION_CHANNEL_LABEL = enumLabels('notificationChannel', ['IN_APP', 'EMAIL', 'TELEGRAM'])

/**
 * One lookup for status badges, which do not know which enum they were given.
 *
 * The enums overlap (`APPROVED`, `COMPLETED`, `IN_PROGRESS` appear in several)
 * but the overlapping members mean the same thing, so a merged map is safe.
 * More specific maps come last and win.
 */
export const STATUS_LABEL = mergeLabels(
  PRODUCTION_STATUS_LABEL,
  TASK_STATUS_LABEL,
  REVISION_STATUS_LABEL,
  RENDER_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  CLIENT_STATUS_LABEL,
  EMPLOYEE_STATUS_LABEL,
  // Version statuses that no other map names.
  enumLabels('versionStatus', ['WORKING', 'SUBMITTED', 'SUPERSEDED'])
)

export const EXPENSE_CATEGORY_LABEL = enumLabels('expenseCategory', [
  'EMPLOYEE', 'FREELANCER', 'RENDER', 'SOFTWARE', 'HARDWARE', 'AUDIO', 'PRODUCTION',
  'OFFICE', 'TAXES', 'MARKETING', 'OTHER'
])

/** How money moved, for payments and expenses alike. */
export const PAYMENT_METHOD_LABEL = enumLabels('paymentMethod', ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'])

/*
 * Kept out of STATUS_LABEL on purpose: PENDING already means "Ожидает" for a
 * review, and merging this map would silently retitle every review badge.
 * StatusBadge reaches it through kind="payment" instead.
 */
export const PAYMENT_STATUS_LABEL = enumLabels('paymentStatus', [
  'PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'
])

/** Employee pay adjustments (client item 7). */
export const PAYROLL_TYPE_LABEL = enumLabels('payrollType', [
  'ADVANCE', 'BONUS', 'PENALTY', 'LATENESS', 'DEDUCTION', 'OTHER_ACCRUAL'
])

/** Types that add to pay; the rest are taken from it. */
export const PAYROLL_ACCRUAL_TYPES: ReadonlySet<string> = new Set(['BONUS', 'OTHER_ACCRUAL'])

export const PAYROLL_STATUS_LABEL = enumLabels('payrollStatus', ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'])

export const PAYROLL_SOURCE_LABEL = enumLabels('payrollSource', [
  'MANUAL',
  // Also lateness fines generated from employee activity (attendance).
  'TIMESHEET',
  'EXTERNAL'
])

export const RISK_LABEL = enumLabels('risk', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])

/**
 * What each recorded action says in the interface.
 *
 * The log stores machine names like task.status_changed; the words live under
 * common.enum.activityAction.<family>.<action>. The feed falls back to the
 * machine name only for actions nobody has translated yet.
 */
export const ACTIVITY_ACTION_LABEL = enumLabels('activityAction', [
  'created', 'updated', 'deleted',
  'project.created', 'project.status_changed', 'project.archived', 'project.hard_deleted',
  'member.added', 'member.removed',
  'stage.created', 'stage.status_changed',
  'episode.created', 'episode.status_changed',
  'scene.created', 'scene.status_changed',
  'shot.created', 'shot.status_changed',
  'shot_stage.status_changed',
  'task.created', 'task.assigned', 'task.status_changed', 'task.archived', 'task.unarchived', 'task.deleted',
  'version.created', 'version.submitted', 'version.deleted',
  'revision.created', 'revision.status_changed', 'revision.deleted',
  'render.queued', 'asset.created', 'file.uploaded',
  'review.approved', 'review.changes_requested', 'review.rejected',
  'finance.budget_saved', 'finance.budget_deleted',
  'finance.expense_created', 'finance.expense_updated', 'finance.expense_deleted',
  'finance.invoice_created', 'finance.invoice_updated', 'finance.invoice_deleted',
  'finance.payment_created', 'finance.payment_updated', 'finance.payment_deleted',
  'settings.updated', 'settings.template_created', 'settings.template_updated',
  'settings.template_deleted', 'settings.mail_tested',
  'client.created', 'client.updated', 'client.archived',
  'department.created', 'department.updated', 'department.deleted',
  'employee.updated', 'employee.email_verified_manually',
  'user.created', 'user.role_changed', 'user.deactivated',
  'attendance.checked_in', 'attendance.checked_out'
])

/** The part before the dot in an action name, for the feed's filter. */
export const ACTIVITY_FAMILY_LABEL = enumLabels('activityFamily', [
  'created', 'updated', 'deleted',
  'project', 'member', 'stage', 'episode', 'scene', 'shot', 'shot_stage', 'task',
  'version', 'review', 'revision', 'render', 'asset', 'file', 'finance', 'settings',
  'client', 'department', 'employee', 'user', 'payroll', 'attendance', 'comment', 'timesheet'
])

/**
 * «3 задачи», «5 версий»: a count with the noun in the right form.
 *
 * Two forms of call:
 *   countLabel(3, 'common.count.tasks')         i18n plural message, any language
 *   countLabel(3, 'задача', 'задачи', 'задач')  legacy, Russian words only
 *
 * The legacy form only exists so pages not yet converted keep compiling; it
 * stays Russian whatever the language. Convert call sites to the first form
 * with a `{n} word | {n} words` message.
 */
export function countLabel(count: number, key: string): string
export function countLabel(count: number, one: string, few: string, many: string): string
export function countLabel(count: number, oneOrKey: string, few?: string, many?: string): string {
  if (few === undefined || many === undefined) return translate(oneOrKey, count)
  const n = Math.abs(count) % 100
  const last = n % 10
  const word = n > 10 && n < 20 ? many : last === 1 ? oneOrKey : last >= 2 && last <= 4 ? few : many
  return count + ' ' + word
}

/** Entity names as they read in a sentence about them. */
export const ENTITY_TYPE_LABEL = enumLabels('entityType', [
  'Project', 'ProjectStage', 'ProjectMember', 'Episode', 'Scene', 'Shot', 'ShotStage', 'Task',
  'Version', 'Review', 'Revision', 'RenderJob', 'Asset', 'Document', 'Client', 'Department',
  'Employee', 'User', 'ProjectBudget', 'Expense', 'Invoice', 'Payment', 'StudioSettings',
  'PipelineTemplate'
])

/**
 * Rough age of an event, for feeds where the exact minute does not matter.
 *
 * Deliberately coarse: past a day nobody counts hours, and a feed full of
 * precise timestamps is harder to skim than one that says "3 дн назад".
 */
export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return '—'
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return translate('common.time.justNow')
  if (minutes < 60) return translate('common.time.minutesAgo', { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return translate('common.time.hoursAgo', { n: hours })
  return translate('common.time.daysAgo', { n: Math.round(hours / 24) })
}

/**
 * The permission catalogue as the role editor shows it: grouped by the section
 * of the app it unlocks, in sidebar order, with the page-opening right first
 * in each group so the "who sees this page" question reads off the top row.
 *
 * Labels are getters over common.permission.{group,item}.* (a permission's
 * `:` is written `_` in the key).
 */
export interface PermissionGroup {
  readonly label: string
  permissions: ReadonlyArray<{ key: string, readonly label: string }>
}

function permissionGroup(id: string, keys: readonly string[]): PermissionGroup {
  return {
    get label() { return translate('common.permission.group.' + id) },
    permissions: keys.map(key => ({
      key,
      get label() { return translate('common.permission.item.' + key.replaceAll(':', '_')) }
    }))
  }
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  permissionGroup('dashboard', ['dashboard:view']),
  permissionGroup('projects', ['project:view', 'project:create', 'project:update', 'project:archive', 'project:delete']),
  permissionGroup('production', ['production:view', 'production:manage', 'pipeline:manage']),
  permissionGroup('tasks', ['task:view:own', 'task:view', 'task:create', 'task:update', 'task:assign']),
  permissionGroup('versions', ['version:view', 'version:upload', 'version:delete:approved']),
  permissionGroup('reviews', ['review:view', 'review:internal', 'review:client', 'review:approve']),
  permissionGroup('revisions', ['revision:view', 'revision:manage']),
  permissionGroup('assets', ['asset:view', 'asset:manage']),
  permissionGroup('render', ['render:view', 'render:manage']),
  permissionGroup('team', ['team:view', 'team:manage', 'workload:view']),
  permissionGroup('attendance', ['attendance:view', 'attendance:self', 'attendance:manage']),
  permissionGroup('time', ['timesheet:view:own', 'timesheet:view:all', 'timesheet:submit']),
  permissionGroup('clients', ['client:view', 'client:manage']),
  permissionGroup('finance', ['finance:view', 'finance:manage', 'budget:view']),
  permissionGroup('payroll', ['payroll:view:own', 'payroll:view', 'payroll:manage']),
  permissionGroup('reports', ['report:view']),
  permissionGroup('documents', ['document:view', 'document:manage']),
  permissionGroup('activity', ['activity:view', 'audit:view']),
  permissionGroup('settings', ['settings:view', 'settings:manage', 'user:manage', 'permission:manage'])
]

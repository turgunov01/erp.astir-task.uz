import {
  ASSET_TYPE_LABEL,
  CLIENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYROLL_TYPE_LABEL,
  PRIORITY_LABEL,
  PRODUCTION_STATUS_LABEL,
  RENDER_STATUS_LABEL,
  REVIEW_TYPE_LABEL,
  REVISION_STATUS_LABEL,
  ROLE_LABEL,
  enumOptions
} from './labels'
import { translate } from './i18n'
import type { EntityFormConfig, FormField } from './entity-form'

/**
 * Form specs for every table-backed entity.
 *
 * Each one mirrors the Zod schema the API validates against, so a field the
 * server will reject never reaches the user as a form input. Fields absent from
 * an update schema are marked `createOnly`; fields that only exist once the row
 * does are marked `editOnly`. Optional fields whose column is NOT NULL (a
 * status, a currency, a sequence number) are marked `notNull`: blank on create
 * lets the server default apply, and on edit they cannot be cleared. Every
 * other optional field is cleared with null when emptied in an edit.
 *
 * The words live in `production.forms.*`. These objects are built once, at
 * import, so every text property is a getter that reads the current language
 * when the panel renders — a plain string would freeze the language the module
 * happened to load in.
 */

const FIELD = 'production.forms.fields.'
const HINT = 'production.forms.hints.'
const PLACEHOLDER = 'production.forms.placeholders.'

/** A field as written below: message keys instead of words. */
interface FieldSpec extends Omit<FormField, 'label' | 'hint' | 'placeholder' | 'options'> {
  /** Key under production.forms.fields. */
  label: string
  /** Key under production.forms.hints. */
  hint?: string
  /** Key under production.forms.placeholders. */
  placeholder?: string
  /** A placeholder that is the same in every language: `USD`, `https://…`. */
  example?: string
  /** Enum label map; listed in the current language whenever it is read. */
  options?: Record<string, string>
}

function lazy<T extends object>(target: T, name: string, read: () => unknown): T {
  Object.defineProperty(target, name, { enumerable: true, get: read })
  return target
}

function field(spec: FieldSpec): FormField {
  const { label, hint, placeholder, example, options, ...rest } = spec
  const out = { ...rest } as FormField
  lazy(out, 'label', () => translate(FIELD + label))
  if (hint) lazy(out, 'hint', () => translate(HINT + hint))
  if (placeholder) lazy(out, 'placeholder', () => translate(PLACEHOLDER + placeholder))
  else if (example) out.placeholder = example
  if (options) lazy(out, 'options', () => enumOptions(options))
  return out
}

function form(
  endpoint: string,
  name: string,
  fields: FieldSpec[],
  columns?: EntityFormConfig['columns']
): EntityFormConfig {
  const config = { endpoint, fields: fields.map(field), ...(columns ? { columns } : {}) } as EntityFormConfig
  lazy(config, 'createTitle', () => translate('production.forms.' + name + '.createTitle'))
  lazy(config, 'editTitle', () => translate('production.forms.' + name + '.editTitle'))
  return config
}

const PROJECT_SOURCE = { url: '/api/projects', labelKeys: ['code', 'name'] }
const CLIENT_SOURCE = { url: '/api/clients', labelKeys: ['name'] }
const INVOICE_SOURCE = { url: '/api/finance/invoices', labelKeys: ['number'] }
/*
 * Employees list rows describe the employment record, and the person sits
 * under `user`. Fields like assigneeId reference the user, not the employment
 * record, so the value has to be userId.
 */
const USER_SOURCE = {
  url: '/api/employees',
  valueKey: 'userId',
  labelKeys: ['user.firstName', 'user.lastName']
}

/** The attachments field every entity with documents carries. */
function files(attachTo: string): FieldSpec {
  return { key: 'attachments', label: 'files', type: 'files', attachTo, wide: true, hint: 'files' }
}

/** Project picker of a row that belongs to one project for life. */
const OWNING_PROJECT: FieldSpec = {
  key: 'projectId',
  label: 'project',
  type: 'select',
  required: true,
  source: PROJECT_SOURCE,
  createOnly: true
}

const CLIENT_FORM = form('/api/clients', 'client', [
  { key: 'name', label: 'personName', type: 'text', required: true, placeholder: 'howToAddress' },
  { key: 'companyName', label: 'companyName', type: 'text' },
  { key: 'email', label: 'email', type: 'text', example: 'name@example.com' },
  { key: 'phone', label: 'phone', type: 'text' },
  { key: 'country', label: 'country', type: 'text' },
  { key: 'status', label: 'status', type: 'select', options: CLIENT_STATUS_LABEL, notNull: true },
  { key: 'notes', label: 'notes', type: 'textarea' },
  files('clientId')
])

const ASSET_FORM = form('/api/assets', 'asset', [
  { key: 'name', label: 'name', type: 'text', required: true },
  { key: 'type', label: 'type', type: 'select', required: true, options: ASSET_TYPE_LABEL },
  { key: 'projectId', label: 'project', type: 'select', source: PROJECT_SOURCE, placeholder: 'sharedAsset' },
  { key: 'ownerId', label: 'owner', type: 'select', source: USER_SOURCE },
  { key: 'status', label: 'status', type: 'select', options: PRODUCTION_STATUS_LABEL, notNull: true },
  { key: 'thumbnailUrl', label: 'thumbnailUrl', type: 'text', wide: true },
  { key: 'description', label: 'description', type: 'textarea' },
  files('assetId')
])

const DOCUMENT_FORM = form('/api/files', 'document', [
  { key: 'name', label: 'name', type: 'text', required: true },
  { key: 'type', label: 'type', type: 'select', required: true, options: DOCUMENT_TYPE_LABEL },
  { key: 'projectId', label: 'project', type: 'select', source: PROJECT_SOURCE },
  { key: 'clientId', label: 'client', type: 'select', source: CLIENT_SOURCE }
])

const EPISODE_FORM = form('/api/episodes', 'episode', [
  OWNING_PROJECT,
  { key: 'title', label: 'title', type: 'text', required: true },
  { key: 'number', label: 'number', type: 'number', hint: 'nextNumber', notNull: true },
  { key: 'duration', label: 'durationSeconds', type: 'number' },
  { key: 'status', label: 'status', type: 'select', options: PRODUCTION_STATUS_LABEL, notNull: true },
  { key: 'startDate', label: 'startDate', type: 'date' },
  { key: 'deadline', label: 'deadline', type: 'date' },
  { key: 'description', label: 'description', type: 'textarea' },
  files('episodeId')
])

const SCENE_FORM = form('/api/scenes', 'scene', [
  OWNING_PROJECT,
  { key: 'episodeId', label: 'episode', type: 'select', source: { url: '/api/episodes', labelKeys: ['title'] } },
  { key: 'name', label: 'name', type: 'text', required: true },
  { key: 'sceneNumber', label: 'number', type: 'number', hint: 'nextNumber', notNull: true },
  { key: 'duration', label: 'durationSeconds', type: 'number' },
  { key: 'status', label: 'status', type: 'select', options: PRODUCTION_STATUS_LABEL, notNull: true },
  { key: 'description', label: 'description', type: 'textarea' },
  files('sceneId')
])

const SHOT_FORM = form('/api/shots', 'shot', [
  OWNING_PROJECT,
  { key: 'sceneId', label: 'scene', type: 'select', source: { url: '/api/scenes', labelKeys: ['name'] } },
  { key: 'name', label: 'name', type: 'text' },
  { key: 'shotNumber', label: 'number', type: 'number', hint: 'nextNumber', notNull: true },
  { key: 'fps', label: 'fps', type: 'number', notNull: true },
  { key: 'startFrame', label: 'startFrame', type: 'number' },
  { key: 'endFrame', label: 'endFrame', type: 'number' },
  { key: 'duration', label: 'durationSeconds', type: 'number' },
  { key: 'assigneeId', label: 'assignee', type: 'select', source: USER_SOURCE },
  { key: 'status', label: 'status', type: 'select', options: PRODUCTION_STATUS_LABEL, notNull: true },
  { key: 'deadline', label: 'deadline', type: 'date' },
  { key: 'description', label: 'description', type: 'textarea' },
  files('shotId')
])

const REVISION_FORM = form('/api/revisions', 'revision', [
  OWNING_PROJECT,
  { key: 'title', label: 'revision', type: 'text', required: true },
  { key: 'shotId', label: 'shot', type: 'select', source: { url: '/api/shots', labelKeys: ['code'] } },
  { key: 'taskId', label: 'task', type: 'select', source: { url: '/api/tasks', labelKeys: ['title'] } },
  { key: 'assignedToId', label: 'assignee', type: 'select', source: USER_SOURCE },
  { key: 'priority', label: 'priority', type: 'select', options: PRIORITY_LABEL, notNull: true },
  {
    key: 'status',
    label: 'status',
    type: 'select',
    options: REVISION_STATUS_LABEL,
    editOnly: true,
    notNull: true
  },
  { key: 'deadline', label: 'deadline', type: 'date' },
  { key: 'description', label: 'description', type: 'textarea' },
  files('revisionId')
])

const RENDER_FORM = form('/api/render', 'render', [
  OWNING_PROJECT,
  {
    key: 'shotId',
    label: 'shot',
    type: 'select',
    source: { url: '/api/shots', labelKeys: ['code'] },
    createOnly: true
  },
  { key: 'startFrame', label: 'startFrame', type: 'number', createOnly: true },
  { key: 'endFrame', label: 'endFrame', type: 'number', createOnly: true },
  { key: 'priority', label: 'priority', type: 'select', options: PRIORITY_LABEL, notNull: true },
  {
    key: 'status',
    label: 'status',
    type: 'select',
    options: RENDER_STATUS_LABEL,
    editOnly: true,
    notNull: true
  },
  { key: 'progress', label: 'progress', type: 'number', editOnly: true, notNull: true },
  {
    key: 'nodeId',
    label: 'node',
    type: 'select',
    source: { url: '/api/render/nodes', labelKeys: ['name'] },
    editOnly: true
  },
  { key: 'errorMessage', label: 'errorMessage', type: 'textarea', editOnly: true },
  files('renderJobId')
])

// A short form: one column keeps the fields from drifting apart.
const REVIEW_FORM = form('/api/reviews', 'review', [
  {
    key: 'versionId',
    label: 'version',
    type: 'select',
    required: true,
    source: { url: '/api/versions', labelKeys: ['label'] },
    createOnly: true,
    hint: 'reviewVersion'
  },
  { key: 'reviewType', label: 'reviewType', type: 'select', options: REVIEW_TYPE_LABEL, notNull: true },
  {
    key: 'reviewerId',
    label: 'reviewer',
    type: 'select',
    source: USER_SOURCE,
    placeholder: 'anyTeamMember'
  },
  { key: 'deadline', label: 'reviewDeadline', type: 'date', hint: 'reviewDeadline' },
  { key: 'comment', label: 'reviewComment', type: 'textarea', placeholder: 'reviewComment' },
  files('reviewId')
], 1)

const DEPARTMENT_FORM = form('/api/departments', 'department', [
  { key: 'name', label: 'name', type: 'text', required: true },
  { key: 'description', label: 'description', type: 'textarea' },
  files('departmentId')
])

const EMPLOYEE_FORM = form('/api/employees', 'employee', [
  // The person's name and role live on the login, under `user` in the row.
  { key: 'firstName', path: 'user.firstName', label: 'firstName', type: 'text', required: true },
  { key: 'lastName', path: 'user.lastName', label: 'lastName', type: 'text', required: true },
  { key: 'email', label: 'email', type: 'text', required: true, createOnly: true, hint: 'loginEmail' },
  { key: 'password', label: 'password', type: 'text', required: true, createOnly: true, hint: 'password' },
  { key: 'position', label: 'position', type: 'text', required: true },
  { key: 'role', path: 'user.role', label: 'role', type: 'select', options: ROLE_LABEL, notNull: true },
  {
    key: 'departmentId',
    label: 'department',
    type: 'select',
    source: { url: '/api/departments', labelKeys: ['name'] }
  },
  {
    key: 'employmentType',
    label: 'employmentType',
    type: 'select',
    options: EMPLOYMENT_TYPE_LABEL,
    notNull: true
  },
  { key: 'hourlyRate', label: 'hourlyRate', type: 'number' },
  { key: 'weeklyCapacityHours', label: 'weeklyHours', type: 'number', notNull: true },
  { key: 'status', label: 'status', type: 'select', options: EMPLOYEE_STATUS_LABEL, notNull: true },
  files('employeeId')
])

/*
 * Finance forms.
 *
 * Currency sits on each record rather than on the studio: an invoice to a
 * client in USD and a contractor paid in UZS happen in the same week, and one
 * studio-wide currency would quietly misreport both.
 */

const EXPENSE_FORM = form('/api/finance/expenses', 'expense', [
  {
    key: 'projectId',
    label: 'project',
    type: 'select',
    source: PROJECT_SOURCE,
    placeholder: 'studioNoProject',
    hint: 'expenseProject'
  },
  { key: 'category', label: 'category', type: 'select', required: true, options: EXPENSE_CATEGORY_LABEL },
  { key: 'amount', label: 'amount', type: 'number', required: true },
  { key: 'currency', label: 'currency', type: 'text', example: 'USD', notNull: true },
  { key: 'date', label: 'date', type: 'date', required: true },
  { key: 'vendor', label: 'vendor', type: 'text', placeholder: 'paidTo' },
  {
    key: 'paymentMethod',
    label: 'paymentMethod',
    type: 'select',
    placeholder: 'notSpecified',
    options: PAYMENT_METHOD_LABEL
  },
  { key: 'vatAmount', label: 'vat', type: 'number', hint: 'expenseVat' },
  { key: 'documentNumber', label: 'documentNumber', type: 'text', placeholder: 'documentKinds' },
  { key: 'documentUrl', label: 'documentUrl', type: 'text', example: 'https://…', wide: true },
  { key: 'description', label: 'description', type: 'textarea', wide: true }
], 2)

/*
 * The payroll endpoint lists employees itself: the finance role that writes
 * these entries does not hold team:view, so /api/employees would answer 403.
 */
const PAYROLL_EMPLOYEE_SOURCE = { url: '/api/finance/payroll/employees', labelKeys: ['name'] }

const PAYROLL_FORM = form('/api/finance/payroll', 'payroll', [
  { key: 'employeeId', label: 'employee', type: 'select', required: true, source: PAYROLL_EMPLOYEE_SOURCE },
  { key: 'type', label: 'payrollType', type: 'select', required: true, options: PAYROLL_TYPE_LABEL },
  { key: 'amount', label: 'amount', type: 'number', required: true, hint: 'payrollAmount' },
  { key: 'currency', label: 'currency', type: 'text', placeholder: 'studioCurrency', notNull: true },
  { key: 'date', label: 'date', type: 'date', required: true },
  {
    key: 'period',
    label: 'period',
    type: 'text',
    placeholder: 'yearMonth',
    hint: 'period',
    notNull: true
  },
  { key: 'lateMinutes', label: 'lateMinutes', type: 'number', hint: 'lateMinutes' },
  { key: 'reason', label: 'reason', type: 'textarea', wide: true }
], 2)

const PAYMENT_FORM = form('/api/finance/payments', 'payment', [
  { key: 'clientId', label: 'client', type: 'select', required: true, source: CLIENT_SOURCE },
  { key: 'projectId', label: 'project', type: 'select', source: PROJECT_SOURCE, placeholder: 'noProject' },
  {
    key: 'invoiceId',
    label: 'invoice',
    type: 'select',
    source: INVOICE_SOURCE,
    placeholder: 'noInvoice',
    hint: 'paymentInvoice'
  },
  { key: 'amount', label: 'amount', type: 'number', required: true },
  { key: 'currency', label: 'currency', type: 'text', example: 'USD', notNull: true },
  { key: 'status', label: 'status', type: 'select', options: PAYMENT_STATUS_LABEL, notNull: true },
  {
    key: 'method',
    label: 'method',
    type: 'select',
    placeholder: 'notSpecified',
    options: PAYMENT_METHOD_LABEL
  },
  { key: 'dueDate', label: 'deadline', type: 'date' },
  { key: 'paidDate', label: 'paidDate', type: 'date' },
  {
    key: 'reference',
    label: 'reference',
    type: 'text',
    placeholder: 'transactionRef',
    hint: 'reference'
  },
  { key: 'fee', label: 'fee', type: 'number', example: '0' },
  { key: 'notes', label: 'paymentNotes', type: 'textarea', wide: true }
], 2)

const INVOICE_FORM = form('/api/finance/invoices', 'invoice', [
  {
    key: 'number',
    label: 'number',
    type: 'text',
    placeholder: 'autoNumber',
    hint: 'invoiceNumber',
    notNull: true
  },
  { key: 'clientId', label: 'client', type: 'select', required: true, source: CLIENT_SOURCE },
  { key: 'projectId', label: 'project', type: 'select', source: PROJECT_SOURCE, placeholder: 'noProject' },
  { key: 'amount', label: 'amount', type: 'number', required: true },
  { key: 'currency', label: 'currency', type: 'text', example: 'USD', notNull: true },
  { key: 'status', label: 'status', type: 'select', options: PAYMENT_STATUS_LABEL, notNull: true },
  { key: 'issuedAt', label: 'issuedAt', type: 'date', notNull: true },
  { key: 'dueDate', label: 'payBy', type: 'date' },
  { key: 'vatAmount', label: 'vat', type: 'number', hint: 'invoiceVat' },
  { key: 'description', label: 'purpose', type: 'textarea', wide: true, placeholder: 'invoicePurpose' }
], 2)

/*
 * Actual cost is absent by design: the API derives it from expenses and priced
 * hours, so the form carries only the two numbers a human actually decides.
 */
const BUDGET_FORM = form('/api/finance/budgets', 'budget', [
  { ...OWNING_PROJECT, hint: 'budgetProject' },
  { key: 'revenue', label: 'revenue', type: 'number', required: true },
  { key: 'plannedCost', label: 'plannedCost', type: 'number', required: true },
  { key: 'currency', label: 'currency', type: 'text', example: 'USD', notNull: true }
], 2)

export {
  CLIENT_FORM,
  ASSET_FORM,
  DOCUMENT_FORM,
  EPISODE_FORM,
  SCENE_FORM,
  SHOT_FORM,
  REVISION_FORM,
  RENDER_FORM,
  REVIEW_FORM,
  DEPARTMENT_FORM,
  EMPLOYEE_FORM,
  EXPENSE_FORM,
  PAYROLL_FORM,
  PAYMENT_FORM,
  INVOICE_FORM,
  BUDGET_FORM
}

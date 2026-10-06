/**
 * Field descriptions for the shared create/edit panel.
 *
 * Thirteen tables need the same four operations. Describing each entity's form
 * as data rather than as another bespoke component keeps the forms consistent
 * and makes adding a field a one-line change.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  /** Photo, video, audio or document attached to the record. */
  | 'files'

export interface SelectSource {
  /** List endpoint the options come from. */
  url: string
  /** Row property used as the option value. */
  valueKey?: string
  /** Row properties joined with a space to build the option label. */
  labelKeys: string[]
  /** Extra query sent with the request. */
  query?: Record<string, string | number>
}

export interface FormField {
  /** Body key the API expects. */
  key: string
  /**
   * Where the edited row keeps the value, when not under `key`: an employee
   * row carries the person's name and role under `user`.
   */
  path?: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  hint?: string
  /** Static options for a select. */
  options?: Array<{ value: string, label: string }>
  /** Remote options for a select; takes precedence over `options`. */
  source?: SelectSource
  /** Field spans both columns of the form grid. */
  wide?: boolean
  /**
   * For a `files` field: the document column the upload is filed under.
   *
   * The record does not exist yet while the form is being filled in, so the
   * files are held back and uploaded against this key once it does.
   */
  attachTo?: string
  /** Field is only offered when creating, never when editing. */
  createOnly?: boolean
  /** Field only exists once the row does, e.g. a render job status. */
  editOnly?: boolean
  /**
   * The column behind the field can never be empty.
   *
   * Creating, a blank field is left out so the server default applies (a
   * status, a currency, the next free number). Editing, there is nothing to
   * clear it to, so the field becomes required instead.
   */
  notNull?: boolean
}

export interface EntityFormConfig {
  /** Collection endpoint: POST here to create, PATCH `${endpoint}/${id}` to edit. */
  endpoint: string
  createTitle: string
  editTitle: string
  fields: FormField[]
  /**
   * Column count of the field grid.
   *
   * Two columns suit long entity forms; a short form reads better in one,
   * because paired fields of unequal height leave ragged gaps.
   */
  columns?: 1 | 2
}

/**
 * Read a possibly nested property: `user.firstName` as well as `name`.
 *
 * List endpoints do not all put the useful fields at the top level — an
 * employee row carries its name under `user` — and an option labelled with a
 * raw id is no option at all.
 */
export function readPath(row: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, part) =>
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined,
    row
  )
}

/** Build the option label for a row, skipping blank parts. */
export function optionLabel(row: Record<string, unknown>, keys: string[]) {
  return keys
    .map(key => readPath(row, key))
    .filter(value => value !== null && value !== undefined && value !== '')
    .join(' ')
}

/** Nothing filled in: absent, null, or text that is only whitespace. */
export function isBlank(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
}

/** Whether the field must be filled in, given whether a row is being edited. */
export function isFieldRequired(field: FormField, isEdit: boolean): boolean {
  return Boolean(field.required || (isEdit && field.notNull))
}

export interface CleanPayloadOptions {
  /**
   * The row being edited, as the API returned it; absent when creating.
   *
   * It is what tells "the user emptied this field" apart from "this field was
   * never filled in".
   */
  original?: Record<string, unknown> | null
}

/**
 * The value an optional, blank field contributes, or `undefined` to leave it out.
 *
 * Creating, blank means "not filled in": sending '' would fail uuid or enum
 * validation, and leaving the key out lets the server default apply.
 *
 * Editing, a PATCH only touches the keys it carries, so leaving the key out
 * would silently keep the old value. A field that had a value and is now
 * blank is therefore sent as null, which clears the column; a field that was
 * blank all along stays out of the body, as does one whose column cannot be
 * empty (see `notNull`).
 */
function blankValue(field: FormField, original: Record<string, unknown> | null): null | undefined {
  if (!original || field.notNull) return undefined
  return isBlank(readPath(original, field.path ?? field.key)) ? undefined : null
}

/**
 * Build the JSON body for a create (POST) or edit (PATCH) from form values.
 *
 * Pure: neither `values` nor `original` is modified.
 */
export function cleanPayload(
  values: Record<string, unknown>,
  fields: FormField[],
  options: CleanPayloadOptions = {}
): Record<string, unknown> {
  const original = options.original ?? null
  const entries = fields.flatMap((field): Array<[string, unknown]> => {
    // Files travel as chunked uploads of their own, never in the JSON body.
    if (field.type === 'files') return []
    const value = values[field.key]

    if (isBlank(value)) {
      if (field.required) {
        return [[field.key, field.type === 'number' ? null : value]]
      }
      const cleared = blankValue(field, original)
      return cleared === undefined ? [] : [[field.key, cleared]]
    }

    return [[field.key, field.type === 'number' ? Number(value) : value]]
  })
  return Object.fromEntries(entries)
}

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
  key: string
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

/**
 * Strip values the API should not receive.
 *
 * Empty strings mean "not filled in", and sending them would fail uuid or
 * enum validation; a null is the honest way to clear an optional field.
 */
export function cleanPayload(
  values: Record<string, unknown>,
  fields: FormField[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    // Files travel as multipart uploads of their own, never in the JSON body.
    if (field.type === 'files') continue
    const value = values[field.key]
    if (value === '' || value === undefined) {
      if (!field.required) continue
    }
    if (field.type === 'number') {
      out[field.key] = value === '' || value === null ? null : Number(value)
      continue
    }
    out[field.key] = value
  }
  return out
}

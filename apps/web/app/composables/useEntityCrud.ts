import type { Ref } from 'vue'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'

/**
 * The only thing these actions need from a row.
 *
 * Deliberately not an index signature: each page declares its own row
 * interface, and an interface without one is not assignable to
 * Record<string, unknown>.
 */
export type EntityRow = { id: string }

export interface EntityCrudOptions {
  /** Collection endpoint, e.g. `/api/clients`. */
  endpoint: string
  /** Called after any action that changed data. */
  refresh: () => unknown | Promise<unknown>
  /** Accusative-case noun for dialogs: "клиента", "ассет". */
  entityLabel: string
  /** Human name of a row, shown in the delete confirmation. */
  nameOf?: (row: EntityRow) => string
  /**
   * The archive toggle, owned by the page.
   *
   * The list filters read it, and they are declared before this composable
   * because it needs the list`s refresh function. Passing the ref in breaks
   * that cycle.
   */
  archivedView?: Ref<boolean>
}

/**
 * Row-level actions shared by every table: create, edit, archive, delete.
 *
 * Archiving and deleting are separate on purpose. Archiving takes a row out of
 * the working set and is reversible from the archive view; deleting asks for
 * confirmation first and is the end of the row's life in the UI.
 */
export function useEntityCrud(options: EntityCrudOptions) {
  /** Whether the table is showing the archive instead of the working set. */
  const archivedView = options.archivedView ?? ref(false)

  const formOpen = ref(false)
  const editing = ref<Record<string, unknown> | null>(null)

  const busyId = ref('')
  const errorMessage = ref('')

  const deleteTarget = ref<Record<string, unknown> | null>(null)
  const deleting = ref(false)

  function nameOf(row: Record<string, unknown>) {
    return options.nameOf?.(row as EntityRow) ??
      String(row.name ?? row.title ?? row.code ?? row.id)
  }

  function openCreate() {
    editing.value = null
    formOpen.value = true
  }

  function openEdit(row: EntityRow) {
    editing.value = row
    formOpen.value = true
  }

  function closeForm() {
    formOpen.value = false
    editing.value = null
  }

  async function saved() {
    await options.refresh()
  }

  async function setArchived(row: EntityRow, archived: boolean) {
    busyId.value = row.id
    errorMessage.value = ''
    try {
      const action = archived ? '/archive' : '/unarchive'
      await apiRequest(options.endpoint + '/' + row.id + action, { method: 'POST' })
      await options.refresh()
    } catch (err) {
      errorMessage.value = apiErrorMessage(
        err,
        archived ? 'Не удалось архивировать' : 'Не удалось вернуть из архива'
      )
    } finally {
      busyId.value = ''
    }
  }

  const archive = (row: EntityRow) => setArchived(row, true)
  const unarchive = (row: EntityRow) => setArchived(row, false)

  function askDelete(row: EntityRow) {
    deleteTarget.value = row as Record<string, unknown>
  }

  function cancelDelete() {
    deleteTarget.value = null
  }

  async function confirmDelete() {
    const row = deleteTarget.value as EntityRow | null
    if (!row) return
    deleting.value = true
    errorMessage.value = ''
    try {
      await apiRequest(options.endpoint + '/' + row.id, { method: 'DELETE' })
      deleteTarget.value = null
      await options.refresh()
    } catch (err) {
      errorMessage.value = apiErrorMessage(err, 'Не удалось удалить')
      deleteTarget.value = null
    } finally {
      deleting.value = false
    }
  }

  /** Text for the confirmation dialog, so every table words it the same way. */
  const deleteMessage = computed(() => {
    const row = deleteTarget.value
    if (!row) return ''
    return 'Удалить ' + options.entityLabel + ' «' + nameOf(row) + '»?'
  })

  /*
   * Reactive rather than a bag of refs: the whole object is handed to
   * <EntityCrudHost> as one prop, and refs nested in a prop object are not
   * unwrapped in templates.
   */
  return reactive({
    archivedView,
    formOpen,
    editing,
    openCreate,
    openEdit,
    closeForm,
    saved,
    busyId,
    errorMessage,
    archive,
    unarchive,
    deleteTarget,
    deleting,
    deleteMessage,
    askDelete,
    cancelDelete,
    confirmDelete
  })
}

export type EntityCrud = ReturnType<typeof useEntityCrud>

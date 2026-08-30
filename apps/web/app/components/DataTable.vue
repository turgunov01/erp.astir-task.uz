<script setup lang="ts" generic="T">
import type { PaginationMeta } from '@astir/types'

export interface Column {
  key: string
  label: string
  /** Right-align numeric columns so digits line up. */
  numeric?: boolean
  width?: string
}

const props = defineProps<{
  columns: Column[]
  rows: T[]
  meta: PaginationMeta
  pending?: boolean
  errorMessage?: string
  emptyTitle: string
  emptyBody: string
  emptyIcon?: string
  searchPlaceholder?: string
  /** Rows become clickable and emit row-click, for tables backed by a detail panel. */
  rowClickable?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:page', page: number): void
  (event: 'update:search', search: string): void
  (event: 'retry'): void
  (event: 'row-click', row: T): void
}>()

const searchValue = defineModel<string>('search', { default: '' })

// Debounced so typing does not fire a request per keystroke (spec 70).
const debouncedEmit = useDebounceFn((value: string) => emit('update:search', value), 300)
watch(searchValue, value => debouncedEmit(value))

/**
 * Open the row unless the click landed on its own control.
 *
 * Rows carry links, selects and buttons; those own their click and must not
 * also open the detail panel behind them.
 */
function onRowClick(row: T, event: MouseEvent) {
  if (!props.rowClickable) return
  const target = event.target as HTMLElement | null
  if (target?.closest('a, button, select, input, textarea, label, [data-row-ignore]')) return
  if (window.getSelection()?.toString()) return
  emit('row-click', row)
}

function onRowKeydown(row: T, event: KeyboardEvent) {
  if (!props.rowClickable) return
  if (event.key !== 'Enter') return
  if ((event.target as HTMLElement).closest('a, button, select, input, textarea')) return
  event.preventDefault()
  emit('row-click', row)
}

/** Index an unconstrained row by column key without widening the slot type. */
function cellValue(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

function rowKey(row: T, index: number): string {
  const id = (row as Record<string, unknown>).id
  return id == null ? String(index) : String(id)
}

const from = computed(() =>
  props.meta.total === 0 ? 0 : (props.meta.page - 1) * props.meta.limit + 1
)
const to = computed(() =>
  Math.min(props.meta.page * props.meta.limit, props.meta.total)
)

/** Slot in the pager: a page to jump to, or a gap standing for skipped ones. */
type PagerSlot = { kind: 'page', page: number } | { kind: 'gap', key: string }

/**
 * Page numbers around the current one, with the first and last always shown.
 *
 * A table of 40 pages cannot list them all, and prev/next alone makes jumping
 * to a known page impossible, so the middle collapses into gaps.
 */
const pagerSlots = computed<PagerSlot[]>(() => {
  const total = Math.max(props.meta.pages, 1)
  const current = Math.min(Math.max(props.meta.page, 1), total)

  const numbers = new Set<number>([1, total, current])
  for (const offset of [-1, 1]) {
    const page = current + offset
    if (page >= 1 && page <= total) numbers.add(page)
  }
  // Keep the row a stable width near the ends instead of shrinking to three.
  if (current <= 3) for (const page of [2, 3, 4]) if (page <= total) numbers.add(page)
  if (current >= total - 2) {
    for (const page of [total - 1, total - 2, total - 3]) if (page >= 1) numbers.add(page)
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  const slots: PagerSlot[] = []
  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) slots.push({ kind: 'gap', key: 'gap-' + previous })
    slots.push({ kind: 'page', page })
    previous = page
  }
  return slots
})

function goTo(page: number) {
  const total = Math.max(props.meta.pages, 1)
  const target = Math.min(Math.max(page, 1), total)
  if (target !== props.meta.page) emit('update:page', target)
}
</script>

<template>
  <div class="rounded-xl border bg-card">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <div class="relative min-w-0 flex-1 sm:max-w-xs">
        <Icon
          name="lucide:search"
          class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="searchValue"
          type="search"
          :placeholder="searchPlaceholder || 'Поиск...'"
          class="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
        >
      </div>
      <slot name="toolbar" />
    </div>

    <!-- Error -->
    <div v-if="errorMessage" class="grid place-items-center px-6 py-16 text-center">
      <span class="grid size-11 place-items-center rounded-lg bg-destructive/10 text-destructive">
        <Icon name="lucide:triangle-alert" class="size-5" />
      </span>
      <h3 class="mt-4 text-sm font-medium">Не удалось загрузить данные</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">{{ errorMessage }}</p>
      <button
        type="button"
        class="mt-5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="emit('retry')"
      >
        Повторить
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="pending && rows.length === 0" class="divide-y">
      <div v-for="n in 5" :key="n" class="flex items-center gap-4 px-4 py-3.5">
        <div
          v-for="col in columns"
          :key="col.key"
          class="h-4 rounded bg-muted"
          :style="{ width: col.width || '18%' }"
        />
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="rows.length === 0" class="grid place-items-center px-6 py-16 text-center">
      <span class="grid size-11 place-items-center rounded-lg bg-secondary text-muted-foreground">
        <Icon :name="emptyIcon || 'lucide:inbox'" class="size-5" />
      </span>
      <h3 class="mt-4 text-sm font-medium">{{ emptyTitle }}</h3>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">{{ emptyBody }}</p>
      <slot name="empty-action" />
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left">
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              :class="col.numeric ? 'text-right' : ''"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr
            v-for="(row, index) in rows"
            :key="rowKey(row, index)"
            class="hover:bg-secondary/40"
            :class="rowClickable ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring' : ''"
            :tabindex="rowClickable ? 0 : undefined"
            @click="onRowClick(row, $event)"
            @keydown="onRowKeydown(row, $event)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-4 py-3"
              :class="col.numeric ? 'text-right tabular-nums' : ''"
            >
              <slot :name="'cell-' + col.key" :row="row">
                {{ cellValue(row, col.key) ?? '—' }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="rows.length > 0 && !errorMessage"
      class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
    >
      <p class="text-muted-foreground">
        {{ from }}–{{ to }} из {{ meta.total }}
      </p>
      <nav class="flex items-center gap-1" aria-label="Страницы таблицы">
        <button
          type="button"
          class="rounded-md border px-2.5 py-1.5 disabled:opacity-40 enabled:hover:bg-secondary"
          :disabled="meta.page <= 1"
          aria-label="Предыдущая страница"
          @click="goTo(meta.page - 1)"
        >
          <Icon name="lucide:chevron-left" class="size-4" />
        </button>

        <template v-for="slot in pagerSlots">
          <span
            v-if="slot.kind === 'gap'"
            :key="slot.key"
            class="px-1 text-muted-foreground"
            aria-hidden="true"
          >…</span>
          <button
            v-else
            :key="slot.page"
            type="button"
            class="min-w-9 rounded-md border px-2 py-1.5 tabular-nums"
            :class="slot.page === meta.page
              ? 'border-primary bg-primary text-primary-foreground font-medium'
              : 'hover:bg-secondary'"
            :aria-current="slot.page === meta.page ? 'page' : undefined"
            :aria-label="'Страница ' + slot.page"
            @click="goTo(slot.page)"
          >
            {{ slot.page }}
          </button>
        </template>

        <button
          type="button"
          class="rounded-md border px-2.5 py-1.5 disabled:opacity-40 enabled:hover:bg-secondary"
          :disabled="meta.page >= meta.pages"
          aria-label="Следующая страница"
          @click="goTo(meta.page + 1)"
        >
          <Icon name="lucide:chevron-right" class="size-4" />
        </button>
      </nav>
    </div>
  </div>
</template>

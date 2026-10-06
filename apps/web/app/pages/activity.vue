<script setup lang="ts">
import { useListResource } from '~/composables/useApi'
import { useFilterOptions } from '~/composables/useFilterOptions'

const { t } = useI18n()

useHead({ title: computed(() => t('team.activity.title')) })

const route = useRoute()
const router = useRouter()

const page = ref(Number(route.query.page ?? 1))
const projectId = ref(String(route.query.projectId ?? ''))
const actorId = ref(String(route.query.actorId ?? ''))
const entityType = ref(String(route.query.entityType ?? ''))
const action = ref(String(route.query.action ?? ''))
const from = ref(String(route.query.from ?? ''))
const to = ref(String(route.query.to ?? ''))

/*
 * Filters live in the URL. A feed is something people point each other at —
 * "смотри, что творилось с этим проектом во вторник" has to survive being
 * pasted into a chat (spec 89).
 */
watch([projectId, actorId, entityType, action, from, to], () => {
  page.value = 1
  router.replace({
    query: {
      projectId: projectId.value || undefined,
      actorId: actorId.value || undefined,
      entityType: entityType.value || undefined,
      action: action.value || undefined,
      from: from.value || undefined,
      to: to.value || undefined
    }
  })
})

const projectOptions = useFilterOptions<{ id: string, code: string, name: string }>(
  '/api/projects',
  row => row.code + ' · ' + row.name
)
const actorOptions = useFilterOptions<{
  id: string
  userId: string
  user: { firstName: string, lastName: string }
}>('/api/employees', row => row.user.firstName + ' ' + row.user.lastName)

const filters = computed(() => ({
  page: page.value,
  limit: 30,
  projectId: projectId.value || undefined,
  actorId: actorId.value || undefined,
  entityType: entityType.value || undefined,
  action: action.value || undefined,
  from: from.value || undefined,
  to: to.value || undefined
}))

interface ActivityRow {
  id: string
  action: string
  entityType: string
  entityId: string
  projectId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  actor: { id: string, firstName: string, lastName: string } | null
  project: { id: string, code: string, name: string } | null
}

const { items, meta, pending, errorMessage, refresh } =
  useListResource<ActivityRow>('/api/activity', filters as never)

/**
 * Which kinds of event exist, taken from the log itself.
 *
 * A hard-coded list would offer filters that return nothing, and would miss a
 * new kind of event until somebody remembered to add it here.
 */
interface Facets {
  actions: Array<{ value: string, count: number }>
  entityTypes: Array<{ value: string, count: number }>
}

const { data: facetData } = await useFetch<{ data: Facets }>('/api/activity/facets', {
  credentials: 'include',
  default: () => ({ data: { actions: [], entityTypes: [] } })
})

/*
 * Actions are offered as families — "task." rather than six separate task
 * entries — because that is how the question gets asked. The prefix is exactly
 * what the API matches on.
 */
const actionFamilies = computed(() => {
  const families = new Map<string, number>()
  for (const row of facetData.value?.data.actions ?? []) {
    const [family] = row.value.split('.')
    if (!family) continue
    families.set(family, (families.get(family) ?? 0) + row.count)
  }
  return [...families.entries()]
    .map(([family, count]) => ({ value: family + '.', label: labelOf(ACTIVITY_FAMILY_LABEL, family, t('team.activity.otherFamily')), count }))
    .sort((a, b) => a.label.localeCompare(b.label, intlTag()))
})

const entityTypes = computed(() => facetData.value?.data.entityTypes ?? [])

const isFiltered = computed(() => Boolean(
  projectId.value || actorId.value || entityType.value || action.value || from.value || to.value
))

function resetFilters() {
  projectId.value = ''
  actorId.value = ''
  entityType.value = ''
  action.value = ''
  from.value = ''
  to.value = ''
}

/**
 * Where an entry points, when it points anywhere.
 *
 * Only the two entity types that actually have a detail route are linked, and
 * everything else falls back to its project. A link to a page this application
 * does not have is worse than no link at all.
 */
function entityLink(row: ActivityRow) {
  if (row.entityType === 'Project') return '/projects/' + row.entityId
  if (row.entityType === 'Shot') return '/shots/' + row.entityId
  if (row.project) return '/projects/' + row.project.id
  return null
}

/** The one or two metadata fields worth putting on a feed line. */
function detail(row: ActivityRow) {
  const meta = row.metadata
  if (!meta) return ''
  const parts: string[] = []
  const title = meta.title ?? meta.name ?? meta.code ?? meta.number
  if (typeof title === 'string') parts.push(t('team.activity.quoted', { title }))
  if (typeof meta.from === 'string' && typeof meta.to === 'string') {
    parts.push(enumLabel(STATUS_LABEL, meta.from) + ' → ' + enumLabel(STATUS_LABEL, meta.to))
  } else if (typeof meta.status === 'string') {
    parts.push(enumLabel(STATUS_LABEL, meta.status))
  }
  return parts.join(' · ')
}

/** Day headings, so a long feed reads as days rather than as one wall. */
const grouped = computed(() => {
  const days = new Map<string, ActivityRow[]>()
  for (const row of items.value) {
    const key = row.createdAt.slice(0, 10)
    const bucket = days.get(key)
    if (bucket) bucket.push(row)
    else days.set(key, [row])
  }
  return [...days.entries()].map(([day, rows]) => ({ day, rows }))
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{{ t('team.activity.eyebrow') }}</p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ t('team.activity.title') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
        {{ t('team.activity.intro') }}
      </p>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('team.activity.filters.project')"
        >
          <option value="">{{ t('team.allProjects') }}</option>
          <option v-for="option in projectOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-model="actorId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('team.activity.filters.actor')"
        >
          <option value="">{{ t('team.activity.filters.allActors') }}</option>
          <option v-for="option in actorOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-model="action"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('team.activity.filters.action')"
        >
          <option value="">{{ t('team.activity.filters.anyAction') }}</option>
          <option v-for="family in actionFamilies" :key="family.value" :value="family.value">
            {{ family.label }} ({{ family.count }})
          </option>
        </select>

        <select
          v-model="entityType"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          :aria-label="t('team.activity.filters.entity')"
        >
          <option value="">{{ t('team.activity.filters.anyEntity') }}</option>
          <option v-for="row in entityTypes" :key="row.value" :value="row.value">
            {{ labelOf(ENTITY_TYPE_LABEL, row.value, t('team.activity.record')) }} ({{ row.count }})
          </option>
        </select>

        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          {{ t('team.activity.filters.from') }}
          <input
            v-model="from"
            type="date"
            class="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
          >
        </label>
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          {{ t('team.activity.filters.to') }}
          <input
            v-model="to"
            type="date"
            class="h-9 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus:border-ring"
          >
        </label>

        <button
          v-if="isFiltered"
          type="button"
          class="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground"
          @click="resetFilters()"
        >
          {{ t('common.actions.reset') }}
        </button>
      </div>
    </header>

    <div
      v-if="errorMessage"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">{{ errorMessage }}</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <div v-else-if="pending && items.length === 0" class="space-y-3">
      <div v-for="n in 6" :key="n" class="h-12 rounded-lg bg-muted" />
    </div>

    <div
      v-else-if="items.length === 0"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:activity" class="size-7 text-muted-foreground" />
      <p class="mt-3 text-sm font-medium">
        {{ isFiltered ? t('team.activity.emptyFiltered') : t('team.activity.emptyTitle') }}
      </p>
      <p class="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {{
          isFiltered
            ? t('team.activity.emptyFilteredBody')
            : t('team.activity.emptyBody')
        }}
      </p>
      <button
        v-if="isFiltered"
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="resetFilters()"
      >
        {{ t('team.activity.resetFilters') }}
      </button>
    </div>

    <template v-else>
      <p class="mb-3 text-sm text-muted-foreground">{{ t('team.activity.total', { n: meta.total }) }}</p>

      <section v-for="group in grouped" :key="group.day" class="mb-6">
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {{ formatDay(group.day) }}
        </h2>

        <ul class="divide-y overflow-hidden rounded-xl border bg-card">
          <li
            v-for="row in group.rows"
            :key="row.id"
            class="flex items-start gap-3 px-5 py-3 text-sm"
          >
            <span
              class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground"
            >
              <Icon name="lucide:dot" class="size-4" />
            </span>

            <div class="min-w-0 flex-1">
              <i18n-t :keypath="detail(row) ? 'team.activity.lineWithDetail' : 'team.activity.line'" tag="p" scope="global">
                <template #actor>
                  <span class="font-medium">{{ row.actor ? row.actor.firstName + ' ' + row.actor.lastName : t('team.activity.system') }}</span>
                </template>
                <template #action>
                  <span>{{ labelOf(ACTIVITY_ACTION_LABEL, row.action, t('team.activity.unknownAction')) }}</span>
                </template>
                <template #detail>
                  <span class="text-muted-foreground">{{ detail(row) }}</span>
                </template>
              </i18n-t>

              <p class="mt-0.5 text-xs text-muted-foreground">
                <span>{{ labelOf(ENTITY_TYPE_LABEL, row.entityType, t('team.activity.record')) }}</span>
                <template v-if="row.project">
                  ·
                  <NuxtLink :to="'/projects/' + row.project.id" class="hover:underline">
                    {{ row.project.code }}
                  </NuxtLink>
                </template>
                <template v-if="entityLink(row)">
                  ·
                  <NuxtLink :to="entityLink(row)!" class="hover:underline">{{ t('common.actions.open') }}</NuxtLink>
                </template>
              </p>
            </div>

            <time
              class="shrink-0 text-xs text-muted-foreground"
              :datetime="row.createdAt"
              :title="formatDateTime(row.createdAt)"
            >
              {{ timeAgo(row.createdAt) }}
            </time>
          </li>
        </ul>
      </section>

      <div v-if="meta.pages > 1" class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          :disabled="meta.page <= 1"
          @click="page = meta.page - 1"
        >
          {{ t('common.actions.back') }}
        </button>
        <p class="text-sm text-muted-foreground">
          {{ t('team.pageOf', { page: meta.page, pages: meta.pages }) }}
        </p>
        <button
          type="button"
          class="h-9 rounded-md border px-3 text-sm disabled:opacity-40"
          :disabled="meta.page >= meta.pages"
          @click="page = meta.page + 1"
        >
          {{ t('team.nextPage') }}
        </button>
      </div>
    </template>
  </div>
</template>

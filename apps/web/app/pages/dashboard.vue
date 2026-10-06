<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()

useHead({ title: computed(() => t('projects.dashboard.title')) })

const auth = useAuthStore()

interface ProjectRow {
  id: string
  code: string
  name: string
  progress: number
  risk: string
  status: string
  deadline: string | null
  client: { name: string } | null
}

interface Stats {
  kpi: {
    activeProjects: number
    atRisk: number
    overdueTasks: number
    pendingReviews: number
    activeShots: number
    openRevisions: number
  }
  pipeline: Array<{ name: string, count: number }>
  projects: ProjectRow[]
  deadlines: ProjectRow[]
  activity: Array<{
    id: string
    action: string
    entityType: string
    createdAt: string
    actor: { firstName: string, lastName: string } | null
  }>
}

const { data, pending, error, refresh } = await useFetch<{ data: Stats }>(
  '/api/dashboard/stats',
  { credentials: 'include' }
)

const stats = computed(() => data.value?.data)

/** KPI tiles (spec 7). `signal` marks the ones that mean "look here". */
const kpis = computed(() => {
  const kpi = stats.value?.kpi
  return [
    { key: 'activeProjects', value: kpi?.activeProjects ?? 0, icon: 'lucide:folder-kanban', to: '/projects', signal: false },
    { key: 'atRisk', value: kpi?.atRisk ?? 0, icon: 'lucide:triangle-alert', to: '/projects', signal: true },
    { key: 'overdueTasks', value: kpi?.overdueTasks ?? 0, icon: 'lucide:clock-alert', to: '/tasks?view=overdue', signal: true },
    { key: 'pendingReviews', value: kpi?.pendingReviews ?? 0, icon: 'lucide:eye', to: '/reviews', signal: false },
    { key: 'activeShots', value: kpi?.activeShots ?? 0, icon: 'lucide:camera', to: '/shots', signal: false },
    { key: 'openRevisions', value: kpi?.openRevisions ?? 0, icon: 'lucide:rotate-ccw', to: '/revisions', signal: false }
  ].map(item => ({
    ...item,
    label: t('projects.dashboard.kpi.' + item.key + '.label'),
    hint: t('projects.dashboard.kpi.' + item.key + '.hint')
  }))
})

const maxPipeline = computed(() =>
  Math.max(1, ...(stats.value?.pipeline ?? []).map(item => item.count))
)

function formatDate(value: string | null) {
  return value ? shortDay(value) : '—'
}

</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-8">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {{ t('projects.dashboard.title') }}
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">
        {{ t('projects.dashboard.greeting', { name: auth.user?.firstName ?? '' }) }}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ t('projects.dashboard.lead') }}
      </p>
    </header>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">{{ t('projects.dashboard.loadFailed') }}</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <template v-else>
      <section
        :aria-label="t('projects.dashboard.kpiLabel')"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-3"
      >
        <NuxtLink
          v-for="kpi in kpis"
          :key="kpi.key"
          :to="kpi.to"
          class="bg-card px-4 py-3 hover:bg-secondary/40 sm:px-5 sm:py-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm leading-snug text-muted-foreground sm:truncate">{{ kpi.label }}</p>
              <p class="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                <span v-if="pending" class="inline-block h-8 w-10 rounded bg-muted" />
                <template v-else>{{ kpi.value }}</template>
              </p>
              <p class="mt-1 text-xs text-muted-foreground">{{ kpi.hint }}</p>
            </div>
            <span
              class="grid size-8 shrink-0 place-items-center rounded-md"
              :class="kpi.signal && kpi.value > 0 ? 'bg-signal/15 text-signal-foreground' : 'bg-secondary text-muted-foreground'"
            >
              <Icon :name="kpi.icon" class="size-4" />
            </span>
          </div>
        </NuxtLink>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="rounded-xl border bg-card lg:col-span-2">
          <header class="flex items-center justify-between border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">{{ t('projects.dashboard.progress') }}</h2>
            <NuxtLink to="/projects" class="text-xs text-muted-foreground hover:text-foreground">
              {{ t('projects.documents.allProjects') }}
            </NuxtLink>
          </header>

          <div v-if="pending" class="divide-y">
            <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-5 py-3.5">
              <div class="h-4 flex-1 rounded bg-muted" />
              <div class="h-4 w-24 rounded bg-muted" />
            </div>
          </div>

          <div
            v-else-if="(stats?.projects.length ?? 0) === 0"
            class="grid place-items-center px-5 py-16 text-center"
          >
            <Icon name="lucide:folder-open" class="size-8 text-muted-foreground/50" />
            <p class="mt-3 text-sm font-medium">{{ t('projects.dashboard.noActive') }}</p>
          </div>

          <ul v-else class="divide-y">
            <li
              v-for="project in stats?.projects"
              :key="project.id"
              class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
            >
              <div class="min-w-0 flex-1">
                <NuxtLink :to="'/projects/' + project.id" class="text-sm font-medium hover:underline">
                  {{ project.code }} — {{ project.name }}
                </NuxtLink>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  {{ project.client?.name ?? t('projects.detail.noClient') }} · {{ t('projects.dashboard.deadline', { date: formatDate(project.deadline) }) }}
                </p>
              </div>
              <ProgressBar :value="project.progress" :risk="project.risk" />
              <StatusBadge :status="project.risk" kind="risk" />
            </li>
          </ul>
        </section>

        <section class="rounded-xl border bg-card">
          <header class="border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">{{ t('projects.dashboard.pipeline') }}</h2>
          </header>
          <ul class="divide-y">
            <li
              v-for="phase in stats?.pipeline ?? []"
              :key="phase.name"
              class="flex items-center gap-3 px-5 py-3 text-sm"
            >
              <span class="w-28 shrink-0 text-muted-foreground">{{ phase.name }}</span>
              <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  class="block h-full rounded-full bg-primary"
                  :style="{ width: (phase.count / maxPipeline) * 100 + '%' }"
                />
              </span>
              <span class="w-6 text-right font-medium tabular-nums">{{ phase.count }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border bg-card">
          <header class="border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">{{ t('projects.dashboard.upcoming') }}</h2>
          </header>
          <p
            v-if="(stats?.deadlines.length ?? 0) === 0"
            class="px-5 py-10 text-center text-sm text-muted-foreground"
          >
            {{ t('projects.dashboard.noUpcoming') }}
          </p>
          <ul v-else class="divide-y">
            <li
              v-for="project in stats?.deadlines"
              :key="project.id"
              class="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <NuxtLink :to="'/projects/' + project.id" class="min-w-0 truncate hover:underline">
                {{ project.code }} — {{ project.name }}
              </NuxtLink>
              <span class="shrink-0 tabular-nums text-muted-foreground">
                {{ formatDate(project.deadline) }}
              </span>
            </li>
          </ul>
        </section>

        <section class="rounded-xl border bg-card">
          <header class="flex items-center justify-between border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">{{ t('projects.dashboard.activity') }}</h2>
            <NuxtLink to="/activity" class="text-xs text-muted-foreground hover:text-foreground">
              {{ t('projects.dashboard.allActivity') }}
            </NuxtLink>
          </header>
          <p
            v-if="(stats?.activity.length ?? 0) === 0"
            class="px-5 py-10 text-center text-sm text-muted-foreground"
          >
            {{ t('projects.dashboard.noActivity') }}
          </p>
          <ul v-else class="divide-y">
            <li
              v-for="event in stats?.activity"
              :key="event.id"
              class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
            >
              <span class="min-w-0 truncate">
                <span class="text-muted-foreground">
                  {{ event.actor ? event.actor.firstName + ' ' + event.actor.lastName : t('projects.dashboard.system') }}
                </span>
                — {{ labelOf(ACTIVITY_ACTION_LABEL, event.action, t('projects.dashboard.didSomething')) }}
              </span>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{ timeAgo(event.createdAt) }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>

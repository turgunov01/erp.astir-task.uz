<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Dashboard — Aster ERP' })

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
    { label: 'Активные проекты', value: kpi?.activeProjects ?? 0, icon: 'lucide:folder-kanban', hint: 'в производстве', to: '/projects', signal: false },
    { label: 'Проекты в риске', value: kpi?.atRisk ?? 0, icon: 'lucide:triangle-alert', hint: 'отставание от графика', to: '/projects', signal: true },
    { label: 'Просроченные задачи', value: kpi?.overdueTasks ?? 0, icon: 'lucide:clock-alert', hint: 'дедлайн прошёл', to: '/tasks?view=overdue', signal: true },
    { label: 'Ждут согласования', value: kpi?.pendingReviews ?? 0, icon: 'lucide:eye', hint: 'версии на review', to: '/reviews', signal: false },
    { label: 'Шоты в работе', value: kpi?.activeShots ?? 0, icon: 'lucide:camera', hint: 'активное производство', to: '/shots', signal: false },
    { label: 'Открытые правки', value: kpi?.openRevisions ?? 0, icon: 'lucide:rotate-ccw', hint: 'запросы на доработку', to: '/revisions', signal: false }
  ]
})

const maxPipeline = computed(() =>
  Math.max(1, ...(stats.value?.pipeline ?? []).map(item => item.count))
)

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 60) return Math.max(minutes, 1) + ' мин назад'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + ' ч назад'
  return Math.round(hours / 24) + ' дн назад'
}

function actionLabel(action: string) {
  return action.split('.').join(' ').split('_').join(' ')
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-8">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Dashboard
      </p>
      <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">
        Добрый день, {{ auth.user?.firstName }}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Обзор производства студии на сегодня.
      </p>
    </header>

    <div v-if="error" class="rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">Не удалось загрузить сводку</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <template v-else>
      <section
        aria-label="Ключевые показатели"
        class="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3"
      >
        <NuxtLink
          v-for="kpi in kpis"
          :key="kpi.label"
          :to="kpi.to"
          class="bg-card px-5 py-4 hover:bg-secondary/40"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-sm text-muted-foreground">{{ kpi.label }}</p>
              <p class="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">
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
            <h2 class="text-sm font-medium">Прогресс проектов</h2>
            <NuxtLink to="/projects" class="text-xs text-muted-foreground hover:text-foreground">
              Все проекты
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
            <p class="mt-3 text-sm font-medium">Пока нет активных проектов</p>
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
                  {{ project.client?.name ?? 'Без клиента' }} · дедлайн {{ formatDate(project.deadline) }}
                </p>
              </div>
              <ProgressBar :value="project.progress" :risk="project.risk" />
              <StatusBadge :status="project.risk" kind="risk" />
            </li>
          </ul>
        </section>

        <section class="rounded-xl border bg-card">
          <header class="border-b px-5 py-3.5">
            <h2 class="text-sm font-medium">Производственный конвейер</h2>
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
            <h2 class="text-sm font-medium">Ближайшие дедлайны</h2>
          </header>
          <p
            v-if="(stats?.deadlines.length ?? 0) === 0"
            class="px-5 py-10 text-center text-sm text-muted-foreground"
          >
            В ближайшие две недели дедлайнов нет
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
            <h2 class="text-sm font-medium">Последние события</h2>
            <NuxtLink to="/activity" class="text-xs text-muted-foreground hover:text-foreground">
              Вся лента
            </NuxtLink>
          </header>
          <p
            v-if="(stats?.activity.length ?? 0) === 0"
            class="px-5 py-10 text-center text-sm text-muted-foreground"
          >
            Событий пока нет
          </p>
          <ul v-else class="divide-y">
            <li
              v-for="event in stats?.activity"
              :key="event.id"
              class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
            >
              <span class="min-w-0 truncate">
                <span class="text-muted-foreground">
                  {{ event.actor ? event.actor.firstName + ' ' + event.actor.lastName : 'Система' }}
                </span>
                — {{ actionLabel(event.action) }}
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

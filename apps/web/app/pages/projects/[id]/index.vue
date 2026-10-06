<script setup lang="ts">
import { PERMISSION } from '@astir/types'
import { useAuthStore } from '~/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const projectId = computed(() => String(route.params.id))

interface ProjectDetail {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  priority: string
  projectType: string
  progress: number
  risk: string
  startDate: string | null
  deadline: string | null
  budget: string | null
  currency: string
  client: { id: string, name: string } | null
  projectManager: { firstName: string, lastName: string } | null
  producer: { firstName: string, lastName: string } | null
  budgetRecord: { revenue: string, plannedCost: string, actualCost: string } | null
  _count: { episodes: number, shots: number, tasks: number }
}

const { data, pending, error, refresh } = await useFetch<{ data: ProjectDetail }>(
  () => '/api/projects/' + projectId.value,
  { credentials: 'include' }
)

const project = computed(() => data.value?.data)

if (!pending.value && !project.value) {
  throw createError({ statusCode: 404, statusMessage: t('projects.form.notFound') })
}

useHead({ title: computed(() => project.value?.code ?? t('projects.detail.fallbackTitle')) })

/**
 * Tabs live in a query param rather than nested routes: the panels are part of
 * one project view, and this keeps every tab shareable without adding routes
 * that could 404.
 */
const TABS = [
  { key: 'overview', icon: 'lucide:layout-dashboard' },
  { key: 'pipeline', icon: 'lucide:git-branch' },
  { key: 'episodes', icon: 'lucide:tv' },
  { key: 'scenes', icon: 'lucide:film' },
  { key: 'shots', icon: 'lucide:camera' },
  { key: 'tasks', icon: 'lucide:list-checks' },
  { key: 'team', icon: 'lucide:users' },
  { key: 'files', icon: 'lucide:folder' }
] as const

const activeTab = computed(() => {
  const requested = String(route.query.tab ?? 'overview')
  return TABS.some(tab => tab.key === requested) ? requested : 'overview'
})
const tabStrip = useTabStrip(activeTab)

function selectTab(key: string) {
  router.replace({ query: key === 'overview' ? {} : { tab: key } })
}

function formatDate(value: string | null) {
  return formatDay(value)
}

/** Whole units: a headline budget to the cent is false precision. */
function money(value: string | null, currency: string) {
  return value === null ? '—' : formatMoney(Number(value), currency, 0)
}

/**
 * Actual cost stays null until expenses and timesheets are recorded, so a
 * plain zero would misreport an unmeasured project as a costless one.
 */
const hasActualCost = computed(() => {
  const record = project.value?.budgetRecord
  return Boolean(record) && Number(record!.actualCost) > 0
})

/** Panels change stage and task state, which rolls up into these headline numbers. */
function onPanelChanged() {
  refresh()
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <NuxtLink
      to="/projects"
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <Icon name="lucide:arrow-left" class="size-3.5" />
      {{ t('projects.form.backToList') }}
    </NuxtLink>

    <div v-if="error" class="mt-8 rounded-xl border bg-card px-6 py-16 text-center">
      <Icon name="lucide:triangle-alert" class="size-8 text-destructive" />
      <p class="mt-3 text-sm font-medium">{{ t('projects.detail.loadFailed') }}</p>
      <button
        type="button"
        class="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        {{ t('common.actions.retry') }}
      </button>
    </div>

    <template v-else-if="project">
      <header class="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {{ project.code }} · {{ enumLabel(PROJECT_TYPE_LABEL, project.projectType) }}
          </p>
          <h1 class="mt-1.5 text-2xl font-semibold tracking-tight">{{ project.name }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ project.client?.name ?? t('projects.detail.noClient') }}
            <template v-if="project.projectManager">
              · {{ t('projects.detail.pm', { name: project.projectManager.firstName + ' ' + project.projectManager.lastName }) }}
            </template>
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <StatusBadge :status="project.status" />
          <StatusBadge :status="project.risk" kind="risk" />
          <NuxtLink
            v-if="auth.can(PERMISSION.PROJECT_UPDATE)"
            :to="'/projects/' + project.id + '/edit'"
            class="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-secondary"
          >
            <Icon name="lucide:pencil" class="size-3.5" />
            {{ t('projects.detail.edit') }}
          </NuxtLink>
        </div>
      </header>

      <section class="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('projects.detail.progress') }}</p>
          <p class="mt-1.5 text-2xl font-semibold tabular-nums">{{ project.progress }}%</p>
          <ProgressBar class="mt-2" :value="project.progress" :risk="project.risk" />
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('projects.form.deadline') }}</p>
          <p class="mt-1.5 text-lg font-medium">{{ formatDate(project.deadline) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('projects.detail.start', { date: formatDate(project.startDate) }) }}</p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('projects.form.budget') }}</p>
          <p class="mt-1.5 text-lg font-medium">{{ money(project.budget, project.currency) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            <template v-if="hasActualCost">
              {{ t('projects.detail.actualCost', { amount: money(project.budgetRecord!.actualCost, project.currency) }) }}
            </template>
            <template v-else>{{ t('projects.detail.actualCostUnknown') }}</template>
          </p>
        </div>
        <div class="bg-card px-5 py-4">
          <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ t('projects.detail.scope') }}</p>
          <p class="mt-1.5 text-lg font-medium tabular-nums">{{ countLabel(project._count.shots, 'projects.count.shots') }}</p>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ countLabel(project._count.episodes, 'projects.count.episodes') }} · {{ countLabel(project._count.tasks, 'common.count.tasks') }}
          </p>
        </div>
      </section>

      <nav ref="tabStrip" class="scrollbar-none -mx-6 mt-8 flex gap-1 overflow-x-auto border-b px-6 sm:mx-0 sm:px-0" :aria-label="t('projects.detail.sections')">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          class="-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm"
          :class="activeTab === tab.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
          :aria-current="activeTab === tab.key ? 'page' : undefined"
          @click="selectTab(tab.key)"
        >
          <Icon :name="tab.icon" class="size-4" />
          {{ t('projects.detail.tabs.' + tab.key) }}
        </button>
      </nav>

      <div class="mt-6">
        <section v-if="activeTab === 'overview'" class="grid gap-5 lg:grid-cols-3">
          <div class="rounded-xl border bg-card lg:col-span-2">
            <header class="border-b px-5 py-4">
              <h2 class="text-sm font-medium">{{ t('projects.form.description') }}</h2>
            </header>
            <div class="px-5 py-5">
              <p v-if="project.description" class="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {{ project.description }}
              </p>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('projects.detail.noDescription') }}
              </p>
            </div>
          </div>

          <div class="rounded-xl border bg-card">
            <header class="border-b px-5 py-4">
              <h2 class="text-sm font-medium">{{ t('projects.detail.tabs.team') }}</h2>
            </header>
            <dl class="divide-y text-sm">
              <div class="flex items-center justify-between px-5 py-3">
                <dt class="text-muted-foreground">{{ t('projects.form.client') }}</dt>
                <dd class="font-medium">{{ project.client?.name ?? '—' }}</dd>
              </div>
              <div class="flex items-center justify-between px-5 py-3">
                <dt class="text-muted-foreground">{{ t('projects.detail.manager') }}</dt>
                <dd class="font-medium">
                  {{ project.projectManager
                    ? project.projectManager.firstName + ' ' + project.projectManager.lastName
                    : '—' }}
                </dd>
              </div>
              <div class="flex items-center justify-between px-5 py-3">
                <dt class="text-muted-foreground">{{ t('projects.detail.producer') }}</dt>
                <dd class="font-medium">
                  {{ project.producer
                    ? project.producer.firstName + ' ' + project.producer.lastName
                    : '—' }}
                </dd>
              </div>
              <div class="flex items-center justify-between px-5 py-3">
                <dt class="text-muted-foreground">{{ t('projects.form.priority') }}</dt>
                <dd><StatusBadge :status="project.priority" kind="priority" /></dd>
              </div>
            </dl>
          </div>
        </section>

        <ProjectPipelinePanel
          v-else-if="activeTab === 'pipeline'"
          :project-id="project.id"
          @changed="onPanelChanged"
        />

        <ProjectEpisodesPanel
          v-else-if="activeTab === 'episodes'"
          :project-id="project.id"
          @changed="onPanelChanged"
        />

        <ProjectScenesPanel
          v-else-if="activeTab === 'scenes'"
          :project-id="project.id"
          @changed="onPanelChanged"
        />

        <ProjectShotsPanel
          v-else-if="activeTab === 'shots'"
          :project-id="project.id"
          @changed="onPanelChanged"
        />

        <ProjectTasksPanel
          v-else-if="activeTab === 'tasks'"
          :project-id="project.id"
          @changed="onPanelChanged"
        />

        <ProjectTeamPanel v-else-if="activeTab === 'team'" :project-id="project.id" />

        <ProjectFilesPanel v-else-if="activeTab === 'files'" :project-id="project.id" />
      </div>
    </template>
  </div>
</template>

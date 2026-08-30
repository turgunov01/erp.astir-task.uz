<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

useHead({ title: 'Таймлайн — Aster ERP' })

const route = useRoute()
const router = useRouter()
const { openTask } = useTaskPanels()

const { data: projectData } = await useFetch<{
  data: Array<{ id: string, code: string, name: string }>
}>('/api/projects', {
  query: { limit: 100 }, credentials: 'include', default: () => ({ data: [] })
})
const projects = computed(() => projectData.value?.data ?? [])

/** Selected project lives in the URL, so a timeline is shareable. */
const projectId = computed({
  get: () => String(route.query.projectId ?? projects.value[0]?.id ?? ''),
  set: value => router.replace({ query: value ? { projectId: value } : {} })
})

interface TimelineTask {
  id: string
  title: string
  status: string
  priority: string
  startDate: string | null
  deadline: string | null
  stageId: string | null
  assignee: { id: string, firstName: string, lastName: string } | null
  dependencies: Array<{ dependsOnTaskId: string }>
}

interface TimelinePayload {
  project: {
    id: string
    code: string
    name: string
    startDate: string | null
    deadline: string | null
    progress: number
    stages: Array<{ id: string, name: string, order: number, progress: number }>
    milestones: Array<{
      id: string
      name: string
      dueDate: string | null
      completedAt: string | null
    }>
  }
  tasks: TimelineTask[]
}

const { data, pending, error, refresh } = await useFetch<{ data: TimelinePayload }>(
  '/api/dashboard/timeline',
  {
    query: computed(() => ({ projectId: projectId.value })),
    credentials: 'include'
  }
)

const payload = computed(() => data.value?.data)
const tasks = computed(() => payload.value?.tasks ?? [])

const DAY = 24 * 60 * 60 * 1000

/**
 * Time axis covering every dated thing in the project, padded by a couple days.
 *
 * Derived from the data rather than from the project's own dates, because a task
 * can legitimately run past the deadline and still has to be drawn.
 */
const axis = computed(() => {
  const stamps: number[] = []
  const add = (value: string | null | undefined) => {
    if (value) stamps.push(new Date(value).getTime())
  }

  add(payload.value?.project.startDate)
  add(payload.value?.project.deadline)
  for (const task of tasks.value) {
    add(task.startDate)
    add(task.deadline)
  }
  for (const milestone of payload.value?.project.milestones ?? []) add(milestone.dueDate)

  if (stamps.length === 0) {
    const now = Date.now()
    return { start: now, end: now + 30 * DAY }
  }
  return { start: Math.min(...stamps) - 2 * DAY, end: Math.max(...stamps) + 2 * DAY }
})

/** Position of a bar as percentages of the axis, clamped to it. */
function barStyle(from: string | null, to: string | null) {
  const { start, end } = axis.value
  const span = Math.max(1, end - start)
  const a = from
    ? new Date(from).getTime()
    : to ? new Date(to).getTime() - DAY : start
  const b = to ? new Date(to).getTime() : a + DAY

  const left = Math.max(0, ((a - start) / span) * 100)
  const right = Math.min(100, ((b - start) / span) * 100)
  return { marginLeft: left + '%', width: Math.max(1.5, right - left) + '%' }
}

function markerStyle(value: string | null) {
  if (!value) return { display: 'none' }
  const { start, end } = axis.value
  const position = ((new Date(value).getTime() - start) / Math.max(1, end - start)) * 100
  return { left: Math.min(100, Math.max(0, position)) + '%' }
}

const todayStyle = computed(() => markerStyle(new Date().toISOString()))

/** Month ticks along the top, so the axis is readable without a ruler. */
const ticks = computed(() => {
  const { start, end } = axis.value
  const result: Array<{ label: string, left: string }> = []
  const cursor = new Date(start)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)

  while (cursor.getTime() < end) {
    result.push({
      label: cursor.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }),
      left: (((cursor.getTime() - start) / Math.max(1, end - start)) * 100) + '%'
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return result
})

/** Tasks grouped under their pipeline stage, with the unassigned ones last. */
const groups = computed(() => {
  const stages = payload.value?.project.stages ?? []
  const byStage = stages
    .map(stage => ({
      id: stage.id,
      name: stage.name,
      tasks: tasks.value.filter(task => task.stageId === stage.id)
    }))
    .filter(group => group.tasks.length > 0)

  const loose = tasks.value.filter(task => !task.stageId)
  if (loose.length > 0) byStage.push({ id: 'none', name: 'Без этапа', tasks: loose })
  return byStage
})

const STATUS_BAR: Record<string, string> = {
  BACKLOG: 'bg-muted-foreground/40',
  READY: 'bg-sky-500',
  IN_PROGRESS: 'bg-violet-500',
  REVIEW: 'bg-amber-500',
  REVISION: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  DONE: 'bg-emerald-500',
  BLOCKED: 'bg-destructive'
}

/** A task is late when its deadline has passed and it is not finished. */
function isLate(task: TimelineTask) {
  return Boolean(task.deadline) &&
    new Date(task.deadline as string) < new Date() &&
    !['DONE', 'APPROVED'].includes(task.status)
}

const titleById = computed(() => new Map(tasks.value.map(task => [task.id, task.title])))

function barTitle(task: TimelineTask) {
  const parts = [task.title]
  if (task.startDate) parts.push('с ' + formatDay(task.startDate))
  if (task.deadline) parts.push('по ' + formatDay(task.deadline))
  if (task.assignee) parts.push(task.assignee.firstName + ' ' + task.assignee.lastName)
  if (task.dependencies.length > 0) {
    const names = task.dependencies
      .map(dep => titleById.value.get(dep.dependsOnTaskId))
      .filter(Boolean)
      .join(', ')
    if (names) parts.push('зависит от: ' + names)
  }
  return parts.join(' · ')
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-6 py-8">
    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Планирование
      </p>
      <div class="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Таймлайн</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            <template v-if="payload">
              {{ payload.project.code }} · {{ payload.project.name }} ·
              {{ tasks.length }} задач с датами · прогресс {{ payload.project.progress }}%
            </template>
            <template v-else>Этапы, задачи, зависимости и вехи проекта</template>
          </p>
        </div>

        <select
          v-model="projectId"
          class="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          aria-label="Проект"
        >
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.code }} · {{ p.name }}
          </option>
        </select>
      </div>
    </header>

    <div
      v-if="error"
      class="grid place-items-center rounded-xl border bg-card px-6 py-16 text-center"
    >
      <Icon name="lucide:triangle-alert" class="size-7 text-destructive" />
      <p class="mt-3 text-sm">Не удалось загрузить таймлайн</p>
      <button
        type="button"
        class="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        @click="refresh()"
      >
        Повторить
      </button>
    </div>

    <div v-else-if="pending && !payload" class="space-y-3">
      <div v-for="n in 5" :key="n" class="h-10 rounded-lg bg-muted" />
    </div>

    <p
      v-else-if="groups.length === 0"
      class="rounded-xl border bg-card px-6 py-16 text-center text-sm text-muted-foreground"
    >
      У задач этого проекта нет ни дат начала, ни сроков — разместить их на шкале не на чем.
    </p>

    <div v-else class="overflow-hidden rounded-xl border bg-card">
      <div class="border-b bg-muted/30 py-2 pl-64 pr-4">
        <div class="relative h-4">
          <span
            v-for="tick in ticks"
            :key="tick.label + tick.left"
            class="absolute -translate-x-1/2 text-xs text-muted-foreground"
            :style="{ left: tick.left }"
          >
            {{ tick.label }}
          </span>
        </div>
      </div>

      <div class="relative">
        <!-- Today, drawn once behind every row. -->
        <div
          class="pointer-events-none absolute inset-y-0 z-10 ml-64 w-px bg-destructive/50"
          :style="todayStyle"
          aria-hidden="true"
        />

        <section v-for="group in groups" :key="group.id" class="border-b last:border-b-0">
          <div class="flex items-center gap-2 bg-muted/20 px-4 py-1.5">
            <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ group.name }}
            </h2>
            <span class="text-xs tabular-nums text-muted-foreground">{{ group.tasks.length }}</span>
          </div>

          <div
            v-for="task in group.tasks"
            :key="task.id"
            class="flex items-center gap-3 px-4 py-1.5 hover:bg-secondary/40"
          >
            <button
              type="button"
              class="w-56 shrink-0 truncate text-left text-sm hover:underline"
              :title="task.title"
              @click="openTask(task.id)"
            >
              {{ task.title }}
            </button>

            <div class="relative h-5 min-w-0 flex-1">
              <div
                class="absolute h-5 rounded"
                :class="[
                  STATUS_BAR[task.status] ?? 'bg-muted-foreground/40',
                  isLate(task) ? 'ring-1 ring-destructive' : ''
                ]"
                :style="barStyle(task.startDate, task.deadline)"
                :title="barTitle(task)"
              />
              <Icon
                v-if="task.dependencies.length > 0"
                name="lucide:link"
                class="absolute top-0.5 size-3.5 text-background"
                :style="barStyle(task.startDate, task.deadline)"
                aria-hidden="true"
              />
            </div>
          </div>
        </section>

        <section v-if="(payload?.project.milestones.length ?? 0) > 0" class="border-t">
          <div class="bg-muted/20 px-4 py-1.5">
            <h2 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Вехи
            </h2>
          </div>
          <div
            v-for="milestone in payload?.project.milestones"
            :key="milestone.id"
            class="flex items-center gap-3 px-4 py-1.5"
          >
            <span class="w-56 shrink-0 truncate text-sm" :title="milestone.name">
              {{ milestone.name }}
            </span>
            <div class="relative h-5 min-w-0 flex-1">
              <span
                class="absolute top-1 size-3 -translate-x-1/2 rotate-45"
                :class="milestone.completedAt ? 'bg-emerald-500' : 'bg-violet-500'"
                :style="markerStyle(milestone.dueDate)"
                :title="milestone.name + (milestone.dueDate ? ' · ' + formatDay(milestone.dueDate) : '')"
              />
            </div>
          </div>
        </section>
      </div>
    </div>

    <p class="mt-3 text-xs text-muted-foreground">
      Красная вертикаль — сегодня. Обводка на полосе означает просроченный срок,
      иконка звена — что у задачи есть зависимости.
    </p>
  </div>
</template>

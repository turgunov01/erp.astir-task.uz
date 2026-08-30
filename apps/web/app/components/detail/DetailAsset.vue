<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'

const props = defineProps<{ id: string, offset: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { closeAll } = useTaskPanels()

interface AssetVersion {
  id: string
  label: string
  versionNumber: number
  status: string
  createdAt: string
}

interface Asset {
  id: string
  name: string
  type: string
  status: string
  description: string | null
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
  project: { id: string, code: string, name: string } | null
  owner: { firstName: string, lastName: string } | null
  versions: AssetVersion[]
  _count: { versions: number }
}

const { data, pending, error, refresh } = await useFetch<{ data: Asset }>(
  () => '/api/assets/' + props.id,
  { credentials: 'include' }
)

const asset = computed(() => data.value?.data)
const versions = computed(() => asset.value?.versions ?? [])
</script>

<template>
  <DetailPanel
    :title="asset?.name ?? 'Ассет'"
    :subtitle="asset ? (ASSET_TYPE_LABEL[asset.type] ?? asset.type) : 'Библиотека ассетов'"
    :offset="props.offset"
    :pending="pending"
    :error="Boolean(error)"
    width="wide"
    panel-label="Детали ассета"
    @close="emit('close')"
    @retry="refresh()"
  >
    <div v-if="asset" class="grid gap-px bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- Left column: identity and metadata -->
      <div class="bg-background">
        <div class="border-b p-5">
          <div class="aspect-video w-full overflow-hidden rounded-lg border bg-secondary">
            <img
              v-if="asset.thumbnailUrl"
              :src="asset.thumbnailUrl"
              :alt="asset.name"
              class="size-full object-cover"
              loading="lazy"
            >
            <div v-else class="grid size-full place-items-center">
              <Icon name="lucide:box" class="size-10 text-muted-foreground/50" />
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge :status="asset.status" />
            <span class="rounded-md bg-secondary px-2 py-0.5 text-xs">
              {{ ASSET_TYPE_LABEL[asset.type] ?? asset.type }}
            </span>
            <span class="text-xs text-muted-foreground">
              {{ asset._count.versions }} версий
            </span>
          </div>
        </div>

        <section v-if="asset.description" class="border-b px-5 py-4">
          <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Описание
          </h3>
          <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{{ asset.description }}</p>
        </section>

        <dl class="divide-y">
          <DetailRow label="Статус">
            {{ PRODUCTION_STATUS_LABEL[asset.status] ?? asset.status }}
          </DetailRow>
          <DetailRow label="Проект">
            <NuxtLink
              v-if="asset.project"
              :to="'/projects/' + asset.project.id"
              class="hover:underline"
              @click="closeAll()"
            >
              {{ asset.project.code }} · {{ asset.project.name }}
            </NuxtLink>
            <span v-else class="text-muted-foreground">общий</span>
          </DetailRow>
          <DetailRow label="Владелец">{{ fullName(asset.owner) }}</DetailRow>
          <DetailRow label="Создан">{{ formatDateTime(asset.createdAt) }}</DetailRow>
          <DetailRow label="Обновлён">{{ formatDateTime(asset.updatedAt) }}</DetailRow>
        </dl>
      </div>

      <!-- Right column: the version history the extra width is for -->
      <div class="bg-background">
        <h3
          class="border-b px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Версии
        </h3>

        <p v-if="versions.length === 0" class="px-5 py-6 text-sm text-muted-foreground">
          У ассета пока нет версий.
        </p>

        <ul v-else class="divide-y">
          <li
            v-for="version in versions"
            :key="version.id"
            class="flex items-start justify-between gap-3 px-5 py-3"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ version.label }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                v{{ version.versionNumber }} · {{ formatDateTime(version.createdAt) }}
              </p>
            </div>
            <StatusBadge :status="version.status" />
          </li>
        </ul>
      </div>
    </div>
  </DetailPanel>
</template>

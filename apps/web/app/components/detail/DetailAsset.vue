<script setup lang="ts">
import { useTaskPanels } from '~/composables/useTaskPanels'
import type { ViewerItem } from '~/utils/media'

const props = defineProps<{ id: string, offset: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const { closeAll } = useTaskPanels()

interface AssetVersion {
  id: string
  label: string
  versionNumber: number
  status: string
  createdAt: string
  fileUrl: string | null
  previewUrl: string | null
  fileName: string | null
  fileSize: string | null
  mimeType: string | null
  uploadedBy: { firstName: string, lastName: string } | null
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

/**
 * The thumbnail and every version with a file, as one gallery: opening any of
 * them lets the artist flip through the asset's history side by side.
 */
const viewerItems = computed<ViewerItem[]>(() => {
  const item = asset.value
  if (!item) return []
  const list: ViewerItem[] = []
  if (item.thumbnailUrl) {
    list.push({
      id: 'thumb-' + item.id,
      name: item.name,
      url: item.thumbnailUrl,
      mimeType: null,
      caption: t('production.assetDetail.thumbnailCaption')
    })
  }
  for (const version of versions.value) {
    if (!version.fileUrl) continue
    list.push({
      id: version.id,
      name: version.fileName || version.label,
      url: version.fileUrl,
      mimeType: version.mimeType,
      size: version.fileSize,
      previewUrl: version.previewUrl,
      author: version.uploadedBy ? fullName(version.uploadedBy) : null,
      createdAt: version.createdAt,
      caption: version.label + ' · v' + version.versionNumber
    })
  }
  return list
})

const viewer = useMediaViewer()

function openInViewer(id: string) {
  viewer.open(viewerItems.value, id)
}
</script>

<template>
  <DetailPanel
    :title="asset?.name ?? t('production.assetDetail.fallbackTitle')"
    :subtitle="asset ? labelOf(ASSET_TYPE_LABEL, asset.type) : t('shell.nav.assets')"
    :offset="props.offset"
    :pending="pending"
    :error="Boolean(error)"
    width="wide"
    :panel-label="t('production.assetDetail.panelLabel')"
    @close="emit('close')"
    @retry="refresh()"
  >
    <div v-if="asset" class="grid gap-px bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- Left column: identity and metadata -->
      <div class="bg-background">
        <div class="border-b p-5">
          <div class="aspect-video w-full overflow-hidden rounded-lg border bg-secondary">
            <button
              v-if="asset.thumbnailUrl"
              type="button"
              class="block size-full cursor-zoom-in"
              :aria-label="t('production.assetDetail.openThumbnail', { name: asset.name })"
              @click="openInViewer('thumb-' + asset.id)"
            >
              <img
                :src="asset.thumbnailUrl"
                :alt="asset.name"
                class="size-full object-cover"
                loading="lazy"
              >
            </button>
            <div v-else class="grid size-full place-items-center">
              <Icon name="lucide:box" class="size-10 text-muted-foreground/50" />
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge :status="asset.status" />
            <span class="rounded-md bg-secondary px-2 py-0.5 text-xs">
              {{ labelOf(ASSET_TYPE_LABEL, asset.type) }}
            </span>
            <span class="text-xs text-muted-foreground">
              {{ t('production.assetDetail.versionsCount', asset._count.versions) }}
            </span>
          </div>
        </div>

        <section v-if="asset.description" class="border-b px-5 py-4">
          <h3 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {{ t('production.assetDetail.description') }}
          </h3>
          <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{{ asset.description }}</p>
        </section>

        <dl class="divide-y">
          <DetailRow :label="t('production.detail.status')">
            {{ labelOf(PRODUCTION_STATUS_LABEL, asset.status) }}
          </DetailRow>
          <DetailRow :label="t('production.detail.project')">
            <NuxtLink
              v-if="asset.project"
              :to="'/projects/' + asset.project.id"
              class="hover:underline"
              @click="closeAll()"
            >
              {{ asset.project.code }} · {{ asset.project.name }}
            </NuxtLink>
            <span v-else class="text-muted-foreground">{{ t('production.detail.shared') }}</span>
          </DetailRow>
          <DetailRow :label="t('production.detail.owner')">{{ fullName(asset.owner) }}</DetailRow>
          <DetailRow :label="t('production.detail.created')">{{ formatDateTime(asset.createdAt) }}</DetailRow>
          <DetailRow :label="t('production.detail.updated')">{{ formatDateTime(asset.updatedAt) }}</DetailRow>
        </dl>
      </div>

      <!-- Right column: the version history the extra width is for -->
      <div class="bg-background">
        <h3
          class="border-b px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {{ t('production.assetDetail.versions') }}
        </h3>

        <p v-if="versions.length === 0" class="px-5 py-6 text-sm text-muted-foreground">
          {{ t('production.assetDetail.noVersions') }}
        </p>

        <ul v-else class="divide-y">
          <li
            v-for="version in versions"
            :key="version.id"
            class="flex items-center gap-3 px-5 py-3"
          >
            <button
              v-if="version.fileUrl"
              type="button"
              class="block size-12 shrink-0 overflow-hidden rounded-md border bg-secondary hover:opacity-90"
              :aria-label="t('production.detail.openVersionFile', { label: version.label })"
              @click="openInViewer(version.id)"
            >
              <MediaThumb
                :item="{ name: version.fileName || version.label, url: version.fileUrl, mimeType: version.mimeType, previewUrl: version.previewUrl }"
                icon-class="size-4"
              />
            </button>
            <div class="min-w-0 flex-1">
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

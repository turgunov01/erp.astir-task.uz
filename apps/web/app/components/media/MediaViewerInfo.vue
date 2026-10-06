<script setup lang="ts">
import type { ViewerItem } from '~/utils/media'

/** Everything known about the open file, with the download beside it. */
const props = defineProps<{
  item: ViewerItem
  /** Measured by the stage once the media loads. */
  dimensions: { width: number, height: number, duration?: number } | null
  downloadUrl: string | null
}>()

const { t } = useI18n()
const kind = computed(() => mediaKind(props.item.mimeType, props.item.name))

const rows = computed(() => {
  const list: Array<{ label: string, value: string }> = [
    { label: t('projects.media.info.type'), value: MEDIA_KIND_LABEL[kind.value] + (fileFormat(props.item.name) ? ' · ' + fileFormat(props.item.name) : '') }
  ]
  const size = formatBytes(props.item.size)
  if (size) list.push({ label: t('projects.documents.columns.size'), value: size })
  const dims = props.dimensions
  if (dims && dims.width && dims.height) {
    list.push({ label: t('projects.media.info.resolution'), value: dims.width + ' × ' + dims.height })
  }
  if (dims?.duration) list.push({ label: t('projects.media.info.duration'), value: formatDuration(dims.duration) })
  if (props.item.author) list.push({ label: t('projects.media.info.author'), value: props.item.author })
  if (props.item.createdAt) list.push({ label: t('projects.media.info.uploaded'), value: formatDateTime(props.item.createdAt) })
  if (props.item.caption) list.push({ label: t('projects.media.info.relatesTo'), value: props.item.caption })
  return list
})
</script>

<template>
  <div class="flex h-full flex-col">
    <h3 class="break-words text-sm font-medium text-white">{{ item.name }}</h3>
    <dl class="mt-4 space-y-3 text-sm">
      <div v-for="row in rows" :key="row.label">
        <dt class="text-xs text-white/50">{{ row.label }}</dt>
        <dd class="mt-0.5 break-words text-white/90">{{ row.value }}</dd>
      </div>
    </dl>
    <a
      v-if="downloadUrl"
      :href="downloadUrl"
      :download="item.name"
      class="mt-6 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <Icon name="lucide:download" class="size-4" />
      {{ t('common.actions.download') }}
    </a>
  </div>
</template>

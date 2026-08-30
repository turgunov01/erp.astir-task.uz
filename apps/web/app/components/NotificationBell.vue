<script setup lang="ts">
import { apiRequest } from '~/composables/useApi'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  linkUrl: string | null
  readAt: string | null
  createdAt: string
}

const open = ref(false)

const { data, refresh } = await useFetch<{ data: Notification[] }>('/api/notifications', {
  query: { limit: 10 },
  credentials: 'include',
  default: () => ({ data: [] })
})

const notifications = computed(() => data.value?.data ?? [])
const unread = computed(() => notifications.value.filter(item => !item.readAt).length)

async function markRead(item: Notification) {
  if (item.readAt) return
  await apiRequest('/api/notifications/' + item.id + '/read', { method: 'POST' })
  await refresh()
}

async function markAll() {
  await apiRequest('/api/notifications/read-all', { method: 'POST' })
  await refresh()
}

async function follow(item: Notification) {
  await markRead(item)
  open.value = false
  if (item.linkUrl) await navigateTo(item.linkUrl)
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return minutes + ' мин назад'
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours + ' ч назад'
  return Math.round(hours / 24) + ' дн назад'
}

/** Russian needs three plural forms, not the English one-or-many. */
function pluralUnread(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return count + ' непрочитанное уведомление'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return count + ' непрочитанных уведомления'
  }
  return count + ' непрочитанных уведомлений'
}

function iconFor(type: string) {
  if (type.startsWith('TASK')) return 'lucide:list-checks'
  if (type.startsWith('VERSION')) return 'lucide:layers'
  if (type.includes('DEADLINE')) return 'lucide:calendar-clock'
  return 'lucide:bell'
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      :aria-label="unread > 0 ? pluralUnread(unread) : 'Уведомления'"
      @click="open = !open"
    >
      <Icon name="lucide:bell" class="size-4" />
      <span
        v-if="unread > 0"
        class="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground"
      >
        {{ unread > 9 ? '9+' : unread }}
      </span>
    </button>

    <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />

    <div
      v-if="open"
      class="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg"
    >
      <header class="flex items-center justify-between border-b px-4 py-2.5">
        <h2 class="text-sm font-medium">Уведомления</h2>
        <button
          v-if="unread > 0"
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground"
          @click="markAll"
        >
          Прочитать все
        </button>
      </header>

      <p v-if="notifications.length === 0" class="px-4 py-10 text-center text-sm text-muted-foreground">
        Пока нет уведомлений
      </p>

      <ul v-else class="max-h-96 divide-y overflow-y-auto">
        <li v-for="item in notifications" :key="item.id">
          <button
            type="button"
            class="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-secondary/60"
            :class="item.readAt ? 'opacity-60' : ''"
            @click="follow(item)"
          >
            <Icon :name="iconFor(item.type)" class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm leading-snug">{{ item.title }}</span>
              <span v-if="item.body" class="mt-0.5 block text-xs text-muted-foreground">
                {{ item.body }}
              </span>
              <span class="mt-1 block text-xs text-muted-foreground">
                {{ timeAgo(item.createdAt) }}
              </span>
            </span>
            <span v-if="!item.readAt" class="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

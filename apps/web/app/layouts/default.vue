<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useVisibleNavigation } from '~/composables/useNavigation'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu'

const auth = useAuthStore()
const navigation = useVisibleNavigation()
const route = useRoute()

const collapsed = ref(false)
// Keyed by the nav label, so this has to move with the translation.
const openGroups = ref<Set<string>>(new Set(['Производство']))

function toggleGroup(label: string) {
  const next = new Set(openGroups.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  openGroups.value = next
}

function isActive(path?: string) {
  return path ? route.path === path || route.path.startsWith(path + '/') : false
}
</script>

<template>
  <div class="flex min-h-svh bg-background text-foreground">
    <aside
      class="hidden shrink-0 border-r bg-card lg:flex lg:flex-col"
      :class="collapsed ? 'w-16' : 'w-64'"
    >
      <div class="flex h-14 items-center gap-2.5 px-4">
        <div class="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
          <span class="text-sm font-semibold">A</span>
        </div>
        <div v-if="!collapsed" class="min-w-0">
          <p class="truncate text-sm font-semibold leading-tight">Aster ERP</p>
          <p class="truncate text-xs text-muted-foreground">Анимационная студия</p>
        </div>
      </div>

      <Separator />

      <nav class="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Основная навигация">
        <template v-for="item in navigation" :key="item.label">
          <NuxtLink
            v-if="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm"
            :class="isActive(item.to) ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
          >
            <Icon :name="item.icon" class="size-4 shrink-0" />
            <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
          </NuxtLink>

          <div v-else>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              :aria-expanded="openGroups.has(item.label)"
              @click="toggleGroup(item.label)"
            >
              <Icon :name="item.icon" class="size-4 shrink-0" />
              <span v-if="!collapsed" class="flex-1 truncate text-left">{{ item.label }}</span>
              <Icon
                v-if="!collapsed"
                name="lucide:chevron-down"
                class="size-3.5"
                :class="openGroups.has(item.label) ? 'rotate-180' : ''"
              />
            </button>

            <div v-if="!collapsed && openGroups.has(item.label)" class="mt-0.5 space-y-0.5 pl-4">
              <NuxtLink
                v-for="child in item.children"
                :key="child.label"
                :to="child.to!"
                class="flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm"
                :class="isActive(child.to) ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
              >
                <Icon :name="child.icon" class="size-3.5 shrink-0" />
                <span class="truncate">{{ child.label }}</span>
              </NuxtLink>
            </div>
          </div>
        </template>
      </nav>

      <Separator />
      <div class="p-2">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          @click="collapsed = !collapsed"
        >
          <Icon :name="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" class="size-4" />
          <span v-if="!collapsed">Свернуть</span>
        </button>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
          aria-label="Показать или скрыть навигацию"
          @click="collapsed = !collapsed"
        >
          <Icon name="lucide:menu" class="size-4" />
        </button>

        <div class="relative hidden max-w-md flex-1 sm:block">
          <Icon
            name="lucide:search"
            class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Поиск по проектам, шотам, задачам..."
            class="h-9 w-full rounded-md border bg-background pl-8 pr-16 text-sm outline-none focus:border-ring"
          >
          <kbd class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Ctrl K
          </kbd>
        </div>

        <div class="ml-auto flex items-center gap-1">
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                type="button"
                class="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary"
              >
                <span class="grid size-7 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {{ auth.initials }}
                </span>
                <span class="hidden text-sm sm:inline">{{ auth.fullName }}</span>
                <Icon name="lucide:chevron-down" class="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel>
                <p class="text-sm font-medium">{{ auth.fullName }}</p>
                <p class="text-xs font-normal text-muted-foreground">{{ auth.user?.email }}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="navigateTo('/profile')">
                <Icon name="lucide:user" class="mr-2 size-4" /> Профиль
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @select="auth.logout()">
                <Icon name="lucide:log-out" class="mr-2 size-4" /> Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <TaskPanelHost />
  </div>
</template>

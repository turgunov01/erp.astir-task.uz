<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useVisibleNavigation, type NavItem } from '~/composables/useNavigation'
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
const brand = useBrand()
/** One letter for the tile: the logo when there is one, the initial otherwise. */
const brandInitial = computed(() => brand.value.name.trim().charAt(0).toUpperCase() || 'E')
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

/**
 * Every path the sidebar links to, most specific first.
 *
 * Matching by prefix is what keeps "Проекты" lit on /projects/<id>. It misfires
 * only where one link is a prefix of a sibling: /finance is the overview page
 * and also the prefix of every page under it, so both lit up at once. Sorting
 * by length lets the most specific match win, and exactly one item is active.
 */
const navPaths = computed(() => {
  const paths: string[] = []
  for (const item of navigation.value) {
    if (item.to) paths.push(item.to)
    for (const child of item.children ?? []) {
      if (child.to) paths.push(child.to)
    }
  }
  return paths.sort((a, b) => b.length - a.length)
})

const activePath = computed(() =>
  navPaths.value.find(
    path => route.path === path || route.path.startsWith(path + '/')
  ) ?? ''
)

function isActive(path?: string) {
  return Boolean(path) && path === activePath.value
}

/** The tree as a flat list, for surfaces that cannot nest. */
const flatNav = computed(() =>
  navigation.value.flatMap(item => item.children ?? (item.to ? [item] : []))
)

/*
 * The four destinations the bottom bar offers.
 *
 * A phone has room for five slots and the fifth is "Ещё", so this is a
 * deliberate shortlist rather than the first four of the menu. Anything the
 * session may not open is skipped and the next candidate moves up, so the bar
 * is never short and never shows a tab that leads to a refusal.
 */
/**
 * Shorter names for the bar.
 *
 * A tab is about seventy pixels wide, and a label that truncates to an
 * ellipsis names nothing. Only the entries that do not fit are overridden.
 */
const PHONE_TAB_LABEL: Record<string, string> = {
  '/dashboard': 'Панель',
  '/finance': 'Финансы',
  '/activity': 'События'
}

const PHONE_TABS = ['/dashboard', '/projects', '/tasks', '/calendar', '/finance', '/activity']

const bottomTabs = computed(() => {
  const byPath = new Map(flatNav.value.map(item => [item.to, item]))
  return PHONE_TABS.map(path => byPath.get(path))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, 4)
})

/** The whole menu on a phone, where there is no sidebar to hold it. */
const moreOpen = ref(false)

// Tapping a link inside the sheet must also close the sheet.
watch(() => route.path, () => { moreOpen.value = false })
</script>

<template>
  <div class="flex h-svh overflow-hidden bg-background text-foreground">
    <aside
      class="hidden shrink-0 border-r bg-card print:hidden lg:flex lg:flex-col"
      :class="collapsed ? 'w-16' : 'w-64'"
    >
      <div class="flex h-14 items-center gap-2.5 px-4">
        <div class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary text-primary-foreground">
          <img v-if="brand.logoUrl" :src="brand.logoUrl" :alt="brand.name" class="size-full object-cover">
          <span v-else class="text-sm font-semibold">{{ brandInitial }}</span>
        </div>
        <div v-if="!collapsed" class="min-w-0">
          <p class="truncate text-sm font-semibold leading-tight">{{ brand.name }}</p>
          <p class="truncate text-xs text-muted-foreground">Управление производством</p>
        </div>
      </div>

      <Separator />

      <nav class="scrollbar-none flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Основная навигация">
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
      <header class="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 print:hidden">
        <!--
          The sidebar this used to toggle is hidden below lg, so on a phone the
          button did nothing at all. Navigation lives in the bottom bar now, and
          the space goes to saying which application this is.
        -->
        <div class="flex items-center gap-2 lg:hidden">
          <span class="grid size-7 place-items-center overflow-hidden rounded-md bg-primary text-xs font-semibold text-primary-foreground">
            <img v-if="brand.logoUrl" :src="brand.logoUrl" :alt="brand.name" class="size-full object-cover">
            <template v-else>{{ brandInitial }}</template>
          </span>
          <span class="text-sm font-semibold">{{ brand.name }}</span>
        </div>

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

      <main class="flex-1 overflow-y-auto overscroll-contain">
        <slot />
      </main>

      <!--
        A sibling of main rather than fixed over it: the shell is already a
        fixed-height column that hides its own overflow, so a flex item stays
        put with no padding to reserve and nothing to overlap.
      -->
      <nav
        class="flex shrink-0 items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] print:hidden lg:hidden"
        aria-label="Основные разделы"
      >
        <NuxtLink
          v-for="item in bottomTabs"
          :key="item.label"
          :to="item.to!"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]"
          :class="isActive(item.to) ? 'text-foreground' : 'text-muted-foreground'"
        >
          <Icon :name="item.icon" class="size-5" />
          <span class="max-w-full truncate px-1">{{ PHONE_TAB_LABEL[item.to!] ?? item.label }}</span>
        </NuxtLink>

        <button
          type="button"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]"
          :class="moreOpen ? 'text-foreground' : 'text-muted-foreground'"
          :aria-expanded="moreOpen"
          @click="moreOpen = !moreOpen"
        >
          <Icon :name="moreOpen ? 'lucide:x' : 'lucide:menu'" class="size-5" />
          <span>{{ moreOpen ? 'Закрыть' : 'Ещё' }}</span>
        </button>
      </nav>
    </div>

    <!-- Everything the four tabs left out, on a phone. -->
    <div v-if="moreOpen" class="fixed inset-0 z-50 flex flex-col lg:hidden">
      <button
        type="button"
        class="flex-1 bg-black/50"
        aria-label="Закрыть меню"
        @click="moreOpen = false"
      />

      <div class="max-h-[75svh] overflow-y-auto overscroll-contain rounded-t-2xl border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <div class="sticky top-0 flex items-center justify-between border-b bg-card px-5 py-3">
          <p class="text-sm font-medium">Навигация</p>
          <button type="button" class="text-sm text-muted-foreground" @click="moreOpen = false">
            Закрыть
          </button>
        </div>

        <div class="p-2">
          <template v-for="item in navigation" :key="item.label">
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"
              :class="isActive(item.to) ? 'bg-secondary font-medium' : 'text-muted-foreground'"
            >
              <Icon :name="item.icon" class="size-4 shrink-0" />
              {{ item.label }}
            </NuxtLink>

            <p
              v-else
              class="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {{ item.label }}
            </p>

            <NuxtLink
              v-for="child in item.children ?? []"
              :key="child.label"
              :to="child.to!"
              class="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm"
              :class="isActive(child.to) ? 'bg-secondary font-medium' : 'text-muted-foreground'"
            >
              <Icon :name="child.icon" class="size-4 shrink-0" />
              {{ child.label }}
            </NuxtLink>
          </template>
        </div>
      </div>
    </div>

    <TaskPanelHost />
  </div>
</template>

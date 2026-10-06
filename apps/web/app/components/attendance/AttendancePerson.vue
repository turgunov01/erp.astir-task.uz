<script setup lang="ts">
import { safeMediaUrl } from '~/utils/media'
import type { AttendancePerson } from '~/utils/attendance'

/** Avatar, name and "position · department" for one row. */
const props = defineProps<{ person: AttendancePerson, online?: boolean }>()

const avatar = computed(() => safeMediaUrl(props.person.user.avatarUrl))
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <span class="relative shrink-0">
      <span class="grid size-9 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
        <img v-if="avatar" :src="avatar" alt="" class="size-full object-cover">
        <span v-else>{{ personInitials(props.person.user) }}</span>
      </span>
      <span
        v-if="props.online"
        class="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500"
        aria-hidden="true"
      />
    </span>
    <span class="min-w-0">
      <span class="block truncate text-sm font-medium">
        {{ props.person.user.firstName }} {{ props.person.user.lastName }}
      </span>
      <span class="block truncate text-xs text-muted-foreground">
        {{ props.person.position }}<template v-if="props.person.department"> · {{ props.person.department.name }}</template>
      </span>
    </span>
  </div>
</template>

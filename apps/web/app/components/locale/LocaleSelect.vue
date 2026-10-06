<script setup lang="ts">
import { LOCALES, LOCALE_NATIVE_NAME, type Locale } from '@astir/types'

/**
 * A language picker as a plain select: the four languages named in
 * themselves, and optionally a first entry meaning "no choice of my own"
 * (`null`), labelled by the caller («Как в студии (Русский)»).
 *
 * `compact` is the sign-in page variant: a globe and a short code, no label.
 */
const props = withDefaults(defineProps<{
  modelValue: Locale | null
  /** Label of the `null` entry; omitted means no such entry. */
  defaultLabel?: string
  disabled?: boolean
  compact?: boolean
  id?: string
  ariaLabel?: string
}>(), {
  defaultLabel: undefined,
  disabled: false,
  compact: false,
  id: undefined,
  ariaLabel: undefined
})

const emit = defineEmits<{ 'update:modelValue': [value: Locale | null] }>()

const DEFAULT_VALUE = ''

const selected = computed({
  get: () => props.modelValue ?? DEFAULT_VALUE,
  set: (value: string) => emit('update:modelValue', value === DEFAULT_VALUE ? null : (value as Locale))
})
</script>

<template>
  <label
    v-if="compact"
    class="relative inline-flex h-8 items-center gap-1.5 rounded-md border bg-background pl-2 pr-1 text-xs text-muted-foreground focus-within:border-ring hover:text-foreground"
  >
    <Icon name="lucide:globe" class="size-3.5" aria-hidden="true" />
    <select
      :id="id"
      v-model="selected"
      :disabled="disabled"
      :aria-label="ariaLabel"
      class="h-full cursor-pointer appearance-none bg-transparent pr-4 font-medium text-foreground outline-none disabled:opacity-60"
    >
      <option v-for="code in LOCALES" :key="code" :value="code" :lang="code">
        {{ LOCALE_NATIVE_NAME[code] }}
      </option>
    </select>
    <Icon name="lucide:chevron-down" class="pointer-events-none absolute right-1 size-3" aria-hidden="true" />
  </label>

  <div v-else class="relative">
    <select
      :id="id"
      v-model="selected"
      :disabled="disabled"
      :aria-label="ariaLabel"
      class="h-9 w-full cursor-pointer appearance-none rounded-md border bg-background pl-2.5 pr-8 text-sm outline-none focus:border-ring disabled:cursor-default disabled:opacity-60"
    >
      <option v-if="defaultLabel" :value="DEFAULT_VALUE">{{ defaultLabel }}</option>
      <option v-for="code in LOCALES" :key="code" :value="code" :lang="code">
        {{ LOCALE_NATIVE_NAME[code] }}
      </option>
    </select>
    <Icon
      name="lucide:chevron-down"
      class="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
  </div>
</template>

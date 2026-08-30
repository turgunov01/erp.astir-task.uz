<script setup lang="ts">
type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'

const props = defineProps<{ status: string, kind?: 'project' | 'risk' | 'generic' }>()

/** Semantic colour, not decorative: tone always encodes production meaning. */
const PROJECT_TONES: Record<string, Tone> = {
  DRAFT: 'neutral',
  PLANNING: 'info',
  PRE_PRODUCTION: 'info',
  PRODUCTION: 'progress',
  POST_PRODUCTION: 'progress',
  CLIENT_REVIEW: 'warning',
  DELIVERY: 'warning',
  COMPLETED: 'success',
  ON_HOLD: 'warning',
  CANCELLED: 'danger',
  ARCHIVED: 'neutral',
  // A review nobody decided on before its deadline: closed, not failed.
  EXPIRED: 'neutral',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ON_LEAVE: 'warning'
}

const RISK_TONES: Record<string, Tone> = {
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger'
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  progress: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-signal/18 text-amber-800 dark:text-amber-200',
  danger: 'bg-destructive/12 text-destructive'
}

const tone = computed<Tone>(() => {
  if (props.kind === 'risk') return RISK_TONES[props.status] ?? 'neutral'
  return PROJECT_TONES[props.status] ?? 'neutral'
})

/*
 * The badge is handed a raw enum member and does not know which enum it came
 * from, so the label comes from the merged map rather than from prettifying
 * the English identifier.
 */
const label = computed(() =>
  props.kind === 'risk'
    ? enumLabel(RISK_LABEL, props.status)
    : enumLabel(STATUS_LABEL, props.status)
)
</script>

<template>
  <span
    class="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium"
    :class="TONE_CLASS[tone]"
  >
    {{ label }}
  </span>
</template>

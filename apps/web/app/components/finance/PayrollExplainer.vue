<script setup lang="ts">
import { wholeHours, type PayrollMonth } from '~/utils/payroll-month'

/**
 * «Как считается зарплата»: the calculation spelled out step by step, with
 * this month's own numbers (working days, shift hours, fine rates) so the
 * table reads as arithmetic rather than a set of mystery columns.
 * Open until the reader folds it; the fold is remembered in this browser.
 */
const props = defineProps<{ month: PayrollMonth }>()

const { t } = useI18n()

const STORAGE_KEY = 'payroll-explainer-closed'
const open = ref(true)
onMounted(() => {
  try {
    open.value = localStorage.getItem(STORAGE_KEY) !== '1'
  } catch {
    open.value = true
  }
})
function onToggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
  try {
    localStorage.setItem(STORAGE_KEY, open.value ? '0' : '1')
  } catch {
    // Remembering the fold is a convenience; without storage it simply reopens.
  }
}

const finesOn = computed(() => props.month.penaltyPerDay > 0 || props.month.penaltyPerMinute > 0)
const rate = (value: number) => formatMoney(value, props.month.currency, 0)

const steps = computed(() => [
  {
    sign: '',
    icon: 'lucide:calendar-days',
    title: t('finance.payroll.explain.normTitle'),
    body: t('finance.payroll.explain.normBody', {
      days: props.month.workingDays,
      shift: wholeHours(props.month.shiftMinutes),
      start: props.month.start,
      end: props.month.end,
      norm: wholeHours(props.month.normMinutes)
    })
  },
  {
    sign: '',
    icon: 'lucide:timer',
    title: t('finance.payroll.explain.workedTitle'),
    body: t('finance.payroll.explain.workedBody')
  },
  {
    sign: '=',
    icon: 'lucide:wallet',
    title: t('finance.payroll.explain.earnedTitle'),
    body: t('finance.payroll.explain.earnedBody')
  },
  {
    sign: '+',
    icon: 'lucide:gift',
    title: t('finance.payroll.explain.bonusTitle'),
    body: t('finance.payroll.explain.bonusBody')
  },
  {
    sign: '−',
    icon: 'lucide:alarm-clock',
    title: t('finance.payroll.explain.latenessTitle'),
    body: finesOn.value
      ? t('finance.payroll.explain.latenessBody', {
        perDay: rate(props.month.penaltyPerDay),
        perMinute: rate(props.month.penaltyPerMinute)
      })
      : t('finance.payroll.explain.latenessOff')
  },
  {
    sign: '−',
    icon: 'lucide:receipt',
    title: t('finance.payroll.explain.withheldTitle'),
    body: t('finance.payroll.explain.withheldBody')
  }
])

function badgeClass(sign: string) {
  if (sign === '−') return 'bg-destructive/10 text-destructive'
  if (sign === '+' || sign === '=') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  return 'bg-primary/10 text-primary'
}
</script>

<template>
  <details class="group border-b bg-secondary/30" :open="open" @toggle="onToggle">
    <summary class="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium hover:bg-secondary/60 [&::-webkit-details-marker]:hidden">
      <Icon name="lucide:circle-help" class="size-4 text-muted-foreground" />
      {{ t('finance.payroll.explain.title') }}
      <Icon name="lucide:chevron-down" class="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>

    <div class="px-5 pb-5">
      <ol class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        <li
          v-for="(step, index) in steps"
          :key="step.title"
          class="flex gap-3 rounded-lg border bg-card p-3.5"
        >
          <span
            class="grid size-8 shrink-0 place-items-center rounded-md text-sm font-semibold tabular-nums"
            :class="badgeClass(step.sign)"
            aria-hidden="true"
          >
            {{ step.sign || index + 1 }}
          </span>
          <div class="min-w-0">
            <p class="flex items-center gap-1.5 text-sm font-medium">
              <Icon :name="step.icon" class="size-3.5 text-muted-foreground" />
              {{ step.title }}
            </p>
            <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ step.body }}</p>
          </div>
        </li>
      </ol>
      <p class="mt-3 rounded-lg border border-dashed bg-card px-3.5 py-2.5 text-sm">
        <span class="font-semibold">{{ t('finance.payroll.columns.net') }}</span>
        <span class="text-muted-foreground"> = {{ t('finance.payroll.explain.netFormula') }}</span>
      </p>
      <p class="mt-2 text-xs text-muted-foreground">{{ t('finance.payroll.explain.entriesNote') }}</p>
    </div>
  </details>
</template>

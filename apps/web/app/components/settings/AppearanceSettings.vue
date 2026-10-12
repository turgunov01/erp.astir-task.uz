<script setup lang="ts">
import {
  DEFAULT_APPEARANCE,
  HEX_COLOR,
  THEME_COLOR_MODES,
  THEME_FONTS,
  THEME_FONT_IDS,
  THEME_FONT_SIZE,
  THEME_RADIUS,
  toAppearance,
  type Appearance,
  type ThemeFont
} from '@astir/validation'
import { apiErrorMessage, apiRequest } from '~/composables/useApi'
import { contrastRatio, googleFontsHref, themeVariables } from '~/lib/theme'

/**
 * Настройки → Оформление: font, text size, corner radius, the primary and
 * signal colours and the colour mode, for everyone at once.
 *
 * Edits go to a draft that only the preview box shows; saving stores them and
 * puts them into the brand state, which useAppearanceHead() turns into the
 * document's style — so the whole interface changes the moment the save lands,
 * and everybody else gets it on their next page load.
 */

const props = defineProps<{ canManage: boolean }>()
const { t } = useI18n()
const brand = useBrand()

/** What the colour inputs show while the built-in colour is in use. */
const BUILT_IN_HEX = { primaryColor: '#27272a', signalColor: '#f0a43a' } as const
type ColorField = keyof typeof BUILT_IN_HEX
const COLOR_FIELDS = Object.keys(BUILT_IN_HEX) as ColorField[]

/** A few starting points for the primary colour; any other is a click away. */
const PRIMARY_PRESETS = ['#2563eb', '#4f46e5', '#7c3aed', '#0d9488', '#16a34a', '#ea580c', '#e11d48']

const draft = reactive<Appearance>({ ...brand.value.appearance })
/* The hex text boxes keep what is being typed, even while it is not a colour yet. */
const hexText = reactive<Record<ColorField, string>>({
  primaryColor: draft.primaryColor ?? '',
  signalColor: draft.signalColor ?? ''
})

function load(appearance: Appearance) {
  Object.assign(draft, appearance)
  hexText.primaryColor = appearance.primaryColor ?? ''
  hexText.signalColor = appearance.signalColor ?? ''
}

const dirty = computed(() => (Object.keys(draft) as (keyof Appearance)[])
  .some(key => draft[key] !== brand.value.appearance[key]))
const isDefault = computed(() => (Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[])
  .every(key => brand.value.appearance[key] === DEFAULT_APPEARANCE[key]))

/* Every face on offer, so each option in the list is drawn in its own font. Only on this tab. */
useHead({
  link: computed(() => {
    const href = googleFontsHref(THEME_FONT_IDS)
    return href ? [{ rel: 'stylesheet', href, key: 'astir-font-catalogue' }] : []
  })
})

function fontLabel(font: ThemeFont) {
  return font === 'system' ? t('team.settings.appearance.fontSystem') : THEME_FONTS[font].label
}

function setColor(field: ColorField, value: string | null) {
  draft[field] = value ? value.toLowerCase() : null
  hexText[field] = draft[field] ?? ''
}

function typeHex(field: ColorField, value: string) {
  const typed = value.trim()
  hexText[field] = typed
  if (typed === '') draft[field] = null
  else {
    const withHash = typed.startsWith('#') ? typed : '#' + typed
    if (HEX_COLOR.test(withHash)) draft[field] = withHash.toLowerCase()
  }
}

const hexInvalid = (field: ColorField) => hexText[field] !== '' && !HEX_COLOR.test(hexText[field].startsWith('#') ? hexText[field] : '#' + hexText[field])

/* A brand colour too close to white disappears as a button, a tab marker or a focus ring. */
const primaryLowContrast = computed(() => Boolean(draft.primaryColor) && contrastRatio(draft.primaryColor!, '#ffffff') < 2)

/* -------------------------------------------------------------- preview */

/** Whether the preview is drawn dark; «system» follows this device, as it will for everyone. */
const prefersDark = ref(false)
onMounted(() => {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  prefersDark.value = query.matches
  const update = (event: MediaQueryListEvent) => { prefersDark.value = event.matches }
  query.addEventListener('change', update)
  onBeforeUnmount(() => query.removeEventListener('change', update))
})
const previewDark = computed(() => draft.colorMode === 'dark' || (draft.colorMode === 'system' && prefersDark.value))

/*
 * The preview box gets the draft as inline variables. Tailwind sizes are rem,
 * fixed to the page's root, so the box is laid out in em and its font size
 * stands in for the root size the save would set.
 */
const previewStyle = computed(() => {
  // The .light / .dark class on the box restores the built-in colours, so a
  // colour set back to built-in shows as such even while the page still wears
  // the saved one. Radius, font and size are set outright for the same reason.
  return {
    ...themeVariables(draft),
    '--radius': draft.radius / 16 + 'rem',
    fontFamily: THEME_FONTS[draft.font].stack,
    fontSize: draft.fontSize + 'px'
  }
})

/* ---------------------------------------------------------------- saving */

const saving = ref(false)
const error = ref('')
const notice = ref('')

interface SavedSettings {
  themeFont: string
  themeFontSize: number
  themeRadius: number
  themePrimary: string | null
  themeSignal: string | null
  themeColorMode: string
}

async function store(appearance: Appearance, doneMessage: string) {
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const response = await apiRequest<{ data: SavedSettings }>('/api/settings', {
      method: 'PATCH',
      body: {
        themeFont: appearance.font,
        themeFontSize: appearance.fontSize,
        themeRadius: appearance.radius,
        themePrimary: appearance.primaryColor,
        themeSignal: appearance.signalColor,
        themeColorMode: appearance.colorMode
      }
    })
    const saved = toAppearance(response.data)
    // The whole interface follows at once: useAppearanceHead() reads this.
    brand.value = { ...brand.value, appearance: saved }
    load(saved)
    notice.value = doneMessage
  } catch (err) {
    error.value = apiErrorMessage(err, t('team.settings.appearance.saveFailed'))
  } finally {
    saving.value = false
  }
}

const save = () => store({ ...draft }, t('team.settings.appearance.saved'))
const resetToDefaults = () => store({ ...DEFAULT_APPEARANCE }, t('team.settings.appearance.resetDone'))
const discard = () => load(brand.value.appearance)

const sectionClass = 'rounded-xl border bg-card p-5'
const hexInputClass = 'h-9 w-28 rounded-md border bg-background px-2.5 font-mono text-sm uppercase outline-none placeholder:font-sans placeholder:normal-case focus:border-ring disabled:opacity-60'
</script>

<template>
  <section class="space-y-4">
    <p class="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
      {{ t('team.settings.appearance.intro') }}
    </p>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
    >
      {{ error }}
    </p>
    <p
      v-else-if="notice"
      role="status"
      class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm"
    >
      {{ notice }}
    </p>

    <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div class="space-y-4">
        <!-- font -->
        <fieldset :class="sectionClass" class="relative" :disabled="!props.canManage">
          <legend class="sr-only">{{ t('team.settings.appearance.font') }}</legend>
          <p class="text-sm font-medium" aria-hidden="true">{{ t('team.settings.appearance.font') }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('team.settings.appearance.fontHint') }}</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <label
              v-for="font in THEME_FONT_IDS"
              :key="font"
              class="relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default"
              :class="draft.font === font ? 'border-primary bg-primary/5' : 'hover:bg-secondary/60'"
            >
              <!-- relative on the label keeps the hidden radio inside it, so focusing it never scrolls the page. -->
              <input v-model="draft.font" type="radio" name="appearance-font" :value="font" class="sr-only">
              <span
                class="grid size-4 shrink-0 place-items-center rounded-full border"
                :class="draft.font === font ? 'border-primary' : ''"
                aria-hidden="true"
              >
                <span v-if="draft.font === font" class="size-2 rounded-full bg-primary" />
              </span>
              <span class="min-w-0" :style="{ fontFamily: THEME_FONTS[font].stack }">
                <span class="block truncate text-sm font-medium">{{ fontLabel(font) }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ t('team.settings.appearance.fontSample') }}</span>
              </span>
            </label>
          </div>
        </fieldset>

        <!-- size and radius -->
        <div class="grid gap-4 sm:grid-cols-2" :class="sectionClass">
          <label class="block">
            <span class="flex items-baseline justify-between gap-2 text-sm font-medium">
              {{ t('team.settings.appearance.fontSize') }}
              <span class="tabular-nums text-muted-foreground">{{ t('team.settings.appearance.px', { size: draft.fontSize }) }}</span>
            </span>
            <input
              v-model.number="draft.fontSize"
              type="range"
              :min="THEME_FONT_SIZE.min"
              :max="THEME_FONT_SIZE.max"
              step="1"
              :disabled="!props.canManage"
              class="mt-3 w-full accent-primary"
            >
            <span class="mt-1 block text-xs text-muted-foreground">
              {{ t('team.settings.appearance.fontSizeHint', { size: DEFAULT_APPEARANCE.fontSize }) }}
            </span>
          </label>
          <label class="block">
            <span class="flex items-baseline justify-between gap-2 text-sm font-medium">
              {{ t('team.settings.appearance.radius') }}
              <span class="tabular-nums text-muted-foreground">{{ t('team.settings.appearance.px', { size: draft.radius }) }}</span>
            </span>
            <input
              v-model.number="draft.radius"
              type="range"
              :min="THEME_RADIUS.min"
              :max="THEME_RADIUS.max"
              step="1"
              :disabled="!props.canManage"
              class="mt-3 w-full accent-primary"
            >
            <span class="mt-1 block text-xs text-muted-foreground">
              {{ t('team.settings.appearance.radiusHint', { size: DEFAULT_APPEARANCE.radius }) }}
            </span>
          </label>
        </div>

        <!-- colours -->
        <div :class="sectionClass" class="space-y-5">
          <div v-for="field in COLOR_FIELDS" :key="field">
            <p :id="'appearance-' + field" class="text-sm font-medium">{{ t('team.settings.appearance.' + field) }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ t('team.settings.appearance.' + field + 'Hint') }}</p>
            <div class="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                type="color"
                :value="draft[field] ?? BUILT_IN_HEX[field]"
                :disabled="!props.canManage"
                :aria-labelledby="'appearance-' + field"
                class="h-9 w-12 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-default disabled:opacity-60"
                @input="setColor(field, ($event.target as HTMLInputElement).value)"
              >
              <input
                :value="hexText[field]"
                :disabled="!props.canManage"
                :placeholder="t('team.settings.appearance.builtIn')"
                :aria-label="t('team.settings.appearance.hexAria', { name: t('team.settings.appearance.' + field) })"
                :aria-invalid="hexInvalid(field) || undefined"
                maxlength="7"
                spellcheck="false"
                :class="[hexInputClass, hexInvalid(field) ? 'border-destructive' : '']"
                @input="typeHex(field, ($event.target as HTMLInputElement).value)"
              >
              <button
                v-if="props.canManage && draft[field]"
                type="button"
                class="h-9 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                @click="setColor(field, null)"
              >
                {{ t('team.settings.appearance.useBuiltIn') }}
              </button>
              <template v-if="field === 'primaryColor' && props.canManage">
                <span class="mx-1 h-6 w-px bg-border" aria-hidden="true" />
                <button
                  v-for="preset in PRIMARY_PRESETS"
                  :key="preset"
                  type="button"
                  class="size-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  :class="draft.primaryColor === preset ? 'border-foreground' : 'border-transparent'"
                  :style="{ backgroundColor: preset }"
                  :aria-label="t('team.settings.appearance.preset', { color: preset })"
                  :aria-pressed="draft.primaryColor === preset"
                  @click="setColor('primaryColor', preset)"
                />
              </template>
            </div>
            <p v-if="hexInvalid(field)" class="mt-1.5 text-xs text-destructive">{{ t('team.settings.appearance.hexInvalid') }}</p>
            <p v-else-if="field === 'primaryColor' && primaryLowContrast" class="mt-1.5 text-xs text-signal-foreground dark:text-signal">
              {{ t('team.settings.appearance.lowContrast') }}
            </p>
          </div>
        </div>

        <!-- colour mode -->
        <fieldset :class="sectionClass" class="relative" :disabled="!props.canManage">
          <legend class="sr-only">{{ t('team.settings.appearance.colorMode') }}</legend>
          <p class="text-sm font-medium" aria-hidden="true">{{ t('team.settings.appearance.colorMode') }}</p>
          <div class="mt-2.5 inline-flex rounded-lg border bg-background p-1">
            <label
              v-for="mode in THEME_COLOR_MODES"
              :key="mode"
              class="relative cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              :class="draft.colorMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
            >
              <input v-model="draft.colorMode" type="radio" name="appearance-mode" :value="mode" class="sr-only">
              {{ t('team.settings.appearance.modes.' + mode) }}
            </label>
          </div>
          <p class="mt-1.5 text-xs text-muted-foreground">{{ t('team.settings.appearance.colorModeHint') }}</p>
        </fieldset>
      </div>

      <!-- live preview -->
      <aside class="space-y-2 lg:sticky lg:top-4">
        <p class="text-sm font-medium">{{ t('team.settings.appearance.preview') }}</p>
        <div
          :class="previewDark ? 'dark' : 'light'"
          :style="previewStyle"
          class="overflow-hidden rounded-xl border bg-background p-[1em] text-foreground"
          aria-hidden="true"
        >
          <div class="rounded-[var(--radius)] border bg-card p-[1em] text-card-foreground">
            <div class="flex items-start justify-between gap-[0.75em]">
              <div class="min-w-0">
                <p class="text-[1em] font-semibold leading-tight">{{ t('team.settings.appearance.sample.title') }}</p>
                <p class="mt-[0.25em] text-[0.8125em] text-muted-foreground">{{ t('team.settings.appearance.sample.text') }}</p>
              </div>
              <span class="shrink-0 rounded-[calc(var(--radius)-4px)] bg-signal px-[0.5em] py-[0.125em] text-[0.75em] font-medium text-signal-foreground">
                {{ t('team.settings.appearance.sample.badge') }}
              </span>
            </div>
            <div class="mt-[0.75em] flex h-[2.25em] items-center rounded-[calc(var(--radius)-2px)] border border-ring bg-background px-[0.625em] text-[0.875em] text-muted-foreground ring-[0.1875em] ring-ring/30">
              {{ t('team.settings.appearance.sample.input') }}
            </div>
            <div class="mt-[0.75em] flex flex-wrap gap-[0.5em]">
              <span class="inline-flex h-[2.25em] items-center rounded-[calc(var(--radius)-2px)] bg-primary px-[1em] text-[0.875em] font-medium text-primary-foreground">
                {{ t('team.settings.appearance.sample.primary') }}
              </span>
              <span class="inline-flex h-[2.25em] items-center rounded-[calc(var(--radius)-2px)] border bg-background px-[1em] text-[0.875em]">
                {{ t('team.settings.appearance.sample.secondary') }}
              </span>
            </div>
          </div>

          <div class="mt-[0.75em] overflow-hidden rounded-[var(--radius)] border bg-card">
            <table class="w-full text-[0.8125em]">
              <thead class="border-b bg-muted/30 text-left text-[0.9em] text-muted-foreground">
                <tr>
                  <th class="px-[0.875em] py-[0.5em] font-medium">{{ t('team.settings.appearance.sample.task') }}</th>
                  <th class="px-[0.875em] py-[0.5em] font-medium">{{ t('team.settings.appearance.sample.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b">
                  <td class="px-[0.875em] py-[0.625em]">{{ t('team.settings.appearance.sample.rowOne') }}</td>
                  <td class="px-[0.875em] py-[0.625em]">
                    <span class="rounded-[calc(var(--radius)-4px)] bg-primary/15 px-[0.5em] py-[0.125em] font-medium">{{ t('team.settings.appearance.sample.inProgress') }}</span>
                  </td>
                </tr>
                <tr>
                  <td class="px-[0.875em] py-[0.625em]">{{ t('team.settings.appearance.sample.rowTwo') }}</td>
                  <td class="px-[0.875em] py-[0.625em]">
                    <span class="rounded-[calc(var(--radius)-4px)] bg-signal/25 px-[0.5em] py-[0.125em] font-medium">{{ t('team.settings.appearance.sample.atRisk') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">{{ t('team.settings.appearance.previewHint') }}</p>
      </aside>
    </div>

    <div v-if="props.canManage" class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        :disabled="saving || !dirty"
        @click="save()"
      >
        {{ saving ? t('common.actions.saving') : t('common.actions.save') }}
      </button>
      <button
        v-if="dirty"
        type="button"
        class="h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        :disabled="saving"
        @click="discard()"
      >
        {{ t('team.settings.appearance.discard') }}
      </button>
      <button
        type="button"
        class="h-9 rounded-md border px-4 text-sm hover:bg-secondary disabled:opacity-50 sm:ml-auto"
        :disabled="saving || (isDefault && !dirty)"
        @click="resetToDefaults()"
      >
        {{ t('team.settings.appearance.reset') }}
      </button>
    </div>
  </section>
</template>

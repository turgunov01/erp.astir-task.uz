import type { Ref } from 'vue'

/**
 * Keeps the chosen tab of a sideways-scrolling strip in view.
 *
 * On a phone the strip is wider than the screen, and a tab picked from the
 * URL may start off the right edge. Marking the active button with
 * aria-current="page" is what the strip looks for; scrolling only along the
 * strip's own axis keeps the page itself from jumping.
 */
export function useTabStrip(active: Readonly<Ref<string>>) {
  const strip = ref<HTMLElement | null>(null)

  function reveal() {
    strip.value
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }

  // A page with an async child mounts after its own setup has long finished,
  // so the first reveal waits for the mount rather than the next tick.
  onMounted(reveal)
  watch(active, () => nextTick(reveal))

  return strip
}

<script setup lang="ts">
import type { Locale } from '@astir/types'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '~/components/ui/dropdown-menu'

/**
 * «Язык» inside the avatar menu: the four languages, each named in itself,
 * the current one ticked. Choosing one switches the interface at once and
 * saves it to the account.
 *
 * A submenu where there is a pointer to aim with; on a phone the same four
 * entries sit directly in the menu under a «Язык» heading, because a flyout
 * beside a menu that already fills the screen is hard to hit with a thumb.
 * The menu renders only when opened, so the width check never meets SSR.
 */
const { t } = useI18n()
const { options, current, choose } = useAppLocale()
const wide = useMediaQuery('(min-width: 640px)')

async function pick(code: Locale) {
  if (code !== current.value) await choose(code)
}
</script>

<template>
  <DropdownMenuSub v-if="wide">
    <DropdownMenuSubTrigger>
      <Icon name="lucide:languages" class="size-4" />
      <span class="flex-1">{{ t('shell.userMenu.language') }}</span>
      <span class="text-xs uppercase text-muted-foreground">{{ current }}</span>
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent class="min-w-44" :collision-padding="8">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.code"
        :lang="option.code"
        :aria-current="option.code === current ? 'true' : undefined"
        @select="pick(option.code)"
      >
        <span class="flex-1">{{ option.name }}</span>
        <Icon v-if="option.code === current" name="lucide:check" class="size-4 text-foreground" />
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  </DropdownMenuSub>

  <DropdownMenuGroup v-else>
    <DropdownMenuLabel class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <Icon name="lucide:languages" class="size-3.5" />
      {{ t('shell.userMenu.language') }}
    </DropdownMenuLabel>
    <DropdownMenuItem
      v-for="option in options"
      :key="option.code"
      :lang="option.code"
      class="pl-7"
      :aria-current="option.code === current ? 'true' : undefined"
      @select="pick(option.code)"
    >
      <span class="flex-1">{{ option.name }}</span>
      <Icon v-if="option.code === current" name="lucide:check" class="size-4 text-foreground" />
    </DropdownMenuItem>
  </DropdownMenuGroup>
</template>

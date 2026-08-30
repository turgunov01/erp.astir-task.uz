
import type { DefineComponent, SlotsType } from 'vue'
type IslandComponent<T> = DefineComponent<{}, {refresh: () => Promise<void>}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, SlotsType<{ fallback: { error: unknown } }>> & T

type HydrationStrategies = {
  hydrateOnVisible?: IntersectionObserverInit | true
  hydrateOnIdle?: number | true
  hydrateOnInteraction?: keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap> | true
  hydrateOnMediaQuery?: string
  hydrateAfter?: number
  hydrateWhen?: boolean
  hydrateNever?: true
}
type LazyComponent<T> = DefineComponent<HydrationStrategies, {}, {}, {}, {}, {}, {}, { hydrated: () => void }> & T

interface _GlobalComponents {
  DataTable: typeof import("../../app/components/DataTable.vue")['default']
  ProgressBar: typeof import("../../app/components/ProgressBar.vue")['default']
  StatusBadge: typeof import("../../app/components/StatusBadge.vue")['default']
  NuxtWelcome: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/welcome.vue")['default']
  NuxtLayout: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-layout")['default']
  NuxtErrorBoundary: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']
  ClientOnly: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/client-only")['default']
  DevOnly: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/dev-only")['default']
  ServerPlaceholder: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/server-placeholder")['default']
  NuxtLink: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-link")['default']
  NuxtLoadingIndicator: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']
  NuxtTime: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']
  NuxtRouteAnnouncer: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']
  NuxtAnnouncer: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-announcer")['default']
  NuxtImg: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']
  NuxtPicture: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']
  Avatar: typeof import("../../app/components/ui/avatar/index")['Avatar']
  AvatarFallback: typeof import("../../app/components/ui/avatar/index")['AvatarFallback']
  AvatarImage: typeof import("../../app/components/ui/avatar/index")['AvatarImage']
  Card: typeof import("../../app/components/ui/card/index")['Card']
  CardAction: typeof import("../../app/components/ui/card/index")['CardAction']
  CardContent: typeof import("../../app/components/ui/card/index")['CardContent']
  CardDescription: typeof import("../../app/components/ui/card/index")['CardDescription']
  CardFooter: typeof import("../../app/components/ui/card/index")['CardFooter']
  CardHeader: typeof import("../../app/components/ui/card/index")['CardHeader']
  CardTitle: typeof import("../../app/components/ui/card/index")['CardTitle']
  DropdownMenu: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenu']
  DropdownMenuCheckboxItem: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuCheckboxItem']
  DropdownMenuContent: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuContent']
  DropdownMenuGroup: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuGroup']
  DropdownMenuItem: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuItem']
  DropdownMenuLabel: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuLabel']
  DropdownMenuRadioGroup: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuRadioGroup']
  DropdownMenuRadioItem: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuRadioItem']
  DropdownMenuSeparator: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSeparator']
  DropdownMenuShortcut: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuShortcut']
  DropdownMenuSub: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSub']
  DropdownMenuSubContent: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSubContent']
  DropdownMenuSubTrigger: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSubTrigger']
  DropdownMenuTrigger: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuTrigger']
  DropdownMenuPortal: typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuPortal']
  Button: typeof import("../../app/components/ui/button/index")['Button']
  Input: typeof import("../../app/components/ui/input/index")['Input']
  Label: typeof import("../../app/components/ui/label/index")['Label']
  Separator: typeof import("../../app/components/ui/separator/index")['Separator']
  Icon: typeof import("../../../../node_modules/.pnpm/@nuxt+icon@2.5.1_magic-string@1.2.3_magicast@0.5.4_rolldown@1.2.6_unplugin@3.3.0_esbuild@0.28_6bormuboxlds5smqtgzecwyrhi/node_modules/@nuxt/icon/dist/runtime/components/index")['default']
  NuxtPage: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/pages/runtime/page")['default']
  NoScript: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['NoScript']
  Link: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Link']
  Base: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Base']
  Title: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Title']
  Meta: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Meta']
  Style: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Style']
  Head: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Head']
  Html: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Html']
  Body: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Body']
  NuxtIsland: typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-island")['default']
  LazyDataTable: LazyComponent<typeof import("../../app/components/DataTable.vue")['default']>
  LazyProgressBar: LazyComponent<typeof import("../../app/components/ProgressBar.vue")['default']>
  LazyStatusBadge: LazyComponent<typeof import("../../app/components/StatusBadge.vue")['default']>
  LazyNuxtWelcome: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/welcome.vue")['default']>
  LazyNuxtLayout: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-layout")['default']>
  LazyNuxtErrorBoundary: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-error-boundary.vue")['default']>
  LazyClientOnly: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/client-only")['default']>
  LazyDevOnly: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/dev-only")['default']>
  LazyServerPlaceholder: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/server-placeholder")['default']>
  LazyNuxtLink: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-link")['default']>
  LazyNuxtLoadingIndicator: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-loading-indicator")['default']>
  LazyNuxtTime: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-time.vue")['default']>
  LazyNuxtRouteAnnouncer: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-route-announcer")['default']>
  LazyNuxtAnnouncer: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-announcer")['default']>
  LazyNuxtImg: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtImg']>
  LazyNuxtPicture: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-stubs")['NuxtPicture']>
  LazyAvatar: LazyComponent<typeof import("../../app/components/ui/avatar/index")['Avatar']>
  LazyAvatarFallback: LazyComponent<typeof import("../../app/components/ui/avatar/index")['AvatarFallback']>
  LazyAvatarImage: LazyComponent<typeof import("../../app/components/ui/avatar/index")['AvatarImage']>
  LazyCard: LazyComponent<typeof import("../../app/components/ui/card/index")['Card']>
  LazyCardAction: LazyComponent<typeof import("../../app/components/ui/card/index")['CardAction']>
  LazyCardContent: LazyComponent<typeof import("../../app/components/ui/card/index")['CardContent']>
  LazyCardDescription: LazyComponent<typeof import("../../app/components/ui/card/index")['CardDescription']>
  LazyCardFooter: LazyComponent<typeof import("../../app/components/ui/card/index")['CardFooter']>
  LazyCardHeader: LazyComponent<typeof import("../../app/components/ui/card/index")['CardHeader']>
  LazyCardTitle: LazyComponent<typeof import("../../app/components/ui/card/index")['CardTitle']>
  LazyDropdownMenu: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenu']>
  LazyDropdownMenuCheckboxItem: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuCheckboxItem']>
  LazyDropdownMenuContent: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuContent']>
  LazyDropdownMenuGroup: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuGroup']>
  LazyDropdownMenuItem: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuItem']>
  LazyDropdownMenuLabel: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuLabel']>
  LazyDropdownMenuRadioGroup: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuRadioGroup']>
  LazyDropdownMenuRadioItem: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuRadioItem']>
  LazyDropdownMenuSeparator: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSeparator']>
  LazyDropdownMenuShortcut: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuShortcut']>
  LazyDropdownMenuSub: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSub']>
  LazyDropdownMenuSubContent: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSubContent']>
  LazyDropdownMenuSubTrigger: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuSubTrigger']>
  LazyDropdownMenuTrigger: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuTrigger']>
  LazyDropdownMenuPortal: LazyComponent<typeof import("../../app/components/ui/dropdown-menu/index")['DropdownMenuPortal']>
  LazyButton: LazyComponent<typeof import("../../app/components/ui/button/index")['Button']>
  LazyInput: LazyComponent<typeof import("../../app/components/ui/input/index")['Input']>
  LazyLabel: LazyComponent<typeof import("../../app/components/ui/label/index")['Label']>
  LazySeparator: LazyComponent<typeof import("../../app/components/ui/separator/index")['Separator']>
  LazyIcon: LazyComponent<typeof import("../../../../node_modules/.pnpm/@nuxt+icon@2.5.1_magic-string@1.2.3_magicast@0.5.4_rolldown@1.2.6_unplugin@3.3.0_esbuild@0.28_6bormuboxlds5smqtgzecwyrhi/node_modules/@nuxt/icon/dist/runtime/components/index")['default']>
  LazyNuxtPage: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/pages/runtime/page")['default']>
  LazyNoScript: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['NoScript']>
  LazyLink: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Link']>
  LazyBase: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Base']>
  LazyTitle: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Title']>
  LazyMeta: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Meta']>
  LazyStyle: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Style']>
  LazyHead: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Head']>
  LazyHtml: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Html']>
  LazyBody: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/head/runtime/components")['Body']>
  LazyNuxtIsland: LazyComponent<typeof import("../../../../node_modules/.pnpm/nuxt@4.5.2_@babel+plugin-syntax-jsx@7.29.7_@babel+core@7.29.7__@babel+plugin-syntax-typescrip_7egrjuranef5r4yvh4yql7zrle/node_modules/nuxt/dist/app/components/nuxt-island")['default']>
}

declare module 'vue' {
  export interface GlobalComponents extends _GlobalComponents { }
}

export {}

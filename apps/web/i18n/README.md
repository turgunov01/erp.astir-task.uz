# Interface languages

Four languages: **ru** (Russian — the source, written first), **uz** (Uzbek, Latin
script), **en** (English), **tr** (Turkish). Built on `@nuxtjs/i18n` 10 with
`strategy: 'no_prefix'`: the language is a person's preference, never part of a URL.

## Which language is shown

Decided on the server for every page load by `app/plugins/locale.ts`, then sent to
the client in the payload (no hydration mismatch):

1. the signed-in user's own choice — `User.locale` (Profile, or the avatar menu → «Язык»);
2. the `astir_locale` cookie — chosen on the sign-in page, or the last personal choice
   in this browser;
3. the studio default — `StudioSettings.defaultLocale` (Settings → Студия → «Язык по умолчанию»);
4. Russian.

The browser's own language is deliberately ignored. Switching is instant
(`useAppLocale().choose(code)`): messages load lazily per language, labels re-render,
`refreshNuxtData()` re-fetches what the API worded. `<html lang>` follows.

The API answers in the same language: it reads the user's `locale`, then the cookie,
then `Accept-Language` (the client sends the current language on every `$fetch`),
then the studio default. Letters and CSV exports use the **recipient's** language
(`user.locale ?? studio default`). Server side: `apps/api/src/i18n`.

## Files and ownership

```
apps/web/i18n/locales/<lang>/<namespace>.json   web (this folder)
apps/api/src/i18n/locales/<lang>/<namespace>.ts  API (same namespaces, no shell)
```

| namespace    | covers |
|--------------|--------|
| `common`     | buttons, generic words, errors, units, plurals, **all enum labels** (`common.enum.*`), permissions |
| `shell`      | layout, navigation, header, search, bell, check-in, user menu, error page |
| `auth`       | login, first-login code, password recovery |
| `production` | episodes, scenes, shots, tasks, my tasks, board, calendar, pipeline/stages, reviews, revisions, render, assets |
| `projects`   | projects, clients, documents, files, media viewer, timeline, dashboard |
| `finance`    | finance, budgets, expenses, payments, invoices, payroll, reports |
| `team`       | team, employees, departments, attendance, timesheets, activity, notifications, profile, settings, roles |

Each JSON file has exactly one top-level key, its namespace: `ru/finance.json` is
`{ "finance": { … } }`. Only edit your own namespace; `common` is shared — add to it
only for words used across areas, and keep additions in all four languages.

## Keys

`namespace.area.key`, camelCase, describing the place, not the words:
`finance.expenses.addButton`, `production.tasks.empty`, `team.settings.tabs.mail`.
Reuse `common.actions.*` (save, cancel, delete, retry…) and `common.states.*`
rather than duplicating them.

## Messages

vue-i18n syntax.

* **Interpolation**: `"Сохранено в {time}"` → `t('x.saved', { time })`.
* **Plurals**: forms separated by ` | `, picked by the count. Russian has three
  (one | few | many): `"{n} задача | {n} задачи | {n} задач"`; English two
  (`"{n} task | {n} tasks"`); Uzbek and Turkish nouns do not change after a number,
  so write one form (`"{n} ta vazifa"`, `"{n} görev"`). Call `t(key, count)` —
  `{n}` and `{count}` are filled in. Rules: `i18n/i18n.config.ts`.
* **Markup inside a sentence**: `<i18n-t keypath="auth.code.sentTo" tag="p" scope="global">`
  with a named slot (`<template #email>…</template>`) — never split a sentence into pieces.
* **Special characters** `{ } @ $ |` are syntax; write a literal one as `{'@'}`.
* **Uzbek** apostrophes: `o‘` and `g‘` always with **‘ (U+2018)**, the tutuq
  belgisi with **’ (U+2019)** (`ma’lumot`). Never ASCII `'` — the checker fails on it.
* **Turkish**: real letters `ç ğ ı İ ö ş ü`; mind `i/İ` vs `ı/I`.
* **Russian**: the existing wording is the source of truth — move it verbatim.

## Enums

Enum words live in `common.enum.<enumName>.<VALUE>` and are read through
`app/utils/labels.ts`, whose exports keep their old names and shape:
`TASK_STATUS_LABEL`, `labelOf(map, value)`, `enumLabel(map, value)`,
`enumOptions(map)`, `STATUS_LABEL`, `NOTIFICATION_TYPE_LABEL`, `PERMISSION_GROUPS`…
Each map entry is a getter that reads the current language, so existing call sites
already render translated. A new member: add the key in `labels.ts` and the words
in all four `common.json`.

## Dates, numbers, money

Always through the current language's Intl tag — `intlTag()` from `app/utils/i18n.ts`:
`ru-RU`, `uz-Latn-UZ`, `en-GB` (day-month, 24 h), `tr-TR`. Shared helpers already do:
`formatDay`, `formatDateTime`, `formatMoney`, `timeAgo` (labels.ts), `formatBytes`
(media.ts), `formatMinutes`, `shortDate`, `studioClock`, `weekdaysLabel`
(attendance.ts), `shortMonth` (finance-period.ts), `shortDay`, `tasksWord`
(timeline.ts). Never hard-code `'ru-RU'` or `toLocaleDateString()` without a tag.

## Code outside components

`translate(key, named?, plural?)`, `currentLocale()`, `intlTag()`, `hasMessage(key)`
(auto-imported from `app/utils/i18n.ts`) for composables, utils, stores and plugins.
In components use `const { t } = useI18n()` in script and `t(…)`/`$t(…)` in templates.

## API messages

```ts
import { t } from '../../i18n'
throw badRequest(t('finance.payments.feeTooLarge'))
throw conflict(t('projects.codeTaken', { code }))
z.string().min(1, { error: () => t('production.tasks.titleRequired') })  // worded at parse time
```

Russian goes into `apps/api/src/i18n/locales/ru/<namespace>.ts`; uz/en/tr files are
`satisfies Messages<typeof ru>`, so a missing key fails `pnpm --filter @astir/api typecheck`.
Keys are typed (`MessageKey`). Shared schemas in `packages/validation` cannot import
`t`: they write `'i18n:common.validation.x'` and the error middleware words it.
Use `badRequest` for anything the user must read — the web shows every `FORBIDDEN`
as its own «Недостаточно прав» sentence. Notifications take
`title: t => t('team.notifications.x', params)` and are worded in the recipient's language.

## Converting a file — checklist

1. `node scripts/check-i18n.mjs --area <area> --files` — the lines left in your area.
2. Script: `const { t } = useI18n()`; templates: `t('…')`; attributes `:placeholder="t('…')"`,
   `:aria-label`, `:title`, `alt`.
3. Page title: `useHead({ title: computed(() => t('area.page.title')) })`.
4. Fallbacks of `apiErrorMessage(err, t('…'))` — the server message is shown when there is one.
5. Plurals → one plural message; `countLabel(n, 'one', 'few', 'many')` → `countLabel(n, 'ns.key')`.
6. Dates/numbers → the helpers above or `intlTag()`.
7. Add the keys to **all four** `<lang>/<namespace>.json` (Russian verbatim).
8. `pnpm check:i18n` (no catalogue problems, your area at 0), `pnpm --filter @astir/web typecheck`,
   `node scripts/check-encoding.mjs`, then look at the page in all four languages,
   at phone width, light and dark.

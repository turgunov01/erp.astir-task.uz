#!/usr/bin/env node
// Translation health check for the web app and the API.
//
//   node scripts/check-i18n.mjs                  full report, exit 0 unless catalogues are broken
//   node scripts/check-i18n.mjs --strict         also fail while hard-coded text remains
//   node scripts/check-i18n.mjs --area finance   only the files of one area (see AREAS)
//   node scripts/check-i18n.mjs --files          list every remaining line, not just counts
//
// What it checks:
//   a) catalogues: every key of ru exists in uz/en/tr and back, per namespace,
//      with no empty values (web JSON); Uzbek uses ‘ (U+2018) in o‘ / g‘, never '
//      (API catalogues are checked by the API typecheck: `satisfies Messages<…>`);
//   b) usage: every static t('…') / $t('…') / translate('…') / keypath="…" key in
//      apps/web/app exists in ru (dynamic keys like t('shell.nav.' + key) are skipped);
//   c) leftovers: hard-coded Cyrillic in .vue templates/attributes and in strings
//      of apps/web/app/**/*.ts and apps/api/src/** (comments, logger calls and
//      locale files excluded), and obvious English UI words in .vue templates —
//      per file, grouped by the Phase 2 area that owns the file.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const WEB_APP = join(ROOT, 'apps/web/app')
const WEB_LOCALES = join(ROOT, 'apps/web/i18n/locales')
const API_SRC = join(ROOT, 'apps/api/src')
const LANGS = ['ru', 'uz', 'en', 'tr']

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const listLines = args.includes('--files')
const areaFilter = args.includes('--area') ? args[args.indexOf('--area') + 1] : null

/**
 * The compiler vue-i18n itself uses, resolved through the web app's
 * dependencies; without it the compile check is skipped with a warning.
 */
function loadMessageCompiler() {
  const fromWeb = createRequire(join(ROOT, 'apps/web/package.json'))
  // pnpm keeps it several dependencies deep: @nuxtjs/i18n → vue-i18n → @intlify/core-base → here.
  const chains = [
    ['@intlify/message-compiler'],
    ['@nuxtjs/i18n', 'vue-i18n', '@intlify/message-compiler'],
    ['@nuxtjs/i18n', 'vue-i18n', '@intlify/core-base', '@intlify/message-compiler']
  ]
  for (const chain of chains) {
    try {
      let from = fromWeb
      for (const step of chain.slice(0, -1)) from = createRequire(from.resolve(step))
      const target = from(chain[chain.length - 1])
      if (typeof target.baseCompile === 'function') return target
    } catch {
      // try the next way in
    }
  }
  console.warn('check-i18n: @intlify/message-compiler not found, message compile check skipped')
  return null
}

/* ------------------------------------------------------------- ownership */

/**
 * Which Phase 2 area owns a file. First match wins; `shell` is Phase 1 and is
 * expected to be at zero already. Every web file and every API file maps to
 * exactly one area, so parallel converters never edit the same file.
 */
const AREAS = [
  ['shell', [
    /^web\/app\/(app\.vue|error\.vue|layouts\/|plugins\/|middleware\/|stores\/)/,
    /^web\/app\/pages\/(login|forgot-password|index)\.vue$/,
    /^web\/app\/components\/(NotificationBell|ConfirmDialog|DataTable|ProgressBar|StatusBadge)\.vue$/,
    /^web\/app\/components\/(locale|ui)\//,
    /^web\/app\/components\/attendance\/CheckIn(Button|Prompt)\.vue$/,
    /^web\/app\/composables\/(useApi|useAppLocale|useBrand|useNavigation|useTabStrip|useMyAttendance)\.ts$/,
    /^web\/app\/utils\/(labels|i18n)\.ts$/,
    /^web\/app\/lib\//
  ]],
  ['finance', [
    /^web\/app\/pages\/(finance|reports)\//,
    /^web\/app\/components\/finance\//,
    /^web\/app\/composables\/(useFinanceQuery|useReport)\.ts$/,
    /^web\/app\/utils\/finance-period\.ts$/
  ]],
  ['team', [
    /^web\/app\/pages\/(team\/|timesheets\.vue|activity\.vue|settings\.vue|profile\.vue)/,
    /^web\/app\/components\/(attendance|settings|profile)\//,
    /^web\/app\/utils\/attendance\.ts$/
  ]],
  ['projects', [
    /^web\/app\/pages\/(projects\/|clients\.vue|documents\.vue|dashboard\.vue|timeline\.vue)/,
    /^web\/app\/components\/(project|media|timeline)\//,
    /^web\/app\/composables\/(useMediaViewer|useTimelineState|useChunkedUpload)\.ts$/,
    /^web\/app\/utils\/(media|timeline)\.ts$/
  ]],
  ['production', [
    /^web\/app\/pages\/(episodes|scenes|shots|tasks)\//,
    /^web\/app\/pages\/(calendar|reviews|revisions|render|assets)\.vue$/,
    /^web\/app\/components\/(task|review|detail|comment|entity)\//,
    /^web\/app\/composables\/(useEntityCrud|useTaskPanels|useFilterOptions)\.ts$/,
    /^web\/app\/utils\/entity-forms?\.ts$/
  ]],
  ['api-messages', [/^api\//]]
]

function areaOf(file) {
  for (const [area, rules] of AREAS) if (rules.some(rule => rule.test(file))) return area
  return 'UNASSIGNED'
}

/* ------------------------------------------------------------- utilities */

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, filter, out)
    else if (filter(path)) out.push(path)
  }
  return out
}

const rel = path => relative(join(ROOT, 'apps'), path).split(sep).join('/')

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? prefix + '.' + key : key
    if (value !== null && typeof value === 'object') flatten(value, path, out)
    else out[path] = value
  }
  return out
}

/**
 * Remove comments from JS/TS source, keeping strings (including template
 * literals) intact, so a URL in a string is not taken for a comment.
 */
function stripJsComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') { out += next ?? ''; i += 2; continue }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue }
    if (ch === '/' && next === '/') { while (i < source.length && source[i] !== '\n') i++; continue }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const block = source.slice(i, end === -1 ? source.length : end + 2)
      out += block.replace(/[^\n]/g, ' ')
      i += block.length
      continue
    }
    out += ch
    i++
  }
  return out
}

const CYRILLIC = /[А-Яа-яЁё]/

/* --------------------------------------------- a) catalogue consistency */

const problems = []

const namespaces = readdirSync(join(WEB_LOCALES, 'ru')).filter(f => f.endsWith('.json'))
const catalog = {}
for (const lang of LANGS) {
  catalog[lang] = {}
  for (const file of namespaces) {
    const path = join(WEB_LOCALES, lang, file)
    let json
    try {
      json = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      problems.push(`web ${lang}/${file}: cannot read (${err.message})`)
      continue
    }
    const name = file.replace(/\.json$/, '')
    if (Object.keys(json).join() !== name) problems.push(`web ${lang}/${file}: top-level key must be "${name}" only`)
    catalog[lang][name] = flatten(json)
  }
}

for (const file of namespaces) {
  const name = file.replace(/\.json$/, '')
  const ru = catalog.ru[name] ?? {}
  for (const lang of LANGS) {
    const own = catalog[lang][name] ?? {}
    for (const [key, value] of Object.entries(own)) {
      if (typeof value !== 'string' || value.trim() === '') problems.push(`web ${lang}: empty value ${key}`)
      if (lang !== 'ru' && !(key in ru)) problems.push(`web ${lang}: extra key ${key} (not in ru)`)
      if (lang === 'uz' && typeof value === 'string' && /[oOgG]['`]/.test(value)) {
        problems.push(`web uz: ${key} — write o‘ / g‘ with U+2018: "${value}"`)
      }
      if (lang === 'ru' && typeof value === 'string' && /\|/.test(value) && value.split(' | ').length > 3) {
        problems.push(`web ru: ${key} has more than three plural forms`)
      }
    }
    if (lang !== 'ru') {
      for (const key of Object.keys(ru)) if (!(key in own)) problems.push(`web ${lang}: missing key ${key}`)
    }
  }
}

/*
 * Every message must compile the way the build compiles it. One message with
 * markup or a broken placeholder fails its whole catalogue import in the
 * browser, and that language silently falls back to Russian after hydration.
 */
const compiler = loadMessageCompiler()
for (const lang of LANGS) {
  for (const [name, entries] of Object.entries(catalog[lang])) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue
      // The same test unplugin-vue-i18n's strictMessage applies: even «< / >» counts.
      if (/<\/?[\w\s="/.':;#-]+>/.test(value)) {
        problems.push(`web ${lang}/${name}: ${key} contains HTML, which the build rejects: "${value}"`)
        continue
      }
      if (!compiler) continue
      const errors = []
      compiler.baseCompile(value, { onError: err => errors.push(err.message) })
      if (errors.length > 0) problems.push(`web ${lang}/${name}: ${key} does not compile (${errors[0]}): "${value}"`)
    }
  }
}

// Uzbek apostrophes on the API side too (the typecheck covers the keys).
for (const path of walk(join(API_SRC, 'i18n/locales/uz'), p => p.endsWith('.ts'))) {
  const text = readFileSync(path, 'utf8')
  for (const [n, line] of text.split('\n').entries()) {
    // An ASCII apostrophe between o/g and a letter inside a quoted message.
    if (/[oOgG]`[a-z]|[A-Za-z][oOgG]'[a-z]/.test(line)) problems.push(`${rel(path)}:${n + 1}: Uzbek o‘/g‘ written with ' — use U+2018`)
  }
}

/* -------------------------------------------- b) keys used in web code */

const ruKeys = new Set(Object.values(catalog.ru).flatMap(ns => Object.keys(ns)))
// Parent paths too: t('common.enum.role') style calls on a subtree.
const ruPrefixes = new Set([...ruKeys].flatMap(key => key.split('.').map((_, i, parts) => parts.slice(0, i + 1).join('.'))))

const webFiles = walk(WEB_APP, p => p.endsWith('.vue') || p.endsWith('.ts'))
const KEY_CALL = /(?:\$t|\bt|\btranslate|\bhasMessage)\(\s*['"]([a-z][\w-]*(?:\.[\w-]+)+)['"]/g
const KEY_CALL_COUNT = /\bcountLabel\(\s*[^,()]+,\s*['"]([a-z][\w-]*(?:\.[\w-]+)+)['"]\s*\)/g
const KEYPATH = /keypath="([a-z][\w-]*(?:\.[\w-]+)+)"/g

for (const path of webFiles) {
  const text = stripJsComments(readFileSync(path, 'utf8'))
  for (const pattern of [KEY_CALL, KEY_CALL_COUNT, KEYPATH]) {
    for (const match of text.matchAll(pattern)) {
      const key = match[1]
      // A key ending in '.' is the static half of a dynamic key.
      if (key.endsWith('.')) continue
      if (!ruKeys.has(key) && !ruPrefixes.has(key)) problems.push(`${rel(path)}: key "${key}" is not in ru`)
    }
  }
}

/* ------------------------------------------------ c) hard-coded leftovers */

/** Lines of a .vue file that still carry UI text, with the reason. */
function vueLeftovers(source) {
  const hits = []
  const lines = source.split('\n')
  const scriptStart = lines.findIndex(line => /^<script/.test(line))
  const scriptEnd = lines.findIndex((line, i) => i > scriptStart && /^<\/script>/.test(line))
  const templateStart = lines.findIndex(line => /^<template/.test(line))
  const templateEnd = lines.reduce((last, line, i) => (/^<\/template>/.test(line) ? i : last), -1)

  if (scriptStart !== -1 && scriptEnd !== -1) {
    const script = stripJsComments(lines.slice(scriptStart, scriptEnd + 1).join('\n')).split('\n')
    script.forEach((line, i) => {
      if (CYRILLIC.test(line) && !/\blogger\.|console\./.test(line)) hits.push([scriptStart + i + 1, line])
    })
  }
  if (templateStart !== -1 && templateEnd !== -1) {
    const template = lines.slice(templateStart, templateEnd + 1).join('\n')
      .replace(/<!--[\s\S]*?-->/g, block => block.replace(/[^\n]/g, ' '))
      .split('\n')
    template.forEach((line, i) => {
      const lineNo = templateStart + i + 1
      if (CYRILLIC.test(line)) { hits.push([lineNo, line]); return }
      // English UI words: plain attribute values people read, and bare text nodes.
      const attr = /\s(placeholder|title|aria-label|alt|label)="([^"]*[A-Za-z]{3,}[^"]*)"/.exec(line)
      if (attr && !/^[\w.-]+$/.test(attr[2])) { hits.push([lineNo, line + '   ← English attribute']); return }
      const text = line.replace(/\{\{[\s\S]*?\}\}/g, '').replace(/<[^>]*>/g, '').trim()
      if (/^[A-Z][a-z]+(?:[ ,][A-Za-z]+)+[.!?]?$/.test(text)) hits.push([lineNo, line + '   ← English text'])
    })
  }
  return hits
}

function tsLeftovers(source) {
  const hits = []
  stripJsComments(source).split('\n').forEach((line, i) => {
    if (!CYRILLIC.test(line)) return
    if (/\blogger\.|console\./.test(line)) return
    hits.push([i + 1, line])
  })
  return hits
}

const leftovers = []
for (const path of webFiles) {
  const hits = path.endsWith('.vue') ? vueLeftovers(readFileSync(path, 'utf8')) : tsLeftovers(readFileSync(path, 'utf8'))
  if (hits.length) leftovers.push({ file: rel(path), hits })
}
const apiFiles = walk(API_SRC, p => p.endsWith('.ts') && !p.includes(join('src', 'i18n') + sep))
for (const path of apiFiles) {
  const hits = tsLeftovers(readFileSync(path, 'utf8'))
  if (hits.length) leftovers.push({ file: rel(path), hits })
}

/* ---------------------------------------------------------------- report */

const byArea = new Map()
for (const entry of leftovers) {
  const area = areaOf(entry.file)
  if (areaFilter && area !== areaFilter) continue
  if (!byArea.has(area)) byArea.set(area, [])
  byArea.get(area).push(entry)
}

console.log('i18n check — catalogues: ' + namespaces.length + ' namespaces × ' + LANGS.length + ' languages, '
  + ruKeys.size + ' keys in ru')

if (problems.length) {
  console.log('\nCatalogue and key problems (' + problems.length + '):')
  for (const problem of problems) console.log('  ✗ ' + problem)
} else {
  console.log('Catalogues consistent; every static key used in apps/web/app exists in ru.')
}

let total = 0
const order = ['shell', 'production', 'projects', 'finance', 'team', 'api-messages', 'UNASSIGNED']
console.log('\nHard-coded text remaining, by area (lines):')
for (const area of order) {
  const entries = byArea.get(area)
  if (!entries) continue
  const sum = entries.reduce((n, e) => n + e.hits.length, 0)
  total += sum
  console.log(`\n  ${area} — ${sum} lines in ${entries.length} files`)
  for (const entry of entries.sort((a, b) => b.hits.length - a.hits.length)) {
    console.log(`    ${String(entry.hits.length).padStart(4)}  ${entry.file}`)
    if (listLines) for (const [n, line] of entry.hits) console.log(`          ${n}: ${line.trim().slice(0, 140)}`)
  }
}
console.log(`\nTotal: ${total} lines` + (areaFilter ? ` in area ${areaFilter}` : ''))

const failed = problems.length > 0 || (strict && total > 0)
process.exit(failed ? 1 : 0)

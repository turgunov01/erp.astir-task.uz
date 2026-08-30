/**
 * Dead-link guard.
 *
 * Every internal link in the source must resolve to a real page, and every
 * page must answer 200 for a permitted role. A link without a page is a
 * failure, not a cosmetic issue.
 *
 * Usage: node scripts/check-routes.mjs [baseUrl]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:9990'
const PAGES_DIR = 'apps/web/app/pages'
const APP_DIR = 'apps/web/app'
const NL = String.fromCharCode(10)
const SEP = String.fromCharCode(92)

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function toRoute(file) {
  let rel = relative(PAGES_DIR, file).split(SEP).join('/')
  if (rel.endsWith('.vue')) rel = rel.slice(0, -4)
  let route = '/' + rel
  if (route.endsWith('/index')) route = route.slice(0, -6)
  return route === '' ? '/' : route
}

/** Collect every value that follows marker up to the closing quote. */
function collect(text, marker, closer, into) {
  let index = text.indexOf(marker)
  while (index !== -1) {
    const start = index + marker.length
    const end = text.indexOf(closer, start)
    if (end === -1) break
    const value = text.slice(start, end)
    if (value.startsWith('/')) into.add(value)
    index = text.indexOf(marker, end)
  }
}

const pageFiles = walk(PAGES_DIR).filter(file => file.endsWith('.vue'))
const routes = new Set()
const dynamic = []

for (const file of pageFiles) {
  const route = toRoute(file)
  if (route.includes('[')) dynamic.push(route)
  else routes.add(route)
}

const sourceFiles = walk(APP_DIR).filter(
  file => file.endsWith('.vue') || file.endsWith('.ts')
)
const links = new Set()

for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8')
  collect(text, ' to="', '"', links)
  collect(text, "navigateTo('", "'", links)
  collect(text, " to: '", "'", links)
}

// A trailing slash marks a concatenation prefix, not a route of its own.
const staticLinks = [...links].filter(link => {
  const isConcatPrefix = link.length > 1 && link.endsWith('/')
  const isInterpolated = link.includes('+') || link.includes('{')
  return !isConcatPrefix && !isInterpolated
})

const dead = staticLinks.filter(link => !routes.has(link.split('?')[0]))

console.log('pages : ' + routes.size + ' static, ' + dynamic.length + ' dynamic')
console.log('links : ' + staticLinks.length + ' static')

if (dead.length > 0) {
  console.error(NL + 'DEAD LINKS (no page file):')
  for (const link of dead) console.error('  ' + link)
  process.exitCode = 1
} else {
  console.log('source: no dead links')
}

const email = process.env.CHECK_EMAIL || 'owner@aster.studio'
const password = process.env.CHECK_PASSWORD || 'admin123'

const loginResponse = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
})

if (!loginResponse.ok) {
  console.error(NL + 'cannot log in for the runtime sweep: ' + loginResponse.status)
  process.exitCode = 1
} else {
  const cookie = (loginResponse.headers.getSetCookie?.() || [])
    .map(value => value.split(';')[0])
    .join('; ')

  const failures = []
  for (const route of [...routes].sort()) {
    const res = await fetch(BASE + route, {
      headers: { cookie, accept: 'text/html' },
      redirect: 'follow'
    })
    if (res.status !== 200) failures.push(route + ' -> ' + res.status)
  }

  const passed = routes.size - failures.length
  console.log(NL + 'runtime: ' + passed + '/' + routes.size + ' routes return 200')
  if (failures.length > 0) {
    console.error('FAILING ROUTES:')
    for (const failure of failures) console.error('  ' + failure)
    process.exitCode = 1
  }
}

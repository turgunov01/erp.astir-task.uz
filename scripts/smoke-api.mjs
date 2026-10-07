/**
 * API smoke suite.
 *
 * Exercises every mounted endpoint against the running stack and asserts the
 * status code, so a broken route surfaces as a failure rather than as an empty
 * page someone notices later.
 *
 * Usage: node scripts/smoke-api.mjs [baseUrl]
 */
const BASE = process.argv.find(a => a.startsWith('http')) ?? 'http://127.0.0.1:9990'

// Accounts of the showcase seed (pnpm --filter @astir/api db:seed:showcase);
// override them to run the suite against another instance.
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'astir-demo'
const OWNER = process.env.SMOKE_OWNER ?? 'owner@astir.uz'
const ARTIST = process.env.SMOKE_ARTIST ?? 'anna@astir.uz'
const CLIENT = process.env.SMOKE_CLIENT ?? 'client@24reply.ai'
const NL = String.fromCharCode(10)

const results = []
let cookie = ''

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? '  ' + detail : ''))
}

async function call(method, path, options = {}) {
  const headers = { accept: 'application/json' }
  if (cookie) headers.cookie = cookie
  let body
  if (options.json) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.json)
  }
  const res = await fetch(BASE + path, { method, headers, body, redirect: 'manual' })
  const setCookie = res.headers.getSetCookie?.() ?? []
  if (setCookie.length > 0 && options.keepCookies !== false) {
    cookie = setCookie.map(c => c.split(';')[0]).join('; ')
  }
  let payload = null
  try { payload = await res.json() } catch { payload = null }
  return { status: res.status, payload }
}

async function login(email, password) {
  cookie = ''
  const res = await call('POST', '/api/auth/login', { json: { email, password } })
  return res.status === 200
}

function expect(name, actual, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed]
  record(name, list.includes(actual), 'status ' + actual)
}

async function checkList(name, path) {
  const res = await call('GET', path)
  const total = res.payload && res.payload.meta ? res.payload.meta.total : undefined
  record(
    name,
    res.status === 200 && Array.isArray(res.payload && res.payload.data),
    'status ' + res.status + (total !== undefined ? ', total ' + total : '')
  )
  return (res.payload && res.payload.data) || []
}

console.log('API smoke suite against ' + BASE + NL)

console.log('auth')
record('login as owner', await login(OWNER, PASSWORD))
expect('GET /api/auth/me', (await call('GET', '/api/auth/me')).status, 200)
expect('login with wrong password', (await call('POST', '/api/auth/login', {
  json: { email: OWNER, password: 'nope' }, keepCookies: false
})).status, 401)

/*
 * Password recovery, without mailing anyone or changing a password: the
 * address is on a reserved domain nobody owns, and the tokens are made up.
 */
console.log(NL + 'password recovery')
const BOGUS_TOKEN = 'smoke-' + 'x'.repeat(40)
const unknownReset = await call('POST', '/api/auth/forgot-password', {
  json: { email: 'nobody-' + Date.now() + '@example.invalid' }, keepCookies: false
})
record(
  'forgot-password: neutral 200 for an unknown address',
  unknownReset.status === 200 && unknownReset.payload?.data?.accepted === true,
  'status ' + unknownReset.status
)
expect('forgot-password: malformed address is 400', (await call('POST', '/api/auth/forgot-password', {
  json: { email: 'not-an-email' }, keepCookies: false
})).status, 400)
expect('reset-password/check: unknown token is 400', (await call('POST', '/api/auth/reset-password/check', {
  json: { token: BOGUS_TOKEN }, keepCookies: false
})).status, 400)
const bogusReset = await call('POST', '/api/auth/reset-password', {
  json: { token: BOGUS_TOKEN, password: 'long-enough-password' }, keepCookies: false
})
record(
  'reset-password: unknown token is 400 with a message',
  bogusReset.status === 400 && Boolean(bogusReset.payload?.error?.message) && !bogusReset.payload?.error?.details,
  'status ' + bogusReset.status
)
const shortReset = await call('POST', '/api/auth/reset-password', {
  json: { token: BOGUS_TOKEN, password: 'short' }, keepCookies: false
})
record(
  'reset-password: password policy is checked first',
  shortReset.status === 400 && Array.isArray(shortReset.payload?.error?.details?.password),
  'status ' + shortReset.status
)

await login(OWNER, PASSWORD)

console.log(NL + 'read endpoints')
const projects = await checkList('GET /api/projects', '/api/projects?limit=5')
const tasks = await checkList('GET /api/tasks', '/api/tasks?limit=5')
await checkList('GET /api/tasks archived', '/api/tasks?archived=true&limit=5')
const shots = await checkList('GET /api/shots', '/api/shots?limit=5')
await checkList('GET /api/episodes', '/api/episodes?limit=5')
await checkList('GET /api/scenes', '/api/scenes?limit=5')
await checkList('GET /api/clients', '/api/clients?limit=5')
await checkList('GET /api/employees', '/api/employees?limit=5')
await checkList('GET /api/departments', '/api/departments?limit=5')
const reviews = await checkList('GET /api/reviews', '/api/reviews?limit=5')
await checkList('GET /api/revisions', '/api/revisions?limit=5')
const versions = await checkList('GET /api/versions', '/api/versions?limit=5')
await checkList('GET /api/assets', '/api/assets?limit=5')
await checkList('GET /api/render', '/api/render?limit=5')
await checkList('GET /api/files', '/api/files?limit=5')
await checkList('GET /api/notifications', '/api/notifications?limit=5')

expect('GET /api/health', (await call('GET', '/api/health')).status, 200)
expect('GET /api/dashboard/stats', (await call('GET', '/api/dashboard/stats')).status, 200)
expect('GET /api/reviews/counts', (await call('GET', '/api/reviews/counts')).status, 200)
expect('GET /api/revisions/counts', (await call('GET', '/api/revisions/counts')).status, 200)
expect('GET /api/render/counts', (await call('GET', '/api/render/counts')).status, 200)
expect('GET /api/render/nodes', (await call('GET', '/api/render/nodes')).status, 200)

const project = projects[0]
if (project) {
  expect('GET /api/projects/:id', (await call('GET', '/api/projects/' + project.id)).status, 200)
  expect('GET /api/stages', (await call('GET', '/api/stages?projectId=' + project.id)).status, 200)
  expect('GET /api/projects/:id/members', (await call('GET', '/api/projects/' + project.id + '/members')).status, 200)
  expect('GET /api/projects/:id/members/available', (await call('GET', '/api/projects/' + project.id + '/members/available')).status, 200)
  expect('GET /api/revisions/rounds', (await call('GET', '/api/revisions/rounds?projectId=' + project.id)).status, 200)
  expect('GET /api/tasks/board-counts', (await call('GET', '/api/tasks/board-counts?projectId=' + project.id)).status, 200)
}
if (shots[0]) {
  expect('GET /api/shots/:id', (await call('GET', '/api/shots/' + shots[0].id)).status, 200)
  expect('GET /api/versions/latest', (await call('GET', '/api/versions/latest?shotId=' + shots[0].id)).status, 200)
}
if (tasks[0]) expect('GET /api/tasks/:id', (await call('GET', '/api/tasks/' + tasks[0].id)).status, 200)

// Detail endpoints behind the right-hand panels: a row that opens nothing is a
// dead end the table itself cannot reveal.
for (const [name, path] of [
  ['revisions', '/api/revisions'],
  ['render', '/api/render'],
  ['assets', '/api/assets'],
  ['reviews', '/api/reviews']
]) {
  const first = (await call('GET', path + '?limit=1')).payload?.data?.[0]
  if (!first) continue
  expect('GET ' + path + '/:id', (await call('GET', path + '/' + first.id)).status, 200)
}
expect(
  'GET /api/render/:id unknown',
  (await call('GET', '/api/render/00000000-0000-4000-8000-000000000000')).status,
  404
)

// A review with a deadline in the past closes itself on the next read, and a
// fresh deadline reopens it. Both directions matter: without the second, a
// lapsed discussion could never be resumed.
{
  const version = (await call('GET', '/api/versions?limit=1')).payload?.data?.[0]
  if (version) {
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const created = await call('POST', '/api/reviews', {
      json: { versionId: version.id, reviewType: 'INTERNAL', deadline: past }
    })
    const id = created.payload?.data?.id
    expect('POST /api/reviews with deadline', created.status, 201)

    if (id) {
      const afterRead = await call('GET', '/api/reviews/' + id)
      record(
        'overdue review closes itself',
        afterRead.payload?.data?.status === 'EXPIRED',
        'статус ' + afterRead.payload?.data?.status
      )

      const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const reopened = await call('PATCH', '/api/reviews/' + id, { json: { deadline: future } })
      record(
        'new deadline reopens the review',
        reopened.status === 200 && reopened.payload?.data?.status === 'PENDING',
        'статус ' + reopened.payload?.data?.status
      )

      const c = await call('POST', '/api/comments', {
        json: { entityType: 'Review', entityId: id, message: 'smoke: обсуждение' }
      })
      expect('POST /api/comments on a review', c.status, 201)
      const thread = await call(
        'GET',
        '/api/comments?entityType=Review&entityId=' + id
      )
      expect('GET /api/comments', thread.status, 200)

      await call('DELETE', '/api/reviews/' + id)
    }
  }
}

// Phase 5 planning endpoints: hours, capacity and the two dated views.
expect('GET /api/timesheets', (await call('GET', '/api/timesheets?limit=5')).status, 200)
expect('GET /api/timesheets/summary', (await call('GET', '/api/timesheets/summary')).status, 200)
expect('GET /api/timesheets/workload', (await call('GET', '/api/timesheets/workload')).status, 200)
expect('GET /api/dashboard/calendar', (await call('GET', '/api/dashboard/calendar')).status, 200)

{
  const project = (await call('GET', '/api/projects?limit=1')).payload?.data?.[0]
  if (project) {
    expect(
      'GET /api/dashboard/timeline',
      (await call('GET', '/api/dashboard/timeline?projectId=' + project.id)).status,
      200
    )
  }
  // Logging hours and taking them back, the way the page does it.
  const project2 = (await call('GET', '/api/projects?limit=1')).payload?.data?.[0]
  if (project2) {
    const today = new Date().toISOString().slice(0, 10)
    const logged = await call('POST', '/api/timesheets', {
      json: { projectId: project2.id, date: today, hours: 1.5, description: 'smoke' }
    })
    expect('POST /api/timesheets', logged.status, 201)
    if (logged.payload?.data?.id) {
      expect(
        'DELETE /api/timesheets/:id',
        (await call('DELETE', '/api/timesheets/' + logged.payload.data.id)).status,
        204
      )
    }
  }
}

// Every table lets a file be attached to the record being created, so the
// upload endpoint has to accept each owner column and file the document under
// it. A one-pixel PNG is enough to prove the wiring.
{
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const owners = [
    ['assetId', '/api/assets'],
    ['renderJobId', '/api/render'],
    ['episodeId', '/api/episodes'],
    ['sceneId', '/api/scenes'],
    ['shotId', '/api/shots'],
    ['revisionId', '/api/revisions'],
    ['reviewId', '/api/reviews'],
    ['departmentId', '/api/departments']
  ]

  for (const [ownerKey, listPath] of owners) {
    const row = (await call('GET', listPath + '?limit=1')).payload?.data?.[0]
    if (!row) continue

    const form = new FormData()
    form.append('file', new Blob([png], { type: 'image/png' }), 'smoke.png')
    form.append(ownerKey, row.id)
    form.append('name', 'smoke.png')
    const uploaded = await fetch(BASE + '/api/files', {
      method: 'POST',
      headers: { cookie },
      body: form
    })
    const created = await uploaded.json().catch(() => null)

    const listed = await call('GET', '/api/files?' + ownerKey + '=' + row.id)
    const attached = (listed.payload?.data ?? []).some(doc => doc.id === created?.data?.id)
    record(
      'attach a file via ' + ownerKey,
      uploaded.status === 201 && attached,
      'загрузка ' + uploaded.status
    )

    if (created?.data?.id) await call('DELETE', '/api/files/' + created.data.id)
  }
}

// Archiving takes a row out of the working set and puts it back. Every table
// offers it, so every module has to answer.
for (const path of [
  '/api/clients', '/api/projects', '/api/episodes', '/api/scenes',
  '/api/shots', '/api/assets', '/api/reviews', '/api/revisions',
  '/api/files', '/api/render', '/api/departments', '/api/employees'
]) {
  const first = (await call('GET', path + '?limit=1')).payload?.data?.[0]
  if (!first) continue
  const archived = await call('POST', path + '/' + first.id + '/archive')
  const list = await call('GET', path + '?limit=100')
  const hidden = !(list.payload?.data ?? []).some(row => row.id === first.id)
  const inArchive = await call('GET', path + '?limit=100&archived=true')
  const listed = (inArchive.payload?.data ?? []).some(row => row.id === first.id)
  const restored = await call('POST', path + '/' + first.id + '/unarchive')
  record(
    'archive round trip ' + path,
    archived.status === 200 && hidden && listed && restored.status === 200,
    'скрыт=' + hidden + ' в архиве=' + listed
  )
}
if (reviews[0]) expect('GET /api/reviews/:id', (await call('GET', '/api/reviews/' + reviews[0].id)).status, 200)
if (versions[0]) expect('GET /api/versions/:id', (await call('GET', '/api/versions/' + versions[0].id)).status, 200)

console.log(NL + 'validation')
expect('POST /api/tasks without title', (await call('POST', '/api/tasks', {
  json: { projectId: project ? project.id : undefined }
})).status, 400)
expect('GET /api/projects/:id with bad uuid', (await call('GET', '/api/projects/not-a-uuid')).status, 400)
expect('unknown route returns 404', (await call('GET', '/api/does-not-exist')).status, 404)
expect('limit above the cap is rejected', (await call('GET', '/api/tasks?limit=500')).status, 400)

console.log(NL + 'permissions')
await login(ARTIST, PASSWORD)
expect('artist reads tasks', (await call('GET', '/api/tasks?limit=1')).status, 200)
// Without task:view the artist sees their own tasks only, asked or not.
const artistMe = await call('GET', '/api/auth/me')
const artistId = artistMe.payload && artistMe.payload.data ? artistMe.payload.data.user.id : null
const artistTasks = await call('GET', '/api/tasks?limit=100')
const artistRows = (artistTasks.payload && artistTasks.payload.data) || []
record(
  'artist lists only own tasks',
  artistTasks.status === 200 && artistRows.every(task => task.assignee && task.assignee.id === artistId),
  artistRows.length + ' rows'
)
const strangerTask = tasks.find(task => !task.assignee || task.assignee.id !== artistId)
if (strangerTask) {
  expect('artist gets 404 for a stranger task', (await call('GET', '/api/tasks/' + strangerTask.id)).status, 404)
}
expect('artist blocked from clients', (await call('GET', '/api/clients')).status, 403)
expect('artist cannot create project', (await call('POST', '/api/projects', {
  json: { name: 'x', clientId: project ? project.id : undefined }
})).status, 403)
expect('artist cannot create episode', (await call('POST', '/api/episodes', {
  json: { projectId: project ? project.id : undefined, title: 'x' }
})).status, 403)
expect('artist cannot manage pipeline', (await call('PATCH', '/api/stages/00000000-0000-0000-0000-000000000000', {
  json: { progress: 10 }
})).status, 403)
expect('artist cannot upload documents', (await call('POST', '/api/files', { json: {} })).status, 403)

// «Я приехал»: the employee's own day. Pressing twice must answer with the
// first press, not move it (this marks the artist's arrival for today).
const myDay = await call('GET', '/api/attendance/me/today')
record('artist reads own attendance day', myDay.status === 200 && myDay.payload?.data?.tracked === true, 'status ' + myDay.status)
const firstPress = await call('POST', '/api/attendance/me/check-in')
const secondPress = await call('POST', '/api/attendance/me/check-in')
record(
  'repeated check-in keeps the first arrival',
  [200, 201].includes(firstPress.status) && secondPress.status === 200 &&
    Boolean(secondPress.payload?.data?.checkInAt) &&
    secondPress.payload.data.checkInAt === firstPress.payload?.data?.checkInAt,
  'status ' + firstPress.status + ' then ' + secondPress.status
)

await login(CLIENT, PASSWORD)
const clientReviews = await call('GET', '/api/reviews?limit=50')
const clientRows = (clientReviews.payload && clientReviews.payload.data) || []
record(
  'client sees only CLIENT reviews',
  clientReviews.status === 200 && clientRows.every(row => row.reviewType === 'CLIENT'),
  clientRows.length + ' rows'
)
expect('client blocked from employees', (await call('GET', '/api/employees')).status, 403)
expect('client blocked from render queue', (await call('GET', '/api/render')).status, 403)
expect('client has no attendance day', (await call('GET', '/api/attendance/me/today')).status, 403)
expect('client cannot check in', (await call('POST', '/api/attendance/me/check-in')).status, 403)

console.log(NL + 'unauthenticated')
cookie = ''
expect('no session on /api/tasks', (await call('GET', '/api/tasks')).status, 401)
expect('no session on /api/projects', (await call('GET', '/api/projects')).status, 401)

const failed = results.filter(item => !item.ok)
console.log(NL + '---')
console.log('passed ' + (results.length - failed.length) + ' / ' + results.length)
if (failed.length > 0) {
  console.log(NL + 'failures:')
  for (const item of failed) console.log('  ' + item.name + '  ' + (item.detail || ''))
  process.exitCode = 1
}

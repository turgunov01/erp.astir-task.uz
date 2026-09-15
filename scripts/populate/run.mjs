'use strict'
/**
 * Fill an ERP instance through its own API, record by record, as the people
 * who would enter it. Nothing touches the database directly.
 *
 *   BASE_URL=https://erp.astir-task.uz OWNER_EMAIL=owner@astir.uz OWNER_PASSWORD=... \
 *   STAFF_PASSWORD=... MEDIA_DIR=~/Downloads node scripts/populate/run.mjs
 *
 * Re-runnable: departments, staff, clients and templates are matched by
 * name/e-mail; a project whose code already exists is skipped.
 */
import { Session, log } from './api.mjs'
import { scanMedia, next } from './media.mjs'
import * as S from './story.mjs'
import { buildProduction, createTasks, reviewCycle, renderFarm, closeOut } from './production.mjs'
import { assets, finances, documents } from './finance.mjs'
import { sideProject } from './side-project.mjs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4010'
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'owner@astir.uz'
const OWNER_PASSWORD = process.env.OWNER_PASSWORD
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? OWNER_PASSWORD
if (!OWNER_PASSWORD) throw new Error('OWNER_PASSWORD is required')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function departments(owner) {
  const existing = await owner.get('/api/departments?limit=100')
  const byName = new Map((existing.data ?? []).map(d => [d.name, d.id]))
  for (const [name, description] of S.DEPARTMENTS) {
    if (byName.has(name)) continue
    const created = await owner.post('/api/departments', { name, description })
    byName.set(name, created.id)
  }
  log('departments ' + byName.size)
  return byName
}

async function staff(owner, departmentIds) {
  const people = { owner: { key: 'owner', role: 'OWNER', userId: owner.user.id, session: owner, position: 'Основатель студии' } }
  const existing = await owner.get('/api/employees?limit=100')
  const byEmail = new Map((existing.data ?? []).map(e => [e.user?.email ?? e.email, e]))
  for (const seed of S.STAFF) {
    let employee = byEmail.get(seed.email)
    if (!employee) {
      employee = await owner.post('/api/employees', {
        email: seed.email, firstName: seed.firstName, lastName: seed.lastName, password: STAFF_PASSWORD, role: seed.role,
        departmentId: departmentIds.get(seed.department) ?? null, position: seed.position,
        employmentType: seed.employment ?? 'FULL_TIME', hourlyRate: seed.rate, weeklyCapacityHours: seed.capacity ?? 40, status: 'ACTIVE'
      })
      await owner.post('/api/employees/' + employee.id + '/verify-email', {}).catch(() => undefined)
    }
    const session = new Session(BASE, seed.email, STAFF_PASSWORD, seed.key)
    await session.login()
    await sleep(400)
    people[seed.key] = { ...seed, userId: employee.user?.id ?? employee.userId, employeeId: employee.id, session }
  }
  log('staff ' + S.STAFF.length + ' signed in')
  return people
}

async function studio(owner, departmentIds) {
  const logo = await owner.upload('/api/files', { departmentId: departmentIds.get('Management'), type: 'OTHER', name: 'Логотип студии' }, next('image', 'astir-logo'))
  await owner.patch('/api/settings', { ...S.STUDIO, ...(logo?.fileUrl ? { logoUrl: logo.fileUrl } : {}) })
  const existing = await owner.get('/api/settings/templates')
  const names = new Set((existing.data ?? []).map(t => t.name))
  for (const [name, stages] of Object.entries(S.TEMPLATES)) {
    if (names.has(name)) continue
    await owner.post('/api/settings/templates', { name, stages, isDefault: name === '3D Animation', description: 'Шаблон «' + name + '»' })
  }
  log('studio settings and ' + Object.keys(S.TEMPLATES).length + ' templates')
}

async function clients(people) {
  const producer = people.owner.session
  const existing = await producer.get('/api/clients?limit=100')
  const byName = new Map((existing.data ?? []).map(c => [c.name, c]))
  const out = {}
  for (const seed of S.CLIENTS) {
    const { key, ...body } = seed
    out[key] = byName.get(seed.name) ?? await producer.post('/api/clients', { ...body, status: 'ACTIVE' })
  }
  log('clients ' + Object.keys(out).length)
  return out
}

export async function projectExists(session, code) {
  const list = await session.get('/api/projects?search=' + encodeURIComponent(code) + '&limit=50')
  return (list.data ?? []).find(p => p.code === code)
}

async function mainProject(ctx, clientsByKey) {
  const { people } = ctx
  const pm = people.pm.session
  const seed = S.MAIN_PROJECT
  if (await projectExists(pm, seed.code)) { log(seed.code + ' already exists, skipped'); return }
  const client = clientsByKey[seed.client]
  const project = await people.producer.session.post('/api/projects', {
    code: seed.code, name: seed.name, description: seed.description, clientId: client.id,
    projectManagerId: people.pm.userId, producerId: people.producer.userId, projectType: seed.projectType,
    status: 'DRAFT', priority: seed.priority, startDate: S.day(seed.startDay), deadline: S.day(seed.deadlineDay),
    budget: seed.budget, currency: 'USD', template: seed.template
  })
  for (const person of Object.values(people)) {
    if (person.key === 'owner') continue
    await pm.post('/api/projects/' + project.id + '/members', { userId: person.userId, roleLabel: person.position })
  }
  ctx.stages = (await pm.get('/api/stages?projectId=' + project.id)).data ?? []
  log('project ' + seed.code + ' with ' + ctx.stages.length + ' stages and ' + (Object.keys(people).length - 1) + ' members')

  await people.owner.session.patch('/api/projects/' + project.id, { status: 'PLANNING' })
  const production = await buildProduction(ctx, project)
  await pm.patch('/api/projects/' + project.id, { status: 'PRE_PRODUCTION' })
  await assets(ctx, project)
  await pm.patch('/api/projects/' + project.id, { status: 'PRODUCTION' })
  const tasks = await createTasks(ctx, project, production)
  await reviewCycle(ctx, project, production, tasks)
  await pm.patch('/api/projects/' + project.id, { status: 'POST_PRODUCTION' })
  await renderFarm(ctx, project, production)
  await finances(ctx, project, client)
  await documents(ctx, project, client, production, tasks)
  await pm.patch('/api/projects/' + project.id, { status: 'CLIENT_REVIEW' })
  await closeOut(ctx, project, production)
  await pm.patch('/api/projects/' + project.id, { status: 'DELIVERY' })
  await people.owner.session.patch('/api/projects/' + project.id, { status: 'COMPLETED' })
  log(seed.code + ' completed')
}

async function main() {
  console.log('populating ' + BASE + ' as ' + OWNER_EMAIL)
  log('media: ' + scanMedia())
  const owner = new Session(BASE, OWNER_EMAIL, OWNER_PASSWORD, 'owner')
  await owner.login()
  const departmentIds = await departments(owner)
  const people = await staff(owner, departmentIds)
  await studio(owner, departmentIds)
  const clientsByKey = await clients(people)
  const ctx = { people, departments: departmentIds, stages: [] }
  await mainProject(ctx, clientsByKey)
  for (const seed of S.SIDE_PROJECTS) await sideProject(ctx, clientsByKey, seed, projectExists)
  console.log('done.')
}

main().catch(err => { console.error(err); process.exit(1) })

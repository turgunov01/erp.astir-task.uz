'use strict'
/**
 * Narrated walkthrough of a live instance as the studio owner.
 *
 * Every step holds the screen at least as long as its narration clip
 * (media/narration/<id>.wav, durations in plan.json) and records when it
 * started, so scripts/demo/mux.mjs can lay the voice-over onto the video.
 *
 *   NODE_PATH=<dir with playwright> BASE_URL=https://erp.astir-task.uz DEMO_PASSWORD=... \
 *     node scripts/demo/record-prod.cjs [--rehearse]
 */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const H = require('./helpers.cjs')

const BASE = process.env.BASE_URL || 'https://erp.astir-task.uz'
const EMAIL = process.env.DEMO_EMAIL || 'owner@astir.uz'
const PASSWORD = process.env.DEMO_PASSWORD || 'astir-demo'
const NEW_PASSWORD = process.env.DEMO_NEW_PASSWORD || PASSWORD
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, '..', '..', 'media')
const PLAN = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'narration', 'plan.json'), 'utf8'))
const DURATION = Object.fromEntries(PLAN.map(s => [s.id, s.seconds]))
const REHEARSAL = process.argv.includes('--rehearse')
const SIZE = { width: 1280, height: 720 }
const GROUP_PREFIX = { 'Финансы': 'finance', 'Отчёты': 'reports', 'Команда': 'team', 'Производство': 'episodes' }

let page
let T0 = 0
let failures = 0
let current = null
const timeline = []
const wait = ms => page.waitForTimeout(REHEARSAL ? Math.min(ms, 150) : ms)
const trace = msg => console.log('[' + String(Math.round((Date.now() - T0) / 100) / 10).padStart(6) + 's] ' + msg)

/** Hold the current step until its narration has been heard. */
async function padToNarration() {
  if (!current || REHEARSAL) return
  const elapsed = (Date.now() - T0 - current.start) / 1000
  const need = current.seconds + 0.8 - elapsed
  if (need > 0) await page.waitForTimeout(need * 1000)
}
async function step(id, subtitle) {
  await padToNarration()
  current = { id, start: Date.now() - T0, seconds: DURATION[id] ?? 0 }
  timeline.push(current)
  trace('step ' + id)
  if (!REHEARSAL) await H.showSubtitle(page, subtitle)
}

async function go(route, pause = 2500) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await H.overlays(page)
  await wait(pause)
}
async function nav(href, label, pause = 2500) {
  trace('nav ' + href)
  const link = page.locator('aside a[href="' + href + '"]').first()
  if (await link.isVisible().catch(() => false)) {
    if (REHEARSAL) { await H.ensureVisible(page, link, label); await link.click() } else await H.moveAndClick(page, link, label, { postClickDelay: 600 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await H.overlays(page)
    await wait(pause)
  } else await go(href, pause)
}
async function group(name) {
  const expanded = await page.locator('aside a[href^="/' + GROUP_PREFIX[name] + '"]').first().isVisible().catch(() => false)
  if (expanded) return
  const button = page.locator('aside button:has-text("' + name + '")').first()
  if (REHEARSAL) { if (!(await H.ensureVisible(page, button, 'group ' + name))) failures++; await button.click(); await wait(200); return }
  await H.moveAndClick(page, button, 'group ' + name, { postClickDelay: 700 })
}
async function click(selector, label, pause = 1800) {
  trace('click ' + label)
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  if (REHEARSAL) {
    const ok = await H.ensureVisible(page, selector, label)
    if (!ok) { failures++; return false }
    await page.locator(selector).first().click().catch(e => console.error('click failed ' + label + ': ' + e.message))
    await wait(200)
    return true
  }
  const ok = await H.moveAndClick(page, selector, label, { postClickDelay: pause })
  if (!ok) failures++
  return ok
}
async function type(selector, text, label) {
  if (REHEARSAL) { if (!(await H.ensureVisible(page, selector, label))) failures++; await page.fill(selector, text); return }
  await H.typeSlowly(page, selector, text, label, 30)
}
async function select(selector, option, label) {
  trace('select ' + label)
  const el = page.locator(selector).first()
  if (!REHEARSAL) { const box = await el.boundingBox(); if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }) }
  let spec = option
  if (option && typeof option === 'object' && option.contains) {
    spec = await el.evaluate((node, needle) => Array.from(node.options).find(o => o.text.includes(needle))?.value ?? '', option.contains)
  }
  await el.selectOption(spec).catch(e => { console.error('select failed ' + label + ': ' + e.message); failures++ })
  await wait(700)
}
/** Submits a create form; a rehearsal only checks the button and cancels, so nothing is created twice. */
async function submit(selector, label, pause) {
  if (REHEARSAL) {
    if (!(await H.ensureVisible(page, selector, label))) failures++
    await page.keyboard.press('Escape')
    await wait(300)
    return
  }
  await click(selector, label, pause)
}
async function closeOverlay() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const closeButton = page.locator('[role="dialog"] button[aria-label="Закрыть"], [role="dialog"] button:has-text("Закрыть"), button[aria-label="Закрыть галерею"]').first()
    const backdrop = page.locator('div.fixed.inset-0').last()
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click({ timeout: 3000 }).catch(() => {})
    else if (await backdrop.isVisible().catch(() => false)) await backdrop.click({ position: { x: 5, y: 5 }, force: true, timeout: 3000 }).catch(() => {})
    else await page.keyboard.press('Escape')
    await wait(500)
    if (!(await page.locator('div.fixed.inset-0, [role="dialog"]').last().isVisible().catch(() => false))) break
  }
}
const scroll = (top, pause) => (REHEARSAL ? page.evaluate(y => window.scrollTo(0, y), top) : H.smoothScroll(page, top, pause))
const pan = (selector, n) => (REHEARSAL ? Promise.resolve() : H.panElements(page, selector, n))

async function story() {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await H.overlays(page)
  await step('login', 'Astir ERP — вход владельца студии')
  await type('input[type="email"]', EMAIL, 'email')
  await type('input[type="password"]', PASSWORD, 'password')
  await click('button[type="submit"]', 'Sign in', 500)
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
  await page.locator('button[aria-label*="уведомлен"], button[aria-label="Уведомления"]').first().waitFor({ timeout: 20000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await H.overlays(page)
  await wait(1500)

  await step('dashboard', 'Панель управления: два активных проекта, риски, согласования')
  await pan('main .grid > div, main a[href]', 6)
  await scroll(500, 1600)
  await scroll(0, 900)

  await step('projects', 'Проекты студии')
  await nav('/projects', 'Проекты', 1800)
  await pan('main table tbody tr', 3)

  await step('project', 'Завершённый проект: прогресс, бюджет, пайплайн из 22 этапов')
  await click('a[href^="/projects/"]:has-text("24reply")', 'Project AST-001', 2200)
  await pan('main h1, main .grid > div', 5)
  await click('button:has-text("Пайплайн")', 'Tab Пайплайн', 1500)
  await scroll(600, 1800)
  await scroll(1300, 1800)
  await scroll(0, 600)
  await click('button:has-text("Шоты")', 'Tab Шоты', 1800)

  await step('shot', 'Шот: 22 стадии, прогресс по весам')
  await nav('/shots', 'Шоты', 1800)
  await click('a[href^="/shots/"]', 'First shot', 2200)
  await scroll(600, 1600)
  await scroll(1500, 1600)
  await scroll(2400, 1600)

  await step('employee', 'Добавляем сотрудника вручную')
  await nav('/team/employees', 'Сотрудники', 1500)
  await click('button:has-text("Новый сотрудник")', 'New employee', 1000)
  await type('#field-firstName', 'Дилноза', 'firstName')
  await type('#field-lastName', 'Рашидова', 'lastName')
  await type('#field-email', 'intern@astir.uz', 'email')
  await type('#field-password', NEW_PASSWORD, 'password')
  await type('#field-position', 'Стажёр-аниматор', 'position')
  await select('#field-role', 'ARTIST', 'role')
  await select('#field-departmentId', { label: 'Animation' }, 'department')
  await select('#field-employmentType', 'INTERN', 'employment')
  await type('#field-weeklyCapacityHours', '30', 'capacity')
  await select('#field-status', 'ACTIVE', 'status')
  await submit('form button[type="submit"]:has-text("Создать")', 'Create employee', 2500)

  await step('tasks', 'Создаём задачу для проекта Nur Bank')
  await nav('/tasks', 'Задачи', 1500)
  await click('button:has-text("Новая задача")', 'New task', 1000)
  await type('#ct-title', 'Утвердить раскадровку с клиентом', 'title')
  await select('#ct-project', { contains: 'AST-002' }, 'project')
  await select('#ct-assignee', { label: 'Анна Волкова' }, 'assignee')
  await select('#ct-reviewer', { label: 'Руслан Абдуллаев' }, 'reviewer')
  await type('#ct-hours', '6', 'hours')
  await select('#ct-priority', 'HIGH', 'priority')
  await type('#ct-description', 'Показать финальную раскадровку маркетингу банка и зафиксировать замечания.', 'description')
  await submit('button[type="submit"]:has-text("Создать задачу")', 'Create task', 2200)
  await click('main a[href="/tasks/board"]', 'View: board', 2500)
  await H.overlays(page)

  await step('reviews', 'Согласования: версии, решения, история')
  await nav('/reviews', 'Согласование', 1500)
  await click('button:has-text("Ожидают")', 'Tab Ожидают', 1200)
  await click('main table tbody button.font-mono', 'Pending review', 2800)
  await closeOverlay()
  await click('button:has-text("Согласованы")', 'Tab Согласованы', 2000)

  await step('revisions', 'Правки и очередь рендера')
  await nav('/revisions', 'Правки', 2200)
  await nav('/render', 'Очередь рендера', 2200)
  await scroll(400, 1200)

  await step('assets', 'Библиотека ассетов и документы')
  await nav('/assets', 'Библиотека ассетов', 2000)
  await scroll(500, 1400)
  await nav('/documents', 'Документы', 1800)
  await click('button:has-text("Посмотреть галерею")', 'Gallery', 2200)
  await closeOverlay()

  await step('finance', 'Финансы: бюджет, счета, платежи, расходы')
  await group('Финансы')
  await nav('/finance', 'Финансовый обзор', 2200)
  await nav('/finance/invoices', 'Счета', 1800)
  await nav('/finance/expenses', 'Расходы', 1800)

  await step('reports', 'Отчёты')
  await group('Отчёты')
  await nav('/reports/production', 'Отчёт: производство', 2000)
  await scroll(500, 1200)
  await nav('/reports/financial', 'Отчёт: финансы', 2000)
  await nav('/reports/time', 'Отчёт: время', 1800)

  await step('team', 'Загрузка команды и учёт времени')
  await group('Команда')
  await nav('/team/workload', 'Загрузка команды', 2200)
  await nav('/timesheets', 'Учёт времени', 2000)

  await step('activity', 'Таймлайн и лента событий')
  await nav('/timeline', 'Таймлайн', 2200)
  await scroll(500, 1200)
  await nav('/activity', 'Лента событий', 2000)
  await scroll(500, 1200)

  await step('settings', 'Настройки студии')
  await nav('/settings', 'Настройки', 1500)
  await click('button:has-text("Почта")', 'Tab Почта', 1500)
  await click('button:has-text("Шаблоны пайплайна")', 'Tab Шаблоны', 1500)
  await click('button:has-text("Пользователи и роли")', 'Tab Пользователи', 1500)

  await step('outro', 'Astir ERP — от брифа до сдачи в одной системе')
  await nav('/dashboard', 'Панель управления', 2500)
  await padToNarration()
  if (!REHEARSAL) await H.showSubtitle(page, '')
  await wait(800)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(REHEARSAL
    ? { viewport: SIZE, locale: 'ru-RU' }
    : { viewport: SIZE, locale: 'ru-RU', recordVideo: { dir: OUT_DIR, size: SIZE } })
  page = await context.newPage()
  T0 = Date.now()
  try {
    await story()
  } catch (err) {
    console.error('DEMO ERROR:', err.message)
    failures++
  } finally {
    await context.close()
    if (!REHEARSAL) {
      const video = page.video()
      if (video) {
        const src = await video.path()
        const dest = path.join(OUT_DIR, 'astir-erp-demo-prod-raw.webm')
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
        fs.writeFileSync(path.join(OUT_DIR, 'narration', 'timeline.json'), JSON.stringify(timeline, null, 2))
        console.log('Video saved:', dest, Math.round(fs.statSync(dest).size / 1024) + ' KB; timeline written')
      }
    }
    await browser.close()
    console.log(REHEARSAL ? (failures ? 'REHEARSAL FAILED (' + failures + ')' : 'REHEARSAL PASSED') : 'RECORDING DONE, warnings: ' + failures)
    process.exit(failures && REHEARSAL ? 1 : 0)
  }
})()

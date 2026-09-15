'use strict'
/**
 * Records the owner-role walkthrough of the showcase dataset (prisma/seed-showcase.ts).
 *
 * Needs Playwright next to this repo, which is not a project dependency:
 *   npm i --no-save playwright && npx playwright install chromium
 * Then, with the local stack up (pnpm dev:api, pnpm dev:web) and the showcase seeded:
 *   node scripts/demo/record.cjs --rehearse   # verifies every selector, no video
 *   OUT_DIR=media node scripts/demo/record.cjs # writes media/astir-erp-demo-owner.webm
 * Convert with ffmpeg -i media/astir-erp-demo-owner.webm -c:v libx264 -crf 22 -pix_fmt yuv420p media/astir-erp-demo-owner.mp4
 */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const H = require('./helpers.cjs')

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9990'
const EMAIL = process.env.DEMO_EMAIL || 'owner@astir.uz'
const PASSWORD = process.env.DEMO_PASSWORD || 'astir-demo'
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, '..', '..', 'media')
const OUTPUT_NAME = process.env.OUTPUT_NAME || 'astir-erp-demo-owner.webm'
const REHEARSAL = process.argv.includes('--rehearse')
const SIZE = { width: 1280, height: 720 }
const GROUP_PREFIX = { 'Финансы': 'finance', 'Отчёты': 'reports', 'Команда': 'team', 'Производство': 'episodes' }

let page
let failures = 0
const T0 = Date.now()
const trace = msg => console.log('[' + String(Math.round((Date.now() - T0) / 100) / 10).padStart(6) + 's] ' + msg)
const wait = ms => page.waitForTimeout(REHEARSAL ? Math.min(ms, 150) : ms)

async function go(route, pause = 3000) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  await H.overlays(page)
  await wait(pause)
}
/** Click through the sidebar when the link is visible, otherwise navigate directly. */
async function nav(href, label, pause = 3000) {
  trace('nav ' + href)
  const link = page.locator('aside a[href="' + href + '"], nav a[href="' + href + '"]').first()
  if (await link.isVisible().catch(() => false)) {
    if (REHEARSAL) { await H.ensureVisible(page, link, label); await link.click() } else await H.moveAndClick(page, link, label, { postClickDelay: 600 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await H.overlays(page)
    await wait(pause)
  } else {
    console.warn('sidebar link not visible, navigating directly: ' + href)
    await go(href, pause)
  }
}
async function group(name) {
  trace('group ' + name)
  const button = page.locator('aside button:has-text("' + name + '")').first()
  const expanded = await page.locator('aside a[href^="/' + GROUP_PREFIX[name] + '"]').first().isVisible().catch(() => false)
  if (expanded) return
  if (REHEARSAL) { if (!(await H.ensureVisible(page, button, 'group ' + name))) failures++; await button.click(); await wait(200); return }
  await H.moveAndClick(page, button, 'group ' + name, { postClickDelay: 700 })
}
async function click(selector, label, pause = 2000) {
  trace('click ' + label)
  if (REHEARSAL) {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    const ok = await H.ensureVisible(page, selector, label)
    if (!ok) { failures++; return false }
    await page.locator(selector).first().click().catch(e => console.error('click failed ' + label + ': ' + e.message))
    await wait(200)
    return true
  }
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const ok = await H.moveAndClick(page, selector, label, { postClickDelay: pause })
  if (!ok) failures++
  return ok
}
/** Close whatever popover/drawer is open: backdrop click first, Escape as fallback. */
async function closeOverlay() {
  trace('closeOverlay')
  const backdrop = page.locator('div.fixed.inset-0').last()
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 5, y: 5 }, force: true, timeout: 5000 }).catch(() => {})
  } else {
    await page.keyboard.press('Escape')
  }
  await wait(500)
  if (await page.locator('div.fixed.inset-0').last().isVisible().catch(() => false)) await page.keyboard.press('Escape')
}
const sub = text => (REHEARSAL ? Promise.resolve() : H.showSubtitle(page, text))
const scroll = (top, pause) => (REHEARSAL ? page.evaluate(y => window.scrollTo(0, y), top) : H.smoothScroll(page, top, pause))
const pan = (selector, n) => (REHEARSAL ? Promise.resolve() : H.panElements(page, selector, n))

async function story() {
  // 1. Login
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await H.overlays(page)
  await sub('Шаг 1 — Вход владельца студии')
  if (REHEARSAL) { await H.ensureVisible(page, 'input[type="email"]', 'email'); await H.ensureVisible(page, 'input[type="password"]', 'password'); await H.ensureVisible(page, 'button[type="submit"]', 'sign in') }
  await (REHEARSAL ? page.fill('input[type="email"]', EMAIL) : H.typeSlowly(page, 'input[type="email"]', EMAIL, 'email'))
  await (REHEARSAL ? page.fill('input[type="password"]', PASSWORD) : H.typeSlowly(page, 'input[type="password"]', PASSWORD, 'password'))
  await click('button[type="submit"]', 'Sign in', 500)
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 })
  await page.locator('button[aria-label*="уведомлен"]').waitFor({ timeout: 20000 })
  await page.waitForLoadState('networkidle').catch(() => {})
  await H.overlays(page)
  await wait(4000)

  // 2. Dashboard + notifications
  await sub('Шаг 2 — Панель управления и уведомления')
  await pan('main a[href], main .rounded-xl, main [class*="card"]', 6)
  await click('button[aria-label*="уведомлен"]', 'Notifications bell', 2600)
  await closeOverlay()
  await wait(600)

  // 3. Project from brief to delivery
  await sub('Шаг 3 — Проект: от брифа до сдачи')
  await nav('/projects', 'Проекты', 2500)
  await click('a[href^="/projects/"]:has-text("24reply")', 'Project AST-001', 3000)
  await pan('main h1, main .grid > div', 5)
  await click('button:has-text("Пайплайн")', 'Tab Пайплайн', 2000)
  await scroll(500, 1800)
  await scroll(1100, 1800)
  await scroll(0, 800)
  await click('button:has-text("Эпизоды")', 'Tab Эпизоды', 2200)
  await click('button:has-text("Шоты")', 'Tab Шоты', 2200)
  await scroll(500, 1500)
  await scroll(0, 600)
  await click('button:has-text("Команда")', 'Tab Команда', 2200)
  await click('button:has-text("Файлы")', 'Tab Файлы', 2200)
  await scroll(500, 1500)

  // 4. Shot detail
  await sub('Шаг 4 — Шот: 22 стадии и версии')
  await nav('/shots', 'Шоты', 2500)
  await click('a[href^="/shots/"]', 'First shot', 3000)
  await scroll(600, 1600)
  await scroll(1400, 1600)
  await scroll(2200, 1600)

  // 5. Tasks
  await sub('Шаг 5 — Задачи: доска, список, календарь')
  await nav('/tasks', 'Задачи', 2500)
  await click('main table tbody tr button.font-medium', 'Task title', 3200)
  await closeOverlay()
  await wait(500)
  await click('main a[href="/tasks/board"]', 'View: board', 2600)
  await H.overlays(page)
  await click('main button:has-text("Завершена")', 'Column Завершена', 2800)
  await closeOverlay()
  await wait(400)
  await go('/tasks/calendar', 2800)

  // 6. Reviews + revisions
  await sub('Шаг 6 — Согласования и правки клиента')
  await nav('/reviews', 'Согласование', 2200)
  await click('button:has-text("Согласованы")', 'Tab Согласованы', 1800)
  await click('main table tbody button.font-mono', 'Review', 3400)
  await closeOverlay()
  await wait(400)
  await click('button:has-text("На доработке")', 'Tab На доработке', 1800)
  await click('main table tbody button.font-mono', 'Changes-requested review', 3200)
  await closeOverlay()
  await wait(300)
  await nav('/revisions', 'Правки', 2000)
  await click('button:has-text("Завершённые")', 'Tab Завершённые', 2400)

  // 7. Render + assets
  await sub('Шаг 7 — Очередь рендера и библиотека ассетов')
  await nav('/render', 'Очередь рендера', 2600)
  await scroll(500, 1400)
  await nav('/assets', 'Библиотека ассетов', 2600)
  await scroll(500, 1400)

  // 8. Documents
  await sub('Шаг 8 — Документы и медиа проекта')
  await nav('/documents', 'Документы', 2400)
  await click('button:has-text("Посмотреть галерею")', 'Gallery', 2800)
  await scroll(500, 1400)
  await closeOverlay()

  // 9. Finance
  await sub('Шаг 9 — Финансы: бюджет, счета, расходы')
  await group('Финансы')
  await nav('/finance', 'Финансовый обзор', 2800)
  await nav('/finance/invoices', 'Счета', 2400)
  await nav('/finance/expenses', 'Расходы', 2400)
  await scroll(400, 1200)

  // 10. Reports
  await sub('Шаг 10 — Отчёты: производство, финансы, время, клиенты')
  await group('Отчёты')
  await nav('/reports/production', 'Отчёт: производство', 2800)
  await scroll(500, 1400)
  await nav('/reports/financial', 'Отчёт: финансы', 2800)
  await scroll(500, 1400)
  await nav('/reports/time', 'Отчёт: время', 2800)
  await scroll(500, 1400)
  await nav('/reports/clients', 'Отчёт: клиенты', 2600)

  // 11. Team
  await sub('Шаг 11 — Команда, загрузка и учёт времени')
  await group('Команда')
  await nav('/team/employees', 'Сотрудники', 2600)
  await scroll(400, 1200)
  await nav('/team/workload', 'Загрузка команды', 2600)
  await nav('/timesheets', 'Учёт времени', 2600)

  // 12. Timeline + activity
  await sub('Шаг 12 — Таймлайн и лента событий')
  await nav('/timeline', 'Таймлайн', 2800)
  await scroll(600, 1500)
  await nav('/activity', 'Лента событий', 2600)
  await scroll(600, 1500)

  // 13. Settings
  await sub('Шаг 13 — Настройки студии')
  await nav('/settings', 'Настройки', 2400)
  await click('button:has-text("Шаблоны пайплайна")', 'Tab Шаблоны', 2200)
  await click('button:has-text("Пользователи и роли")', 'Tab Пользователи', 2400)

  // 14. Finale
  await sub('Проект AST-001 сдан на два дня раньше срока. Спасибо за внимание!')
  await nav('/dashboard', 'Панель управления', 3500)
  await sub('')
  await wait(1000)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(REHEARSAL
    ? { viewport: SIZE, locale: 'ru-RU' }
    : { viewport: SIZE, locale: 'ru-RU', recordVideo: { dir: OUT_DIR, size: SIZE } })
  page = await context.newPage()
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
        const dest = path.join(OUT_DIR, OUTPUT_NAME)
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
        console.log('Video saved:', dest, Math.round(fs.statSync(dest).size / 1024) + ' KB')
      }
    }
    await browser.close()
    console.log(REHEARSAL ? (failures ? 'REHEARSAL FAILED (' + failures + ')' : 'REHEARSAL PASSED') : 'RECORDING DONE, warnings: ' + failures)
    process.exit(failures && REHEARSAL ? 1 : 0)
  }
})()

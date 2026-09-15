'use strict'
/* Demo helpers from the ui-demo skill: cursor overlay, subtitles, slow input. */

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    cursor.style.cssText = 'position:fixed;z-index:999999;pointer-events:none;width:26px;height:26px;transition:left .08s,top .08s;filter:drop-shadow(1px 1px 2px rgba(0,0,0,.35));left:0;top:0'
    document.body.appendChild(cursor)
    document.addEventListener('mousemove', e => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px' })
  })
}

async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-subtitle')) return
    const bar = document.createElement('div')
    bar.id = 'demo-subtitle'
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:999998;text-align:center;padding:12px 24px;background:rgba(0,0,0,.78);color:#fff;font-family:-apple-system,"Segoe UI",sans-serif;font-size:17px;font-weight:500;letter-spacing:.3px;transition:opacity .3s;pointer-events:none;opacity:0'
    document.body.appendChild(bar)
  })
}

async function hideDevtools(page) {
  await page.addStyleTag({ content: '#nuxt-devtools-container, nuxt-devtools-inspect-panel, #vue-tracer-overlay { display: none !important; }' }).catch(() => {})
}

async function overlays(page) {
  await hideDevtools(page)
  await injectCursor(page)
  await injectSubtitleBar(page)
}

async function showSubtitle(page, text) {
  await page.evaluate(t => {
    const bar = document.getElementById('demo-subtitle')
    if (!bar) return
    if (t) { bar.textContent = t; bar.style.opacity = '1' } else bar.style.opacity = '0'
  }, text)
  if (text) await page.waitForTimeout(900)
}

async function ensureVisible(page, locator, label) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator
  const visible = await el.isVisible().catch(() => false)
  if (!visible) {
    console.error('REHEARSAL FAIL: "' + label + '" not found — ' + (typeof locator === 'string' ? locator : '(locator)'))
    const found = await page.evaluate(() => Array.from(document.querySelectorAll('button, a, [role="tab"]')).filter(e => e.offsetParent !== null).map(e => e.tagName + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"').slice(0, 40).join('\n  '))
    console.error('  visible:\n  ' + found)
    return false
  }
  console.log('REHEARSAL OK: "' + label + '"')
  return true
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 900, ...clickOpts } = opts
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator
  const visible = await el.isVisible().catch(() => false)
  if (!visible) { console.error('WARNING: moveAndClick skipped — "' + label + '" not visible'); return false }
  try {
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    const box = await el.boundingBox()
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 14 }); await page.waitForTimeout(350) }
    await el.click(clickOpts)
  } catch (e) { console.error('WARNING: moveAndClick failed on "' + label + '": ' + e.message); return false }
  await page.waitForTimeout(postClickDelay)
  return true
}

async function typeSlowly(page, locator, text, label, charDelay = 40) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator
  if (!(await el.isVisible().catch(() => false))) { console.error('WARNING: typeSlowly skipped — "' + label + '"'); return false }
  await moveAndClick(page, el, label, { postClickDelay: 300 })
  await el.fill('')
  await el.pressSequentially(text, { delay: charDelay })
  await page.waitForTimeout(400)
  return true
}

async function smoothScroll(page, top, pause = 1400) {
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), top)
  await page.waitForTimeout(pause)
}

async function panElements(page, selector, maxCount = 6, pause = 550) {
  const elements = await page.locator(selector).all()
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox()
      if (box && box.y < 700 && box.y > 0) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 }); await page.waitForTimeout(pause) }
    } catch (e) { console.warn('WARNING: panElements skipped ' + i + ': ' + e.message) }
  }
}

module.exports = { overlays, injectCursor, injectSubtitleBar, showSubtitle, ensureVisible, moveAndClick, typeSlowly, smoothScroll, panElements }

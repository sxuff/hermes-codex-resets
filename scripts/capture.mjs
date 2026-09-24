// Captures the README screenshots and the catalog banner from the browser demo.
// Live data comes from codex-resets.com; every reset "landed" here is simulated by the demo.
// Usage: npm run capture   (needs `npx playwright install chromium` once)
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { serve } from './serve.mjs'

const OUT = 'artifacts'
await mkdir(OUT, { recursive: true })
const server = await serve(0)
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const wait = ms => page.waitForTimeout(ms)
const shot = async (name, opts = {}) => { await page.screenshot({ path: `${OUT}/${name}.png`, ...opts }); console.log(`${OUT}/${name}.png`) }
// Bounding box around several elements, padded, clamped to the viewport.
const around = (selectors, pad = 24) => page.evaluate(([selectors, pad]) => {
  const rs = selectors.map(s => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean)
  const x = Math.max(0, Math.min(...rs.map(r => r.left)) - pad), y = Math.max(0, Math.min(...rs.map(r => r.top)) - pad)
  const right = Math.min(innerWidth, Math.max(...rs.map(r => r.right)) + pad), bottom = Math.min(innerHeight, Math.max(...rs.map(r => r.bottom)) + pad)
  return { x, y, width: right - x, height: bottom - y }
}, [selectors, pad])
const land = type => page.evaluate(t => [...document.querySelectorAll('.dev button')].find(b => b.textContent === `Land a ${t} reset`).click(), type)
const closeCard = async () => { await page.keyboard.press('Escape'); await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(700, 300); await wait(450) }

await page.goto(`${base}/demo/`)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => { const c = document.querySelector('.cr-sb'); return c && !c.textContent.includes('…') })
await page.evaluate(() => document.fonts.ready)
await wait(800)

// Status card, opened from the chip.
await page.click('.cr-sb')
await wait(1000)
await page.evaluate(() => document.activeElement?.blur())
await shot('hero', { clip: { x: 322, y: 0, width: 1118, height: 900 } })
await shot('card', { clip: await around(['.cr-dock', '.cr-sb']) })
await closeCard()

// History page.
await page.evaluate(() => window.__cr.run('hermes-codex-resets.history'))
await page.waitForSelector('.cr-hist-row')
await wait(1200)
await shot('history', { clip: { x: 232, y: 34, width: 1208, height: 842 } })
await page.evaluate(() => window.__cr.host.navigate('/'))
await wait(400)

// A watch: Tibo hinted, the forecast says 62%.
await page.selectOption('.dev select', 'watch')
await wait(5600) // let the one-off toast pass
await page.click('.cr-sb')
await page.evaluate(() => document.activeElement?.blur())
await wait(1000)
await shot('watch', { clip: await around(['.cr-dock', '.cr-sb']) })
await closeCard()
await page.selectOption('.dev select', 'live')
await wait(800)

// A regular reset lands.
await page.evaluate(() => document.activeElement?.blur())
await land('regular')
await wait(1900)
await page.locator('.cr-dock').screenshot({ path: `${OUT}/card-reset.png` })
await shot('reset', { clip: await around(['.cr-dock', '.cr-sb']) })
await closeCard()

// A banked reset lands.
await land('banked')
await wait(1900)
await shot('banked', { clip: await around(['.cr-dock', '.cr-sb']) })
await closeCard()

// A reset lands while you type: only the chip reacts.
await page.click('.composer textarea')
await page.keyboard.type('Also batch the shadow pass so it', { delay: 25 })
await land('regular')
await wait(900)
const composer = await page.locator('.composer').boundingBox()
await shot('typing', { clip: { x: composer.x, y: composer.y - 16, width: 1440 - composer.x, height: 900 - composer.y + 16 } })

// Catalog banner, 2:1.
const banner = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 2 })
await banner.goto(`${base}/scripts/banner.html`)
await banner.evaluate(() => document.fonts.ready)
await banner.waitForFunction(() => document.querySelector('.card').complete)
await banner.waitForTimeout(400)
await banner.screenshot({ path: `${OUT}/banner.png` })
console.log(`${OUT}/banner.png`)

await browser.close()
server.close()

// Bakes the clip's inputs from the real plugin so the render is offline and deterministic:
// the dithered wing canvases (idle + flared) for the card and the page header, the local
// font files, and a snapshot of the reset history.
// Usage (from launch/): node scripts/make-assets.mjs
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { serve } from '../../scripts/serve.mjs'

const OUT = new URL('../assets/', import.meta.url)
await mkdir(new URL('fonts/', OUT), { recursive: true })

// Fonts: Antonio 200 and Barlow Condensed 500, latin subset, as woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
for (const [family, weight, file] of [['Antonio', 200, 'antonio-200.woff2'], ['Barlow Condensed', 500, 'barlow-condensed-500.woff2']]) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&display=swap`, { headers: { 'user-agent': UA } })).text()
  const latin = css.split('/* latin */')[1] ?? css
  const url = latin.match(/url\((https:[^)]+\.woff2)\)/)[1]
  await writeFile(new URL(`fonts/${file}`, OUT), Buffer.from(await (await fetch(url)).arrayBuffer()))
  console.log('font', file)
}

// History snapshot.
const hist = await (await fetch('https://codex-resets.com/api/v1/resets?limit=100')).json()
const status = await (await fetch('https://codex-resets.com/api/v1/status')).json()
await writeFile(new URL('history.json', OUT), JSON.stringify({ capturedAt: new Date().toISOString(), total: status.data.stats.total, avg: status.data.stats.avg_interval_days, rows: hist.data.slice(0, 10) }, null, 2))
console.log('history.json')

// Dither canvases from the running plugin.
const server = await serve(0)
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })
const savePng = async (sel, name) => {
  const data = await page.evaluate(s => document.querySelector(s).toDataURL('image/png'), sel)
  await writeFile(new URL(name, OUT), Buffer.from(data.split(',')[1], 'base64'))
  console.log(name)
}
await page.goto(`${base}/demo/`)
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForFunction(() => !document.querySelector('.cr-sb')?.textContent.includes('…'))
await page.click('.cr-sb')
await page.waitForTimeout(1500)
await savePng('.cr-dock canvas', 'wing-idle.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
await page.evaluate(() => [...document.querySelectorAll('.dev button')].find(b => b.textContent === 'Land a regular reset').click())
await page.waitForTimeout(2600)
await savePng('.cr-dock canvas', 'wing-flare.png')
await page.keyboard.press('Escape')
await page.evaluate(() => window.__cr.run('hermes-codex-resets.history'))
await page.waitForSelector('.cr-host canvas')
await page.waitForTimeout(1500)
await savePng('.cr-host canvas', 'page-dither.png')
await browser.close()
server.close()

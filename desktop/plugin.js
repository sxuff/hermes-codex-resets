// Codex Resets — a Hermes Desktop plugin.
// https://github.com/sxuff/hermes-codex-resets · MIT
// Data from https://codex-resets.com — free, no key, attribution required (shown on the card).

import {
  host, atom, useValue, useQuery,
  STATUSBAR_AREAS, ROUTES_AREA, PALETTE_AREA
} from '@hermes/plugin-sdk'
import { useEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'hermes-codex-resets'
const API = 'https://codex-resets.com/api/v1'
const SITE = 'https://codex-resets.com'
const ROUTE = '/codex-resets'
const POLL_MS = 60_000
const FRESH_MS = 30 * 60_000          // chip stays yellow this long after a reset
const REPLAY_WINDOW_MS = 7 * 864e5    // resets older than this are never announced
const TYPING_MS = 8_000               // typed this recently in a text field = mid-thought, don't pop the card
const DEFER_MAX_MS = 10 * 60_000      // give up on showing a deferred card after this long
const MOMENT_HOLD_MS = 5_200

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------- state ----------

const $status = atom(null)   // last good `data` from /status
const $error = atom(null)
const $now = atom(Date.now()) // ticks every minute so relative labels refresh
const $pulse = atom(null)     // chip-only moment while you're typing
const $dockOpen = atom(false)

const livePanels = new Set()
let chipEl = null
let dock = null
let pendingAway = null
let pendingCalm = null
let pulseTimer = 0
let lastKeyAt = 0

// ---------- helpers ----------

const sleep = ms => new Promise(r => setTimeout(r, ms))
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const pad3 = n => String(n).padStart(3, '0')
const daysSince = iso => (Date.now() - Date.parse(iso)) / 864e5
const sinceLabel = d => { const h = Math.max(0, Math.round(d * 24)); return `${Math.floor(h / 24)}D ${String(h % 24).padStart(2, '0')}H` }
const fmtWhen = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const clip = (t, n) => t.length > n ? t.slice(0, n).replace(/\s\S*$/, '') + '…' : t
const cleanText = t => t.replace(/https:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim()
// Tibo often buries the reset in sentence four of a launch tweet — quote that sentence, not the opener.
const resetSentence = t => { const c = cleanText(t); return c.split(/(?<=[.!?])\s+/).find(s => /reset/i.test(s)) || c }
const isFresh = r => !!r && Date.now() - Date.parse(r.announced_at) < FRESH_MS
const isEditable = el => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
const isAway = () => document.hidden || !document.hasFocus()
const isTyping = () => isEditable(document.activeElement) && Date.now() - lastKeyAt < TYPING_MS

function hintText(s) {
  if (s.scheduled_reset) return `Scheduled · ${s.scheduled_reset.scheduled_for ? fmtWhen(s.scheduled_reset.scheduled_for) : 'reset announced'}`
  if (s.active_watch) {
    const p = s.active_watch.reset_chance_percent
    return `Watch · ${p != null ? `${p}% chance` : 'Tibo hinted at a reset'}`
  }
  return ''
}

// "Next expected ~6d" / "2d past average", or '' when there's nothing to go on.
function cadenceText(s) {
  const r = s.latest_reset, avg = s.stats?.avg_interval_days
  if (!r || !avg) return ''
  const left = avg - daysSince(r.announced_at)
  return left >= 0 ? `Next expected ~${Math.max(1, Math.round(left))}d` : `${Math.round(-left)}d past average`
}

async function fetchStatus() {
  const res = await fetch(`${API}/status`)
  if (!res.ok) throw new Error(`codex-resets.com answered ${res.status}`)
  return (await res.json()).data
}

async function fetchHistory() {
  const rows = []
  let cursor = null
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${API}/resets?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    if (!res.ok) throw new Error(`codex-resets.com answered ${res.status}`)
    const json = await res.json()
    rows.push(...json.data)
    if (!json.pagination?.has_more) break
    cursor = json.pagination.next_cursor
  }
  return rows
}

// ---------- the panel (vanilla DOM; `dock` is the small card at the chip, `page` the history page header) ----------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16)

function createPanel(root, { openExternal, variant = 'page', onHistory }) {
  const dockish = variant === 'dock'
  const cell = dockish ? 2 : 3
  const el = document.createElement('div')
  el.className = `cr-panel cr-panel--${variant}`
  el.innerHTML = `
    <canvas class="cr-dither"></canvas>
    <div class="cr-row cr-top"><span data-k="top">Codex / Resets</span>${dockish ? '<button type="button" class="cr-link" data-k="hist">History →</button>' : '<span data-k="meta"></span>'}</div>
    <div class="cr-main" data-k="main"><div class="cr-big" data-k="big">—</div><div class="cr-sub" data-k="sub">Waiting for codex-resets.com</div><div class="cr-quote" data-k="quote"></div></div>
    <div class="cr-quote cr-quote-ev" data-k="quoteEv"></div>
    <div class="cr-row cr-bottom"><span class="cr-chips"><span class="cr-chip" data-k="chip"></span><span class="cr-chip cr-watch" data-k="watch"></span></span><a class="cr-credit" href="${SITE}" data-k="credit">Data from Codex Resets</a></div>
    <div class="cr-flood"><div class="cr-word" data-k="word"></div><div class="cr-row"><span data-k="f1"></span><span data-k="f2"></span><span data-k="f3"></span></div></div>`
  root.appendChild(el)
  const $ = k => el.querySelector(`[data-k="${k}"]`)
  $('credit').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openExternal(SITE) })
  $('hist')?.addEventListener('click', e => { e.stopPropagation(); onHistory?.() })

  // Dithered wing: drawn to a small offscreen canvas, Bayer-dithered, scaled up with hard pixels.
  const canvas = el.querySelector('canvas'), g = canvas.getContext('2d')
  const small = document.createElement('canvas'), sg = small.getContext('2d', { willReadFrequently: true })
  const fx = { gain: .55, target: .55, flare: 0, flareT: 0, amp: 0, grain: null, w: 0, h: 0, dpr: 1, dirty: true }
  const ro = new ResizeObserver(() => {
    fx.dpr = devicePixelRatio || 1; fx.w = canvas.clientWidth; fx.h = canvas.clientHeight
    canvas.width = fx.w * fx.dpr; canvas.height = fx.h * fx.dpr; fx.dirty = true
  })
  ro.observe(canvas)

  let raf = 0, last = 0, alive = true, run = 0, playing = false, status = null
  const settled = () => fx.flareT === 0 && fx.amp < .01 && Math.abs(fx.gain - fx.target) < .01 && fx.flare < .01

  function draw(now) {
    const gw = Math.ceil(fx.w / cell), gh = Math.ceil(fx.h / cell), S = gh / 107
    if (small.width !== gw || small.height !== gh || !fx.grain) {
      small.width = gw; small.height = gh
      fx.grain = Float32Array.from({ length: gw * gh }, () => Math.random() - .5)
    }
    if (REDUCED) { fx.gain = fx.target; fx.flare = fx.flareT; fx.amp = 0 }
    else { fx.gain += (fx.target - fx.gain) * .05; fx.flare += (fx.flareT - fx.flare) * .05; fx.amp *= .985 }
    sg.fillStyle = '#000'; sg.fillRect(0, 0, gw, gh)
    const halo = sg.createRadialGradient(gw * .78, gh * .42, 0, gw * .78, gh * .42, gh * .9)
    halo.addColorStop(0, 'rgba(255,255,255,.28)'); halo.addColorStop(1, 'rgba(255,255,255,0)')
    sg.fillStyle = halo; sg.fillRect(0, 0, gw, gh)
    sg.save(); sg.translate(gw * .86, gh * (dockish ? .44 : .56))
    sg.rotate(REDUCED ? 0 : Math.sin(now / 1700) * .03 + Math.sin(now / 110) * fx.amp)
    const feather = (a, L, ry, hi) => {
      sg.save(); sg.rotate(a * Math.PI / 180)
      const gr = sg.createLinearGradient(0, -ry, 0, ry)
      gr.addColorStop(0, `rgba(255,255,255,${hi})`); gr.addColorStop(1, `rgba(255,255,255,${hi * .25})`)
      sg.beginPath(); sg.ellipse(L / 2, 0, L / 2, ry, 0, 0, Math.PI * 2); sg.fillStyle = gr; sg.fill()
      sg.strokeStyle = 'rgba(0,0,0,.45)'; sg.lineWidth = .8; sg.beginPath(); sg.moveTo(2, 0); sg.lineTo(L * .92, 0); sg.stroke()
      sg.restore()
    }
    for (let i = 0; i < 10; i++) feather(-178 + i * 10, (100 - i * 5.5) * S, 6.5 * S, .95)
    for (let i = 0; i < 8; i++) feather(-170 + i * 11, (52 - i * 2.5) * S, 5.5 * S, 1)
    for (let i = 0; i < 6; i++) feather(-160 + i * 13, (28 - i) * S, 5 * S, 1)
    const sh = sg.createRadialGradient(0, 0, 0, 0, 0, 16 * S)
    sh.addColorStop(0, 'rgba(255,255,255,.9)'); sh.addColorStop(1, 'rgba(255,255,255,0)')
    sg.fillStyle = sh; sg.beginPath(); sg.arc(0, 0, 16 * S, 0, Math.PI * 2); sg.fill()
    sg.restore()
    const img = sg.getImageData(0, 0, gw, gh), d = img.data, f = fx.flare
    const P = [[0, 0, 242], [38, 38, 246], [Math.round(105 + 137 * f), Math.round(105 + 137 * f), Math.round(248 - 6 * f)]]
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x, i = k * 4, t = BAYER[(y & 3) * 4 + (x & 3)]
      const v = (d[i] / 255 * fx.gain + fx.grain[k] * .22) * 2
      const c = P[v > 1 + t ? 2 : v > t ? 1 : 0]
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255
    }
    sg.putImageData(img, 0, 0)
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false
    g.drawImage(small, 0, 0, gw, gh, 0, 0, gw * cell * fx.dpr, gh * cell * fx.dpr)
  }

  // ~11 fps while calm, 60 fps only during a reset; nothing at all while hidden or with reduced motion.
  function frame(now) {
    if (!alive) return
    raf = requestAnimationFrame(frame)
    if (!fx.w || document.hidden) return
    const every = REDUCED ? Infinity : settled() ? 90 : 16
    if (!fx.dirty && now - last < every) return
    fx.dirty = false; last = now
    draw(now)
  }
  raf = requestAnimationFrame(frame)

  function renderIdle() {
    if (playing) return
    const s = status
    if (!s) return
    const r = s.latest_reset, days = r ? daysSince(r.announced_at) : null, cadence = cadenceText(s)
    $('top').textContent = 'Codex / Resets'
    $('big').textContent = days == null ? '—' : sinceLabel(days)
    $('sub').innerHTML = r ? `Since last reset <em>·</em> ${esc(r.reset_type)} <em>·</em> ${esc(fmtWhen(r.announced_at))}` : 'No resets logged yet'
    $('quote').textContent = r ? `“${clip(resetSentence(r.text), 110)}” — @thsottiaux` : ''
    if (!dockish) {
      const avg = s.stats?.avg_interval_days
      $('meta').textContent = [`${s.stats?.total ?? 0} logged`, avg && `avg ${Math.round(avg)}d`, cadence.toLowerCase()].filter(Boolean).join(' · ')
    }
    // The card has no room for a meta row, so its status chip carries the cadence instead.
    $('chip').textContent = isFresh(r) ? 'Fresh limits' : dockish ? (cadence || 'Nominal') : 'Status · Nominal'
    const w = $('watch'), hint = hintText(s)
    w.textContent = hint; w.classList.toggle('on', !!hint)
    w.title = s.active_watch && !s.scheduled_reset ? 'AI-classified forecast from codex-resets.com, not an official OpenAI commitment.' : ''
  }
  const tick = setInterval(renderIdle, 60_000)

  return {
    el,
    update(s) { status = s; renderIdle() },
    // Plays the flood. Resolves when the panel is back to idle.
    async play(reset, { number, away = false, hold = 7000 } = {}) {
      const id = ++run, banked = reset.reset_type === 'banked'
      playing = true
      el.classList.remove('go'); el.classList.toggle('bankmode', banked)
      $('word').innerHTML = [...(banked ? 'BANKED' : 'RESET')].map((c, i) => `<span style="transition-delay:${.3 + i * .06}s">${c}</span>`).join('')
      const no = `No. ${pad3(number ?? (status?.stats?.total ?? 0))}`
      $('f1').textContent = dockish ? `${no} · ${fmtTime(reset.announced_at)}` : `${no} · ${banked ? 'Banked' : 'Regular'}`
      $('f2').textContent = banked ? (dockish ? '+1 reset stored' : '+1 reset stored · spend it when you hit a limit') : (dockish ? 'Limits back to 100%' : 'Limits back to 100% · all plans')
      $('f3').textContent = `@thsottiaux · ${fmtTime(reset.announced_at)}`
      $('quoteEv').innerHTML = `<span>“${esc(clip(resetSentence(reset.text), dockish ? 72 : 110))}” — @thsottiaux</span>`
      $('top').textContent = away ? 'While you were away' : 'Incoming · @thsottiaux'
      fx.target = 1.25; fx.flareT = 1; fx.amp = .35; fx.dirty = true
      $('main').style.opacity = 0
      await sleep(dockish ? 350 : 550); if (id !== run || !alive) return
      void el.offsetWidth; el.classList.add('go')
      await sleep(hold); if (id !== run || !alive) return
      el.classList.remove('go'); fx.target = .55; fx.flareT = 0
      await sleep(500); if (id !== run || !alive) return
      playing = false; $('main').style.opacity = 1; renderIdle()
    },
    destroy() { alive = false; run++; cancelAnimationFrame(raf); clearInterval(tick); ro.disconnect(); el.remove() }
  }
}

// ---------- the card that grows out of the chip ----------

function positionDock() {
  if (!dock) return
  const r = chipEl?.isConnected ? chipEl.getBoundingClientRect() : null
  dock.el.style.right = `${r ? Math.max(8, window.innerWidth - r.right) : 8}px`
  dock.el.style.bottom = `${r ? window.innerHeight - r.top + 6 : 30}px`
}

function closeDock() {
  if (!dock) return
  const d = dock
  dock = null
  clearTimeout(d.timer)
  $dockOpen.set(false)
  d.el.classList.remove('in')
  setTimeout(() => { d.panel.destroy(); d.el.remove() }, 250)
}

// mode 'status': opened by a click, stays until you click away or press Esc.
// mode 'moment': rises by itself for a reset and sinks back into the chip unless you hover or click it.
function openDock(ctx, mode, reset, opts = {}) {
  if (!dock) {
    const el = document.createElement('div')
    el.className = 'cr-dock'
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
    const panel = createPanel(el, { openExternal: url => ctx.os.openExternal(url), variant: 'dock', onHistory: () => { closeDock(); openHistory() } })
    panel.update($status.get())
    dock = { el, panel, sticky: false, timer: 0 }
    const d = dock
    el.addEventListener('mouseenter', () => clearTimeout(d.timer))
    el.addEventListener('mouseleave', () => { if (dock === d && !d.sticky) d.timer = setTimeout(closeDock, 2500) })
    el.addEventListener('click', () => { d.sticky = true; clearTimeout(d.timer) })
    positionDock()
    requestAnimationFrame(() => el.classList.add('in'))
  }
  $dockOpen.set(true)
  clearTimeout(dock.timer)
  if (mode === 'status') dock.sticky = true
  if (reset) {
    dock.panel.play(reset, { ...opts, hold: MOMENT_HOLD_MS })
    if (!dock.sticky) dock.timer = setTimeout(closeDock, 350 + MOMENT_HOLD_MS + 700)
  }
}

function toggleDock(ctx) {
  if (!dock) return openDock(ctx, 'status')
  if (dock.sticky) return closeDock()
  dock.sticky = true; clearTimeout(dock.timer) // clicking the chip mid-moment keeps the card open
}

// ---------- reset moments ----------

function pulseChip(reset) {
  const banked = reset.reset_type === 'banked'
  $pulse.set({ banked, label: banked ? 'Banked reset · +1 stored' : 'Reset · limits back to 100%' })
  clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => $pulse.set(null), 8000)
}

function playMoment(ctx, reset, opts = {}) {
  // Already on the history page: play it there instead of adding a card.
  if (livePanels.size) { for (const p of livePanels) p.play(reset, opts); return }
  if (isTyping()) {
    // Mid-sentence: only the chip reacts. The card rises once you pause.
    pulseChip(reset)
    pendingCalm = { reset, opts, since: Date.now() }
    return
  }
  openDock(ctx, 'moment', reset, opts)
}

function announce(ctx, reset, number) {
  if (isAway()) {
    ctx.os.notify({
      title: reset.reset_type === 'banked' ? 'Banked Codex reset' : 'Codex limits reset',
      body: clip(resetSentence(reset.text), 120),
      onActivate: () => openDock(ctx, 'status')
    })
    pendingAway = { reset, number } // replayed once you come back to Hermes
    return
  }
  playMoment(ctx, reset, { number })
}

// ---------- polling ----------

async function poll(ctx) {
  let data
  try { data = await fetchStatus() } catch (err) { $error.set(err.message || String(err)); return }
  $error.set(null)
  $status.set(data)
  for (const p of livePanels) p.update(data)
  dock?.panel.update(data)

  const r = data.latest_reset
  if (r) {
    // Only a reset newer than the last one we saw counts, so an upstream correction never replays an old one.
    const seenAt = ctx.storage.get('lastSeenAt', null), at = Date.parse(r.announced_at)
    if (seenAt === null || at > seenAt) ctx.storage.set('lastSeenAt', at)
    if (seenAt !== null && at > seenAt && Date.now() - at < REPLAY_WINDOW_MS) announce(ctx, r, data.stats?.total)
  }

  // A watch or schedule is a heads-up, not an event: one quiet in-app toast per hint.
  const hintKey = data.scheduled_reset ? `sched:${data.scheduled_reset.id}` : data.active_watch ? `watch:${data.active_watch.observed_at}` : null
  if (hintKey && ctx.storage.get('lastHint', null) !== hintKey) {
    ctx.storage.set('lastHint', hintKey)
    host.notify({ kind: 'info', title: 'Codex resets', message: hintText(data) })
  }
}

function openHistory() {
  host.navigate(ROUTE)
}

function sampleReset(type) {
  const latest = $status.get()?.latest_reset
  const text = latest?.reset_type === type ? latest.text
    : type === 'banked' ? 'We are loading a banked reset into all accounts of our Plus, Pro and Business users.'
    : 'Reset all propagated. Sweet dreams.'
  return { id: `preview-${Date.now()}`, reset_type: type, announced_at: new Date().toISOString(), text }
}

// ---------- React surfaces ----------

function chipState(s, err) {
  if (!s) return { tone: 'idle', label: err ? 'Codex · offline' : 'Codex · …', title: err || 'Loading Codex reset status' }
  const r = s.latest_reset, avg = s.stats?.avg_interval_days
  const title = r ? `Last Codex reset: ${r.reset_type}, ${fmtWhen(r.announced_at)}` : 'Codex resets'
  if (isFresh(r)) return { tone: 'fresh', label: r.reset_type === 'banked' ? 'Banked reset · +1' : 'Reset · fresh limits', title }
  const hint = hintText(s)
  if (hint) return { tone: 'watch', label: hint, title }
  if (!r) return { tone: 'idle', label: 'Codex · no resets', title }
  const days = daysSince(r.announced_at), over = avg && days > avg
  return { tone: over ? 'overdue' : 'idle', label: `Codex · ${sinceLabel(days)}${over ? ` · +${Math.round(days - avg)}d` : ''}`, title }
}

function Chip({ onClick }) {
  const s = useValue($status), err = useValue($error), pulse = useValue($pulse), open = useValue($dockOpen)
  useValue($now)
  const st = pulse ? { tone: 'pulse', label: pulse.label, title: '' } : chipState(s, err)
  return jsxs('button', {
    type: 'button',
    ref: el => { chipEl = el },
    className: `cr-sb cr-sb--${st.tone}${pulse?.banked ? ' cr-sb--banked' : ''}${open ? ' cr-sb--open' : ''}`,
    title: st.title,
    'aria-expanded': open,
    onClick,
    children: [jsx('i', { className: 'cr-sb-mark', 'aria-hidden': true }), st.label]
  })
}

function PanelHost({ openExternal }) {
  const ref = useRef(null)
  useEffect(() => {
    const panel = createPanel(ref.current, { openExternal })
    panel.update($status.get())
    livePanels.add(panel)
    return () => { livePanels.delete(panel); panel.destroy() }
  }, [])
  return jsx('div', { ref, className: 'cr-host' })
}

function History({ openExternal }) {
  const q = useQuery({ queryKey: [ID, 'history'], queryFn: fetchHistory, staleTime: 5 * 60_000 })
  if (q.isLoading) return jsx('div', { className: 'cr-hist-note', children: 'Loading history…' })
  if (q.error || !q.data) return jsx('div', { className: 'cr-hist-note', children: "Couldn't load the reset history. It'll retry next time you open this page." })
  const rows = q.data
  return jsxs('div', {
    className: 'cr-hist',
    children: [
      jsxs('div', { className: 'cr-hist-head', children: [jsx('span', { children: 'History' }), jsx('span', { children: `${rows.length} resets` })] }),
      ...rows.map((r, i) => {
        const prev = rows[i + 1]
        const gap = prev ? (Date.parse(r.announced_at) - Date.parse(prev.announced_at)) / 864e5 : null
        return jsxs('button', {
          type: 'button',
          className: 'cr-hist-row',
          title: r.source?.url ? 'Open the post' : undefined,
          onClick: () => r.source?.url && openExternal(r.source.url),
          children: [
            jsx('span', { className: 'cr-hist-no', children: pad3(rows.length - i) }),
            jsx('span', { className: `cr-hist-type cr-hist-type--${r.reset_type}`, children: r.reset_type }),
            jsx('span', { className: 'cr-hist-when', children: fmtWhen(r.announced_at) }),
            jsx('span', { className: 'cr-hist-gap', children: gap == null ? '' : `+${gap.toFixed(1)}d` }),
            jsx('span', { className: 'cr-hist-text', children: clip(resetSentence(r.text), 140) })
          ]
        }, r.id)
      })
    ]
  })
}

function Page({ openExternal }) {
  return jsxs('div', { className: 'cr-page', children: [jsx(PanelHost, { openExternal }), jsx(History, { openExternal })] })
}

// ---------- styles ----------

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Antonio:wght@200&family=Barlow+Condensed:wght@500&family=IBM+Plex+Mono&display=swap');
.cr-panel {
  --cr-blue: #0000f2; --cr-white: #f2f2f2; --cr-yellow: #f2f200; --cr-cyan: #00f2f2;
  --cr-display: "Rules Gothic Compressed", "Antonio", "Arial Narrow", sans-serif;
  --cr-cond: "Rules Condensed", "Barlow Condensed", "Arial Narrow", sans-serif;
  --cr-mono: "IBM Plex Mono", ui-monospace, monospace;
  position: relative; height: 100%; overflow: hidden; container-type: inline-size;
  background: var(--cr-blue); color: var(--cr-white); font-family: var(--cr-cond);
}
.cr-dither { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.cr-row { position: absolute; left: 18px; right: 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; font: 500 12px var(--cr-cond); letter-spacing: 1.4px; text-transform: uppercase; }
.cr-top { top: 14px; } .cr-bottom { bottom: 14px; }
.cr-top > :last-child { transition: opacity .3s; }
.cr-panel.go .cr-top > :last-child { opacity: 0; }
.cr-chips { display: flex; gap: 8px; min-width: 0; }
.cr-chip { padding: 5px 9px; white-space: nowrap; box-shadow: inset 0 0 0 .5px var(--cr-white); background: rgba(242,242,242,.12); }
.cr-watch { display: none; background: var(--cr-yellow); color: var(--cr-blue); box-shadow: none; }
.cr-watch.on { display: inline-block; }
.cr-credit { font: 400 10px var(--cr-mono); letter-spacing: .5px; color: inherit; opacity: .75; text-decoration: none; text-transform: none; white-space: nowrap; }
.cr-credit:hover { opacity: 1; text-decoration: underline; }
.cr-link { padding: 0; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; cursor: pointer; }
.cr-link:hover { text-decoration: underline; }
.cr-main { position: absolute; left: 18px; right: 18px; top: 50%; transform: translateY(-54%); transition: opacity .3s; }
.cr-big { font: 200 clamp(72px, 17cqw, 132px)/.9 var(--cr-display); letter-spacing: -2px; text-transform: uppercase; }
.cr-sub { margin-top: 8px; font: 500 13px var(--cr-cond); letter-spacing: 1.4px; text-transform: uppercase; }
.cr-sub em { font-style: normal; opacity: .6; }
.cr-quote { margin-top: 14px; max-width: 520px; font: 400 12px/1.5 var(--cr-mono); letter-spacing: .2px; opacity: .78; }
.cr-quote-ev { position: absolute; left: 18px; right: 18px; top: 50%; transform: translateY(-100%); margin: 0; padding-bottom: 22px; opacity: 0; transition: opacity .4s .5s; }
.cr-panel.go .cr-quote-ev { opacity: 1; }
.cr-quote-ev span { padding: 1px 4px; background: var(--cr-blue); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.cr-flood { position: absolute; left: 0; right: 0; bottom: 0; height: 50%; background: var(--cr-yellow); color: var(--cr-blue); clip-path: inset(100% 0 0 0); transition: clip-path .55s cubic-bezier(.7,0,.2,1); }
.cr-panel.go .cr-flood { clip-path: inset(0 0 0 0); }
.cr-panel.bankmode .cr-flood { background: var(--cr-cyan); }
.cr-word { position: absolute; left: 12px; bottom: 44px; display: flex; font: 200 clamp(80px, 18cqw, 136px)/.8 var(--cr-display); letter-spacing: -3px; }
.cr-word span { display: inline-block; transform: scaleY(0); transform-origin: bottom; transition: transform .5s cubic-bezier(.2,.9,.1,1); }
.cr-panel.go .cr-word span { transform: scaleY(1); }
.cr-flood .cr-row { bottom: 12px; font: 400 11px var(--cr-mono); letter-spacing: .4px; }

/* the small card at the chip */
.cr-dock { position: fixed; z-index: 2147483000; width: 360px; height: 190px; max-width: calc(100vw - 16px); box-shadow: 0 12px 32px rgba(0,0,40,.4); transform-origin: bottom right; opacity: 0; transform: translateY(10px) scale(.9); transition: opacity .2s, transform .3s cubic-bezier(.2,.8,.2,1); }
.cr-dock.in { opacity: 1; transform: none; }
.cr-panel--dock .cr-row { left: 12px; right: 12px; gap: 8px; font-size: 10.5px; letter-spacing: 1.2px; }
.cr-panel--dock .cr-top { top: 10px; } .cr-panel--dock .cr-bottom { bottom: 10px; }
.cr-panel--dock .cr-main { left: 12px; right: 12px; top: 30px; transform: none; }
.cr-panel--dock .cr-big { font-size: 64px; letter-spacing: -1px; }
.cr-panel--dock .cr-sub { margin-top: 4px; font-size: 11px; letter-spacing: 1.1px; }
.cr-panel--dock .cr-quote { margin-top: 6px; max-width: 250px; font-size: 10.5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cr-panel--dock .cr-chip { padding: 3px 7px; }
.cr-panel--dock .cr-chips:has(.cr-watch.on) [data-k="chip"] { display: none; }
.cr-panel--dock .cr-quote-ev { left: 12px; right: auto; max-width: 60%; top: 30px; transform: none; padding: 0; font-size: 10.5px; line-height: 1.4; }
.cr-panel--dock .cr-flood { height: 50%; }
.cr-panel--dock .cr-word { left: 8px; bottom: 30px; font-size: 68px; letter-spacing: -2px; }
.cr-panel--dock .cr-flood .cr-row { bottom: 8px; font-size: 10px; }
.cr-panel--dock [data-k="f3"] { display: none; }

/* the status-bar chip */
.cr-sb { display: inline-flex; align-items: center; gap: 6px; height: 18px; padding: 0 6px; border: 0; border-radius: 3px; background: transparent; color: var(--ui-text-tertiary); font: inherit; font-size: .6875rem; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; cursor: pointer; }
.cr-sb:hover, .cr-sb--open { color: var(--ui-text-secondary); }
.cr-sb-mark { width: 7px; height: 7px; background: currentColor; opacity: .6; }
.cr-sb--open .cr-sb-mark { background: #0000f2; opacity: 1; }
.cr-sb--watch .cr-sb-mark { background: #f2f200; opacity: 1; }
.cr-sb--overdue .cr-sb-mark { background: var(--ui-accent); opacity: 1; }
.cr-sb--fresh, .cr-sb--fresh:hover { background: #f2f200; color: #0000f2; }
.cr-sb--fresh .cr-sb-mark { background: #0000f2; opacity: 1; }
.cr-sb--pulse, .cr-sb--pulse:hover { color: #0000f2; }
.cr-sb--pulse { background: linear-gradient(#f2f200, #f2f200) left / 0% 100% no-repeat; animation: cr-sweep .5s cubic-bezier(.7,0,.2,1) forwards; }
.cr-sb--pulse.cr-sb--banked { background-image: linear-gradient(#00f2f2, #00f2f2); }
.cr-sb--pulse .cr-sb-mark { background: #0000f2; opacity: 1; }
@keyframes cr-sweep { to { background-size: 100% 100%; } }

/* history page */
.cr-page { height: 100%; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }
.cr-host { height: 300px; flex-shrink: 0; }
.cr-hist { display: flex; flex-direction: column; }
.cr-hist-head { display: flex; justify-content: space-between; padding: 0 4px 8px; border-bottom: 1px solid var(--ui-stroke-secondary); color: var(--ui-text-tertiary); font-size: .6875rem; letter-spacing: .08em; text-transform: uppercase; }
.cr-hist-row { display: grid; grid-template-columns: 40px 72px 136px 52px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 9px 4px; border: 0; border-bottom: 1px solid var(--ui-stroke-secondary); background: transparent; color: var(--ui-text-secondary); font: inherit; font-size: .8125rem; text-align: left; cursor: pointer; }
.cr-hist-row:hover { background: color-mix(in srgb, var(--ui-accent) 8%, transparent); }
.cr-hist-no, .cr-hist-gap { font-family: "IBM Plex Mono", ui-monospace, monospace; color: var(--ui-text-tertiary); font-size: .75rem; }
.cr-hist-type { justify-self: start; padding: 1px 6px; font-size: .6875rem; letter-spacing: .08em; text-transform: uppercase; box-shadow: inset 0 0 0 .5px currentColor; }
.cr-hist-type--banked { color: var(--ui-accent); }
.cr-hist-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cr-hist-note { padding: 8px 4px; color: var(--ui-text-tertiary); font-size: .8125rem; }

@media (prefers-reduced-motion: reduce) {
  .cr-flood, .cr-word span, .cr-quote-ev, .cr-main, .cr-dock, .cr-sb--pulse { transition: none !important; animation: none !important; }
  .cr-sb--pulse { background-size: 100% 100%; }
}
`

// ---------- plugin ----------

// ctx.setTimeout / setInterval / addEventListener arrived after Hermes 0.21; fall back to plain ones
// torn down through onDispose so a disable or hot reload never leaves them running.
function scoped(ctx) {
  const track = off => { ctx.onDispose(off); return off }
  return {
    setTimeout: ctx.setTimeout ? ctx.setTimeout.bind(ctx) : (fn, ms) => { const t = setTimeout(fn, ms); return track(() => clearTimeout(t)) },
    setInterval: ctx.setInterval ? ctx.setInterval.bind(ctx) : (fn, ms) => { const t = setInterval(fn, ms); return track(() => clearInterval(t)) },
    addEventListener: ctx.addEventListener ? ctx.addEventListener.bind(ctx)
      : (target, type, fn, opts) => { target.addEventListener(type, fn, opts); return track(() => target.removeEventListener(type, fn, opts)) }
  }
}

export default {
  id: ID,
  name: 'Codex Resets',
  register(ctx) {
    const on = scoped(ctx)
    const style = document.createElement('style')
    style.dataset.plugin = ID
    style.textContent = CSS
    document.head.appendChild(style)
    ctx.onDispose(() => style.remove())
    ctx.onDispose(() => { closeDock(); clearTimeout(pulseTimer) })

    const openExternal = url => ctx.os.openExternal(url)
    const preview = type => () => playMoment(ctx, sampleReset(type), { number: ($status.get()?.stats?.total ?? 0) + 1 })
    ctx.registerMany([
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 125, render: () => jsx(Chip, { onClick: () => toggleDock(ctx) }) },
      { id: 'page', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(Page, { openExternal }) },
      { id: 'open', area: PALETTE_AREA, data: { id: `${ID}.open`, label: 'Codex resets: show status', keywords: ['codex', 'reset', 'limits'], run: () => openDock(ctx, 'status') } },
      { id: 'history', area: PALETTE_AREA, data: { id: `${ID}.history`, label: 'Codex resets: open history', keywords: ['codex', 'reset', 'history'], run: openHistory } },
      { id: 'refresh', area: PALETTE_AREA, data: { id: `${ID}.refresh`, label: 'Codex resets: check now', keywords: ['codex', 'reset', 'refresh'], run: () => poll(ctx) } },
      { id: 'preview', area: PALETTE_AREA, data: { id: `${ID}.preview`, label: 'Codex resets: preview reset moment', keywords: ['codex', 'reset', 'test'], run: preview('regular') } },
      { id: 'preview-banked', area: PALETTE_AREA, data: { id: `${ID}.preview-banked`, label: 'Codex resets: preview banked reset moment', keywords: ['codex', 'reset', 'banked', 'test'], run: preview('banked') } }
    ])

    on.addEventListener(window, 'keydown', e => {
      lastKeyAt = Date.now()
      if (e.key === 'Escape' && dock) closeDock()
    }, true)
    on.addEventListener(document, 'pointerdown', e => {
      if (dock?.sticky && !dock.el.contains(e.target) && !chipEl?.contains(e.target)) closeDock()
    }, true)
    on.addEventListener(window, 'resize', positionDock)
    on.addEventListener(window, 'focus', () => {
      poll(ctx)
      if (pendingAway) {
        const { reset, number } = pendingAway
        pendingAway = null
        on.setTimeout(() => playMoment(ctx, reset, { number, away: true }), 600)
      }
    })
    // A card deferred because you were typing rises once you pause.
    on.setInterval(() => {
      if (!pendingCalm) return
      if (Date.now() - pendingCalm.since > DEFER_MAX_MS) { pendingCalm = null; return }
      if (isTyping() || isAway()) return
      const { reset, opts } = pendingCalm
      pendingCalm = null
      openDock(ctx, 'moment', reset, opts)
    }, 1_500)
    on.setInterval(() => poll(ctx), POLL_MS)
    on.setInterval(() => $now.set(Date.now()), 60_000)
    poll(ctx)
  }
}

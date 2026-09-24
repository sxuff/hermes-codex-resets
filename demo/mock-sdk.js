// A tiny stand-in for @hermes/plugin-sdk so plugin.js can run in a plain browser.
// Only the parts this plugin uses. Not the real SDK.
import { useSyncExternalStore, useEffect, useState } from 'react'

export function atom(initial) {
  let value = initial
  const subs = new Set()
  return {
    get: () => value,
    set(v) { value = v; subs.forEach(f => f(v)) },
    listen(f) { subs.add(f); return () => subs.delete(f) },
    subscribe(f) { subs.add(f); f(value); return () => subs.delete(f) }
  }
}
export const useValue = a => useSyncExternalStore(a.listen, a.get)

export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const PALETTE_AREA = 'palette'

// Harness-facing stores.
export const $contribs = atom([])
export const $route = atom('/')
export const $toasts = atom([])
export const $osNotes = atom([])

export const host = {
  state: { busy: atom(false), awaitingResponse: atom(false), gateway: atom('open') },
  notify(n) {
    const id = Math.random()
    $toasts.set([...$toasts.get(), { ...n, id }])
    setTimeout(() => $toasts.set($toasts.get().filter(t => t.id !== id)), 5000)
    return id
  },
  navigate(path) { $route.set(path) }
}

export function useQuery({ queryKey, queryFn }) {
  const [s, set] = useState({ isLoading: true })
  useEffect(() => {
    let live = true
    queryFn().then(data => live && set({ data }), error => live && set({ error }))
    return () => { live = false }
  }, [JSON.stringify(queryKey)])
  return s
}

export function createContext(id) {
  const disposers = []
  const ctx = {
    source: `plugin:${id}`,
    register(c) {
      const item = { ...c, id: `${id}:${c.id}` }
      $contribs.set([...$contribs.get(), item])
      const off = () => $contribs.set($contribs.get().filter(x => x !== item))
      disposers.push(off)
      return off
    },
    registerMany(cs) { const offs = cs.map(c => ctx.register(c)); return () => offs.forEach(f => f()) },
    onDispose(fn) { disposers.push(fn) },
    setTimeout(fn, ms) { const t = setTimeout(fn, ms); const off = () => clearTimeout(t); disposers.push(off); return off },
    setInterval(fn, ms) { const t = setInterval(fn, ms); const off = () => clearInterval(t); disposers.push(off); return off },
    addEventListener(target, type, fn, opts) { target.addEventListener(type, fn, opts); const off = () => target.removeEventListener(type, fn, opts); disposers.push(off); return off },
    os: {
      notify(n) { $osNotes.set([...$osNotes.get(), { ...n, id: Math.random() }]) },
      async openExternal(url) { window.open(url, '_blank', 'noopener'); return true }
    },
    storage: {
      get(k, fallback) { try { const v = localStorage.getItem(`hermes.plugin.${id}.${k}`); return v === null ? fallback : JSON.parse(v) } catch { return fallback } },
      set(k, v) { try { localStorage.setItem(`hermes.plugin.${id}.${k}`, JSON.stringify(v)) } catch {} },
      remove(k) { try { localStorage.removeItem(`hermes.plugin.${id}.${k}`) } catch {} }
    },
    dispose() { disposers.splice(0).reverse().forEach(f => f()) }
  }
  return ctx
}

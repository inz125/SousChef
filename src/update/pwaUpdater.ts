import { registerSW } from 'virtual:pwa-register'
import type { AppUpdater } from './AppUpdater'

/** Service Worker による更新（D-52）。vite-plugin-pwa の registerType: 'prompt' と組み合わせる */
export function createPwaUpdater(): AppUpdater {
  const listeners = new Set<() => void>()
  let registration: ServiceWorkerRegistration | undefined
  const updateSW = registerSW({
    onNeedRefresh: () => listeners.forEach((l) => l()),
    onRegisteredSW: (_url, r) => {
      registration = r
    },
  })
  return {
    onNeedRefresh(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async check() {
      await registration?.update()
    },
    apply() {
      void updateSW(true)
    },
  }
}

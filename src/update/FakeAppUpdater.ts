import type { AppUpdater } from './AppUpdater'

/** テスト用。publish() で「新しいバージョンが見つかった」を再現する */
export class FakeAppUpdater implements AppUpdater {
  checks = 0
  applied = false
  failCheck = false
  private listeners = new Set<() => void>()

  onNeedRefresh(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async check() {
    this.checks++
    if (this.failCheck) throw new Error('network error')
  }

  apply() {
    this.applied = true
  }

  publish() {
    this.listeners.forEach((l) => l())
  }
}

import { useEffect, useState } from 'react'
import type { AppUpdater } from './AppUpdater'

/** 開いている間に新しいバージョンを確認する間隔（D-52） */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * 新しいバージョンの確認と反映（D-52）。前面に戻ったときと 1 時間ごとに確認する。
 * 入力途中の内容を失わないよう、自動では再読み込みせず needRefresh を返すだけにする
 */
export function useAppUpdate(updater: AppUpdater) {
  const [needRefresh, setNeedRefresh] = useState(false)
  useEffect(() => updater.onNeedRefresh(() => setNeedRefresh(true)), [updater])
  useEffect(() => {
    // オフラインでは確認しない。失敗しても何も表示しない
    const check = () => navigator.onLine && updater.check().catch(() => {})
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [updater])
  return { needRefresh, apply: () => updater.apply() }
}

import { act, renderHook } from '@testing-library/react'
import { FakeAppUpdater } from './FakeAppUpdater'
import { CHECK_INTERVAL_MS, useAppUpdate } from './useAppUpdate'

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
}

describe('useAppUpdate（D-52）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('新しいバージョンが見つかるまでは needRefresh が false', () => {
    const { result } = renderHook(() => useAppUpdate(new FakeAppUpdater()))
    expect(result.current.needRefresh).toBe(false)
  })

  it('新しいバージョンが見つかったら needRefresh が true になり、apply で反映する', () => {
    const updater = new FakeAppUpdater()
    const { result } = renderHook(() => useAppUpdate(updater))
    act(() => updater.publish())
    expect(result.current.needRefresh).toBe(true)

    act(() => result.current.apply())
    expect(updater.applied).toBe(true)
  })

  it('前面に戻ったときに確認する。裏に回ったときは確認しない', () => {
    const updater = new FakeAppUpdater()
    renderHook(() => useAppUpdate(updater))
    setVisibility('hidden')
    expect(updater.checks).toBe(0)
    setVisibility('visible')
    expect(updater.checks).toBe(1)
  })

  it('開いている間は 1 時間ごとに確認する', () => {
    vi.useFakeTimers()
    const updater = new FakeAppUpdater()
    renderHook(() => useAppUpdate(updater))
    expect(CHECK_INTERVAL_MS).toBe(60 * 60 * 1000)
    act(() => vi.advanceTimersByTime(CHECK_INTERVAL_MS - 1))
    expect(updater.checks).toBe(0)
    act(() => vi.advanceTimersByTime(1))
    expect(updater.checks).toBe(1)
    act(() => vi.advanceTimersByTime(CHECK_INTERVAL_MS))
    expect(updater.checks).toBe(2)
  })

  it('オフラインのときは確認しない', () => {
    vi.useFakeTimers()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const updater = new FakeAppUpdater()
    renderHook(() => useAppUpdate(updater))
    setVisibility('visible')
    act(() => vi.advanceTimersByTime(CHECK_INTERVAL_MS))
    expect(updater.checks).toBe(0)
  })

  it('確認に失敗しても何も起きない', async () => {
    const updater = new FakeAppUpdater()
    updater.failCheck = true
    const { result } = renderHook(() => useAppUpdate(updater))
    setVisibility('visible')
    await act(async () => {})
    expect(updater.checks).toBe(1)
    expect(result.current.needRefresh).toBe(false)
  })

  it('アンマウントしたら確認をやめる', () => {
    vi.useFakeTimers()
    const updater = new FakeAppUpdater()
    const { unmount } = renderHook(() => useAppUpdate(updater))
    unmount()
    setVisibility('visible')
    act(() => vi.advanceTimersByTime(CHECK_INTERVAL_MS))
    expect(updater.checks).toBe(0)
  })
})

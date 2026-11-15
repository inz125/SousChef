// レシートの読み取りと、読み取った食材の確認待ち（D-42・D-70）。読み取り中や確認の途中で
// タブを移っても続けられるよう、React の外に置いてアプリ全体で 1 つ持つ（MealPlanner と同じ形）
import type { ReceiptDraft } from '../domain/receipt'
import { ReceiptError, type ReceiptApi, type ReceiptItem } from './ReceiptApi'

export type ReceiptState = {
  reading: boolean
  /** 読み取った食材。確認画面で登録・キャンセルするまで持つ */
  items: ReceiptItem[] | null
  /** 確認画面で直している途中の内容。まだ開いていなければ null */
  drafts: ReceiptDraft[] | null
}

/** 読み取りが終わったことの知らせ。どの画面でもお知らせを出せるように流す */
export type ReceiptEvent = { kind: 'read' } | { kind: 'failed'; message: string }

const IDLE: ReceiptState = { reading: false, items: null, drafts: null }
const READ_FAILED = 'レシートの読み取りに失敗しました。時間をおいてお試しください'

export class ReceiptReader {
  private state = IDLE
  private listeners = new Set<() => void>()
  private eventListeners = new Set<(e: ReceiptEvent) => void>()
  /** 何回目の読み取りか。reset のあとに届いた結果は使わない */
  private round = 0
  private api: ReceiptApi

  constructor(api: ReceiptApi) {
    this.api = api
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  /** 読み取りの結果・失敗を受け取る */
  onEvent(listener: (e: ReceiptEvent) => void) {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  /** 写真を読み取る。読み取り中・確認待ちがあるときは何もしない（1 枚ずつ） */
  async read(photo: File) {
    if (this.state.reading || this.state.items) return
    const mine = ++this.round
    this.set({ ...IDLE, reading: true })
    let event: ReceiptEvent
    try {
      const items = await this.api.read(photo)
      if (mine !== this.round) return
      this.set({ ...IDLE, items })
      event = { kind: 'read' }
    } catch (e) {
      if (mine !== this.round) return
      this.set(IDLE)
      event = { kind: 'failed', message: e instanceof ReceiptError ? e.message : READ_FAILED }
    }
    for (const listener of this.eventListeners) listener(event)
  }

  /** 確認画面で直した内容を残す（タブを移っても続きから開く） */
  saveDrafts(drafts: ReceiptDraft[]) {
    if (this.state.items) this.set({ ...this.state, drafts })
  }

  /** 確認を終える（登録・キャンセル） */
  clear() {
    this.set({ ...this.state, items: null, drafts: null })
  }

  /** すべて捨てる（ログアウト）。読み取り中の結果も使わない */
  reset() {
    this.round++
    this.set(IDLE)
  }

  private set(state: ReceiptState) {
    this.state = state
    for (const listener of this.listeners) listener()
  }
}

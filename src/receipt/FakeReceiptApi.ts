import { ReceiptError, type ReceiptApi, type ReceiptItem } from './ReceiptApi'

export const SAMPLE_RECEIPT: ReceiptItem[] = [
  { name: '牛乳', category: 'dairy', location: 'fridge' },
  { name: '鶏むね肉', category: 'meat', location: 'fridge' },
  { name: '冷凍餃子', category: 'processed', location: 'freezer' },
]

/** テスト用のレシート読み取り API。呼び出しを記録し、応答を制御できる */
export class FakeReceiptApi implements ReceiptApi {
  calls: File[] = []
  items = SAMPLE_RECEIPT
  error: string | null = null
  hold = false
  private pending: (() => void) | null = null

  async read(photo: File) {
    this.calls.push(photo)
    if (this.hold) await new Promise<void>((resolve) => (this.pending = resolve))
    if (this.error) throw new ReceiptError(this.error)
    return this.items
  }

  /** hold 中の応答を返す */
  release() {
    this.pending?.()
  }
}

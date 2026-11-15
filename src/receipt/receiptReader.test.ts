import { FakeReceiptApi, SAMPLE_RECEIPT } from './FakeReceiptApi'
import { ReceiptReader, type ReceiptEvent } from './receiptReader'
import type { ReceiptDraft } from '../domain/receipt'

const photo = () => new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })

function setup() {
  const api = new FakeReceiptApi()
  const reader = new ReceiptReader(api)
  const events: ReceiptEvent[] = []
  reader.onEvent((e) => events.push(e))
  return { api, reader, events }
}

describe('ReceiptReader（D-70）', () => {
  it('はじめは何もしていない', () => {
    const { reader } = setup()
    expect(reader.getSnapshot()).toEqual({ reading: false, items: null, drafts: null })
  })

  it('読み取り中は reading、終わったら食材を持ち、読み取ったことを知らせる', async () => {
    const { api, reader, events } = setup()
    api.hold = true
    const seen: boolean[] = []
    reader.subscribe(() => seen.push(reader.getSnapshot().reading))

    const done = reader.read(photo())
    expect(reader.getSnapshot()).toEqual({ reading: true, items: null, drafts: null })
    api.release()
    await done

    expect(reader.getSnapshot()).toEqual({ reading: false, items: SAMPLE_RECEIPT, drafts: null })
    expect(seen).toEqual([true, false])
    expect(events).toEqual([{ kind: 'read' }])
  })

  it('失敗したら食材を持たず、理由を知らせる', async () => {
    const { api, reader, events } = setup()
    api.error = '食材を読み取れませんでした'

    await reader.read(photo())

    expect(reader.getSnapshot()).toEqual({ reading: false, items: null, drafts: null })
    expect(events).toEqual([{ kind: 'failed', message: '食材を読み取れませんでした' }])
  })

  it('理由のない失敗は決まった文言で知らせる', async () => {
    const { api, reader, events } = setup()
    vi.spyOn(api, 'read').mockRejectedValue(new Error('boom'))

    await reader.read(photo())

    expect(events).toEqual([
      { kind: 'failed', message: 'レシートの読み取りに失敗しました。時間をおいてお試しください' },
    ])
  })

  it('読み取り中と、確認がまだのレシートがある間は次を読まない（1 枚ずつ）', async () => {
    const { api, reader } = setup()
    api.hold = true
    const first = reader.read(photo())
    await reader.read(photo())
    expect(api.calls).toHaveLength(1)

    api.release()
    await first
    api.hold = false
    await reader.read(photo())
    expect(api.calls).toHaveLength(1)
  })

  it('確認画面で直した内容を持ち、片付けたら次を読める', async () => {
    const { api, reader } = setup()
    await reader.read(photo())
    const drafts = [{ key: 0, checked: false } as ReceiptDraft]

    reader.saveDrafts(drafts)
    expect(reader.getSnapshot().drafts).toBe(drafts)

    reader.clear()
    expect(reader.getSnapshot()).toEqual({ reading: false, items: null, drafts: null })
    await reader.read(photo())
    expect(api.calls).toHaveLength(2)
  })

  it('reset 後に届いた読み取りの結果は捨てる（ログアウト）', async () => {
    const { api, reader, events } = setup()
    api.hold = true
    const done = reader.read(photo())

    reader.reset()
    expect(reader.getSnapshot()).toEqual({ reading: false, items: null, drafts: null })
    api.release()
    await done

    expect(reader.getSnapshot()).toEqual({ reading: false, items: null, drafts: null })
    expect(events).toEqual([])
  })
})

import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { ReceiptError } from './ReceiptApi'
import { createSupabaseReceiptApi } from './supabaseReceiptApi'

const photo = new File(['x'], 'r.jpg', { type: 'image/jpeg' })
const prepared = { image: 'AAAA', mediaType: 'image/jpeg' as const }
const prepare = async () => prepared

function clientReturning(result: { data?: unknown; error?: unknown }) {
  const invoke = vi.fn().mockResolvedValue({ data: null, error: null, ...result })
  return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

describe('createSupabaseReceiptApi', () => {
  it('縮めた写真を read-receipt に送り、食材を返す', async () => {
    const items = [{ name: '牛乳', category: 'dairy', location: 'fridge' }]
    const { client, invoke } = clientReturning({ data: { items } })

    expect(await createSupabaseReceiptApi(client, prepare).read(photo)).toEqual(items)
    expect(invoke).toHaveBeenCalledWith('read-receipt', { body: prepared })
  })

  it('サーバが返した理由をそのまま ReceiptError にする', async () => {
    const response = new Response(
      JSON.stringify({ error: '今日のレシート読み取り回数の上限です' }),
      {
        status: 429,
      },
    )
    const { client } = clientReturning({ error: new FunctionsHttpError(response) })

    await expect(createSupabaseReceiptApi(client, prepare).read(photo)).rejects.toThrow(
      new ReceiptError('今日のレシート読み取り回数の上限です'),
    )
  })

  it('通信できなかったときは電波の案内にする', async () => {
    const { client } = clientReturning({ error: new Error('fetch failed') })

    await expect(createSupabaseReceiptApi(client, prepare).read(photo)).rejects.toThrow(
      /通信できませんでした/,
    )
  })
})

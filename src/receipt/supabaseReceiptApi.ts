import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'
import { ReceiptError, type ReceiptApi, type ReceiptItem } from './ReceiptApi'
import { prepareReceiptPhoto, type PreparedPhoto } from './resizeImage'

/** Edge Function read-receipt を呼ぶ。サーバが返した理由をそのまま利用者に見せる */
export function createSupabaseReceiptApi(
  client: SupabaseClient,
  prepare: (photo: File) => Promise<PreparedPhoto> = prepareReceiptPhoto,
): ReceiptApi {
  return {
    async read(photo) {
      const body = await prepare(photo)
      const { data, error } = await client.functions.invoke<{ items: ReceiptItem[] }>(
        'read-receipt',
        { body },
      )
      if (error instanceof FunctionsHttpError) {
        const res = await (error.context as Response).json().catch(() => null)
        throw new ReceiptError(res?.error ?? 'レシートの読み取りに失敗しました')
      }
      if (error || !data) {
        throw new ReceiptError('通信できませんでした。電波の良いところでお試しください')
      }
      return data.items
    },
  }
}

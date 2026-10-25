import type { ReceiptItem } from '../domain/receipt'

export type { ReceiptItem }

/** 読み取れなかったときの、利用者に見せる理由つきのエラー */
export class ReceiptError extends Error {}

/** レシート読み取り API の境界。本番は Edge Function、テストは FakeReceiptApi */
export interface ReceiptApi {
  /** レシートの写真から食材を読み取る（D-42）。食材が 1 つもなければ ReceiptError */
  read(photo: File): Promise<ReceiptItem[]>
}

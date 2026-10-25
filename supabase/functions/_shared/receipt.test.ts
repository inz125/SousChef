import {
  buildReceiptPrompt,
  cleanReceiptItems,
  ReceiptImageSchema,
  ReceiptItemsSchema,
} from './receipt.ts'

const item = (name: string) => ({
  name,
  category: 'dairy' as const,
  location: 'fridge' as const,
})

describe('ReceiptImageSchema', () => {
  it('base64 の画像と対応する形式を受け付ける', () => {
    expect(ReceiptImageSchema.safeParse({ image: 'AAAA', mediaType: 'image/jpeg' }).success).toBe(
      true,
    )
  })

  it.each([
    ['形式が違う', { image: 'AAAA', mediaType: 'image/gif' }],
    ['画像が空', { image: '', mediaType: 'image/jpeg' }],
    ['5MB を超える', { image: 'A'.repeat(5 * 1024 * 1024 + 1), mediaType: 'image/jpeg' }],
  ])('%s と拒否する', (_, body) => {
    expect(ReceiptImageSchema.safeParse(body).success).toBe(false)
  })
})

describe('ReceiptItemsSchema', () => {
  it('カテゴリ・保存場所が決まった値でなければ拒否する', () => {
    expect(ReceiptItemsSchema.safeParse({ items: [item('牛乳')] }).success).toBe(true)
    expect(
      ReceiptItemsSchema.safeParse({ items: [{ ...item('牛乳'), category: 'drink' }] }).success,
    ).toBe(false)
    expect(
      ReceiptItemsSchema.safeParse({ items: [{ ...item('牛乳'), location: 'shelf' }] }).success,
    ).toBe(false)
  })

  it('51 件以上は拒否する', () => {
    const items = Array.from({ length: 51 }, (_, i) => item(`食材${i}`))
    expect(ReceiptItemsSchema.safeParse({ items }).success).toBe(false)
  })
})

describe('cleanReceiptItems', () => {
  it('名前の前後の空白を除き、空の名前を捨てる', () => {
    expect(cleanReceiptItems({ items: [item('  牛乳 '), item('   ')] })).toEqual([item('牛乳')])
  })

  it('同じ名前は最初の 1 つにまとめる', () => {
    expect(cleanReceiptItems({ items: [item('牛乳'), item('卵'), item('牛乳')] })).toEqual([
      item('牛乳'),
      item('卵'),
    ])
  })
})

describe('buildReceiptPrompt', () => {
  const { system, user } = buildReceiptPrompt()

  it('食材だけを一般名で、食品以外や割引・小計の行を除いて返すよう伝える', () => {
    expect(system).toMatch(/食材.*だけ/)
    expect(system).toMatch(/日用品/)
    expect(system).toMatch(/割引/)
    expect(system).toMatch(/小計/)
    expect(system).toMatch(/一般名/)
    expect(system).toMatch(/1 つにまとめる/)
  })

  it('カテゴリと保存場所の選択肢を日本語名つきで伝える', () => {
    expect(user).toContain('meat=肉')
    expect(user).toContain('seasoning=調味料・乾物')
    expect(user).toContain('freezer=冷凍')
    expect(user).toContain('vegetable=野菜室')
  })
})

import { ILLUSTRATIONS, illustrationFor, missingIllustrations } from './illustrations'

describe('食材のイラスト（D-56）', () => {
  it('食材名の完全一致でイラストを引く', () => {
    expect(illustrationFor('牛乳')).toEqual(expect.any(String))
    expect(illustrationFor('牛乳パック')).toBeNull()
  })

  it('別名でも同じイラストを引く', () => {
    expect(illustrationFor('たまご')).toBe(illustrationFor('卵'))
    expect(illustrationFor('玉子')).toBe(illustrationFor('卵'))
  })

  it('前後の空白は無視する', () => {
    expect(illustrationFor(' 牛乳　')).toBe(illustrationFor('牛乳'))
  })

  it('利用者から届いたイラスト待ちの食材にイラストがある', () => {
    for (const name of [
      'めかぶ',
      'プチトマト',
      'まいたけ',
      'オクラ',
      '鶏肉もも',
      'カニカマ',
      'キムチ',
      '生卵',
      'れんこん',
      '鮭 冷凍',
    ])
      expect(illustrationFor(name), name).toEqual(expect.any(String))
  })

  it('対応表にない食材は null（作成中）', () => {
    expect(illustrationFor('ズッキーニ')).toBeNull()
  })

  it('対応表のすべてのイラストに SVG があり、名前は重複しない', () => {
    const names = ILLUSTRATIONS.flatMap((i) => i.names)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(illustrationFor(name)).toEqual(expect.any(String))
  })

  it('イラストのない食材名を重複なく五十音順で返す', () => {
    expect(missingIllustrations(['牛乳', 'ズッキーニ', 'アボカド', 'ズッキーニ'])).toEqual([
      'アボカド',
      'ズッキーニ',
    ])
  })
})

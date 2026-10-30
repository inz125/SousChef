import {
  ILLUSTRATIONS,
  illustrationFor,
  matchIllustrationName,
  missingIllustrations,
} from './illustrations'

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

  it('2 回目に届いたイラスト待ちの食材にイラストがある', () => {
    for (const name of [
      'あらごしトマト',
      'カレールー',
      'シーチキン',
      'そうめん',
      'そば',
      'たくあん',
      'バジルソース',
      'パスタ1.4mm',
      'パスタ1.6mm',
      'ハヤシルー',
      '豚肉 解凍済',
      '明太子',
      '冷やし中華麺',
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

  describe('先頭一致（D-67）', () => {
    it('すぐ後ろが区切り（空白・数字・記号）なら同じイラスト', () => {
      for (const [name, base] of [
        ['パスタ1.4mm', 'パスタ'],
        ['豚肉 解凍済', '豚肉'],
        ['豚肉　解凍済', '豚肉'],
        ['卵(L)', '卵'],
        ['卵（L）', '卵'],
        ['卵・10個', '卵'],
        ['卵１０個', '卵'],
        ['卵/特売', '卵'],
        ['卵-L', '卵'],
      ])
        expect(illustrationFor(name), name).toBe(illustrationFor(base))
    })

    it('すぐ後ろがひらがな・カタカナ・漢字・英字なら作成中', () => {
      for (const name of [
        'パン粉',
        'トマトケチャップ',
        '米酢',
        '卵焼き',
        'パスタソース',
        'バターロール',
        'ハムエッグ',
        'パンー',
        '卵L',
        '卵Ｌ',
      ])
        expect(illustrationFor(name), name).toBeNull()
    })

    it('前後の空白は無視する', () => {
      expect(illustrationFor(' 豚肉 解凍済 ')).toBe(illustrationFor('豚肉'))
    })

    it('当てはまる名前が複数あれば長いほう', () => {
      const table = ['鶏肉', '鶏肉もも', 'パスタ']
      expect(matchIllustrationName('鶏肉もも 2枚', table)).toBe('鶏肉もも')
      expect(matchIllustrationName('鶏肉 2枚', table)).toBe('鶏肉')
      expect(matchIllustrationName('鶏肉もも', table)).toBe('鶏肉もも')
      expect(matchIllustrationName('鶏肉むね', table)).toBeNull()
      expect(illustrationFor('鶏肉もも 2枚')).toBe(illustrationFor('鶏肉'))
    })

    it('イラスト待ちには先頭一致しないものだけ並ぶ', () => {
      expect(missingIllustrations(['パスタ1.6mm', 'パン粉'])).toEqual(['パン粉'])
    })
  })
})

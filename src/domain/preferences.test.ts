import { addChips, formatList, parseList } from './preferences'

describe('parseList', () => {
  it('読点・カンマ・改行・空白で区切り、空要素と重複を除く', () => {
    expect(parseList('セロリ、パクチー,えび\nかに  セロリ、、')).toEqual([
      'セロリ',
      'パクチー',
      'えび',
      'かに',
    ])
  })

  it('全角スペースや全角カンマでも区切る', () => {
    expect(parseList('しいたけ　なす，ピーマン')).toEqual(['しいたけ', 'なす', 'ピーマン'])
  })

  it('空文字なら空配列', () => {
    expect(parseList('  ')).toEqual([])
  })
})

describe('formatList', () => {
  it('読点で連結する', () => {
    expect(formatList(['セロリ', 'パクチー'])).toBe('セロリ、パクチー')
  })
})

describe('addChips（設定のチップ。D-81）', () => {
  it('「、」「,」で分けて末尾に足し、前後の空白と空は除く', () => {
    expect(addChips(['塩'], ' えび、かに ,, ごま油　 ')).toEqual({
      names: ['塩', 'えび', 'かに', 'ごま油'],
      duplicates: [],
    })
    expect(addChips([], 'えび，かに')).toEqual({ names: ['えび', 'かに'], duplicates: [] })
  })

  it('空白では分けない', () => {
    expect(addChips([], 'ピザ用 チーズ').names).toEqual(['ピザ用 チーズ'])
  })

  it('すでにある名前は足さずに知らせ、入力の中の重なりは 1 つにする', () => {
    expect(addChips(['醤油'], '醤油, 豆板醤, 豆板醤')).toEqual({
      names: ['醤油', '豆板醤'],
      duplicates: ['醤油'],
    })
  })

  it('空の入力なら何も足さない', () => {
    expect(addChips(['塩'], '  、 ')).toEqual({ names: ['塩'], duplicates: [] })
  })
})

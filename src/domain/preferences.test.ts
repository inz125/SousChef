import { formatList, parseList } from './preferences'

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

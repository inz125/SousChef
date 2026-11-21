import { addChips } from './preferences'

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

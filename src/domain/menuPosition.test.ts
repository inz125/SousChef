import { menuPosition, MENU_GAP, SCREEN_MARGIN } from './menuPosition'

// iPhone 15 の画面（393 × 852）。下部タブの上端は 770
const screen = { width: 393, height: 852, bottom: 770 }
const menu = { width: 250, height: 132 }
const tile = (left: number, top: number) => ({ left, top, width: 84, height: 100 })

describe('menuPosition（D-59）', () => {
  it('上のほうの食材は、食材のすぐ下にメニューを出す', () => {
    const p = menuPosition(tile(16, 200), menu, screen)
    expect(p.placement).toBe('below')
    expect(p.top).toBe(300 + MENU_GAP)
  })

  it('下に入りきらない（下部タブに重なる）ときは食材の上に出す', () => {
    const p = menuPosition(tile(16, 600), menu, screen)
    expect(p.placement).toBe('above')
    expect(p.top).toBe(600 - MENU_GAP - menu.height)
  })

  it('左の 2 列の食材はタイルの左端に、右の 2 列はタイルの右端にそろえる', () => {
    expect(menuPosition(tile(108, 200), menu, screen)).toMatchObject({ align: 'left', left: 108 })
    const right = menuPosition(tile(293, 200), menu, screen)
    expect(right.align).toBe('right')
    expect(right.left + menu.width).toBe(293 + 84)
  })

  it('画面の左右 16px より外に出さない', () => {
    // 左の列の 2 つ目で左端にそろえると右にはみ出す幅のメニュー
    const wide = { width: 300, height: 132 }
    expect(menuPosition(tile(108, 200), wide, screen).left).toBe(
      screen.width - SCREEN_MARGIN - wide.width,
    )
    // 右の列の 3 つ目で右端にそろえると左にはみ出す
    expect(menuPosition(tile(200, 200), wide, screen).left).toBe(SCREEN_MARGIN)
  })

  it('上にも下にも入りきらないときは下に出す', () => {
    const tall = { width: 250, height: 700 }
    expect(menuPosition(tile(16, 300), tall, screen)).toMatchObject({
      placement: 'below',
      top: 400 + MENU_GAP,
    })
  })
})

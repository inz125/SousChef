// 長押しメニューを食材の近くに出す位置（D-59）

/** 食材とメニューの間 */
export const MENU_GAP = 8
/** 画面の端からこれより外にメニューを出さない */
export const SCREEN_MARGIN = 16

type Rect = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }
/** 画面の幅・高さと、メニューを出せる下端（下部タブの上端） */
type Screen = Size & { bottom: number }

export type MenuPosition = {
  top: number
  left: number
  /** 食材の下に出すか上に出すか */
  placement: 'below' | 'above'
  /** 食材の左端と右端のどちらにそろえるか */
  align: 'left' | 'right'
}

/** iPhone のホーム画面のように、食材のすぐ下（入らなければ上）に、近いほうの端をそろえて出す */
export function menuPosition(tile: Rect, menu: Size, screen: Screen): MenuPosition {
  const below = tile.top + tile.height + MENU_GAP
  const above = tile.top - MENU_GAP - menu.height
  const placement =
    below + menu.height > screen.bottom && above >= SCREEN_MARGIN ? 'above' : 'below'

  const align = tile.left + tile.width / 2 < screen.width / 2 ? 'left' : 'right'
  const aligned = align === 'left' ? tile.left : tile.left + tile.width - menu.width
  const left = Math.max(SCREEN_MARGIN, Math.min(aligned, screen.width - SCREEN_MARGIN - menu.width))

  return { top: placement === 'below' ? below : above, left, placement, align }
}

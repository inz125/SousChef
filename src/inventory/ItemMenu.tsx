import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { expiryStatus } from '../domain/expiry'
import type { IsoDate } from '../domain/food'
import { QUANTITIES, quantityAfterTap, type InventoryItem } from '../domain/inventory'
import { menuPosition, type MenuPosition } from '../domain/menuPosition'
import { TileFace } from './TileFace'

/** 長押しした食材を浮かせるときの拡大率 */
const LIFT_SCALE = 1.12

/** 長押しした食材のタイルの画面上の位置 */
export type Anchor = { left: number; top: number; width: number; height: number }

type Props = {
  item: InventoryItem
  today: IsoDate
  anchor: Anchor
  /** 解凍できるときだけ渡す（冷凍の肉。D-47） */
  onThaw?: () => void
  onToggleQuantity: () => void
  onRemove: () => void
  onCancel: () => void
}

/**
 * 食材を長押ししたときのメニュー（D-56）。iPhone のホーム画面のアイコン長押しのように、
 * 食材を浮かせて背景をぼかし、すぐ下（入らなければ上）に出す（D-59）
 */
export function ItemMenu({
  item,
  today,
  anchor,
  onThaw,
  onToggleQuantity,
  onRemove,
  onCancel,
}: Props) {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  useLayoutEffect(() => {
    // 浮いたイラストは中心から拡大するので、その分だけ広げた位置を基準にする
    const grow = (LIFT_SCALE - 1) / 2
    const lifted = {
      left: anchor.left - anchor.width * grow,
      top: anchor.top - anchor.height * grow,
      width: anchor.width * LIFT_SCALE,
      height: anchor.height * LIFT_SCALE,
    }
    const tabBar = document.querySelector('.tab-bar')?.getBoundingClientRect().top
    // 開くときは縮めた状態から広げる（アニメーション）ので、変形の影響を受けない大きさで測る
    const size = { width: menu.current!.offsetWidth, height: menu.current!.offsetHeight }
    setPosition(
      menuPosition(lifted, size, {
        width: window.innerWidth,
        height: window.innerHeight,
        bottom: tabBar || window.innerHeight,
      }),
    )
  }, [anchor])

  const style = position && {
    top: position.top,
    left: position.left,
    // 浮いたイラストのほうから広がるように出す
    transformOrigin: `${position.placement === 'below' ? 'top' : 'bottom'} ${position.align}`,
  }

  return (
    <>
      <div className="lift-backdrop" onClick={onCancel} />
      <div
        aria-hidden="true"
        className="lifted-tile"
        data-expiry={expiryStatus(item.expiresOn, today)}
        data-quantity={item.quantity}
        style={
          {
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
            '--lift-scale': LIFT_SCALE,
          } as CSSProperties
        }
        onClick={onCancel}
      >
        <TileFace item={item} today={today} />
      </div>
      <div
        ref={menu}
        role="dialog"
        aria-label={`${item.name}の操作`}
        className="context-menu"
        // 位置が決まるまでは見せない（描く前に決まるので、ちらつかない）
        style={style ?? { visibility: 'hidden' }}
      >
        <MenuButton icon={item.quantity === 'low' ? 'more' : 'less'} onClick={onToggleQuantity}>
          {QUANTITIES[quantityAfterTap(item.quantity)]}にする
        </MenuButton>
        {onThaw && (
          <MenuButton icon="thaw" onClick={onThaw}>
            解凍
          </MenuButton>
        )}
        <MenuButton icon="remove" danger onClick={onRemove}>
          削除
        </MenuButton>
      </div>
    </>
  )
}

type IconName = 'less' | 'more' | 'thaw' | 'remove'

function MenuButton({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: IconName
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={danger ? 'danger' : undefined} onClick={onClick}>
      <MenuIcon name={icon} />
      <span>{children}</span>
    </button>
  )
}

/** メニューの項目の左に出す線のアイコン */
function MenuIcon({ name }: { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'less' && <path d="M12 4v15M6 13l6 6 6-6" />}
      {name === 'more' && <path d="M12 20V5M6 11l6-6 6 6" />}
      {name === 'thaw' && (
        <path d="M12 3.5C9 8 6.5 11 6.5 14.5a5.5 5.5 0 0 0 11 0C17.5 11 15 8 12 3.5Z" />
      )}
      {name === 'remove' && (
        <>
          <path d="M4 6.5h16M9.5 6.5V4.5h5v2" />
          <path d="M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13" />
          <path d="M10 10.5v6M14 10.5v6" />
        </>
      )}
    </svg>
  )
}

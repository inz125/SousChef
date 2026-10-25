import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

/** 左スワイプで出るボタン 1 つの幅 */
const ACTION_WIDTH = 80
/** これより動くまではタップとみなす（縦スクロールとも区別する） */
const SLOP = 8

export type SwipeAction = { label: string; kind: 'normal' | 'danger'; onClick: () => void }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 右から並べる順（右端が先頭） */
  actions: SwipeAction[]
  children: ReactNode
}

/** iPhone のメールのように、左になぞるとボタン（量の切り替え・削除など）が出る行の中身（D-41） */
export function SwipeRow({ open, onOpenChange, actions, children }: Props) {
  const reveal = ACTION_WIDTH * actions.length
  // 指を離したとき、これより左に動いていれば開いたままにする
  const openAt = ACTION_WIDTH / 2
  const [offset, setOffset] = useState<number | null>(null)
  const drag = useRef<{ x: number; y: number; base: number; moving: boolean } | null>(null)
  // なぞった直後のクリックで編集画面を開かないようにする
  const suppressClick = useRef(false)

  function down(e: PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, base: open ? -reveal : 0, moving: false }
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moving) {
      if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(e.clientY - d.y)) return
      d.moving = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // 取得できなくても動作には影響しない
      }
    }
    setOffset(Math.min(0, Math.max(-reveal * 1.5, d.base + dx)))
  }

  function up(e: PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d?.moving) return
    suppressClick.current = true
    onOpenChange(d.base + (e.clientX - d.x) < -openAt)
    setOffset(null)
  }

  function cancel() {
    drag.current = null
    setOffset(null)
  }

  const x = offset ?? (open ? -reveal : 0)
  return (
    <>
      {x < 0 && (
        <div className="swipe-actions" style={{ width: reveal }}>
          {actions.toReversed().map((a) => (
            <button key={a.label} type="button" data-kind={a.kind} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="swipe-content"
        data-dragging={offset !== null || undefined}
        style={{ transform: x ? `translateX(${x}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onClickCapture={(e) => {
          // なぞった直後のクリックと、開いているときのタップは、中のボタンを押さない
          if (!suppressClick.current && !open) return
          e.stopPropagation()
          e.preventDefault()
          // マウスでなぞると指を離したあとに click も届くので、それは無視する
          if (suppressClick.current) suppressClick.current = false
          else onOpenChange(false)
        }}
      >
        {children}
      </div>
    </>
  )
}

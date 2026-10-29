import { useEffect, useRef, type ComponentProps, type PointerEvent } from 'react'

/** これだけ押し続けると長押し（D-56） */
export const LONG_PRESS_MS = 500
/** これより指が動いたらスクロールとみなして長押しをやめる */
const MOVE_SLOP = 10

type Props = ComponentProps<'button'> & {
  /** 長押しされたボタンを渡す（メニューをその近くに出す。D-59） */
  onLongPress: (button: HTMLButtonElement) => void
  /** 長押しを受け付けない（オフラインなど）。タップはそのまま */
  longPressDisabled?: boolean
}

/** iPhone のホーム画面のように、タップと長押しで別の操作をするボタン */
export function LongPressButton({ onLongPress, longPressDisabled, onClick, ...rest }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const start = useRef<{ x: number; y: number } | null>(null)
  // 長押しのあと指を離したときに届く click で、タップの操作をしない
  const pressed = useRef(false)

  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = undefined
    start.current = null
  }
  useEffect(() => cancel, [])

  function down(e: PointerEvent<HTMLButtonElement>) {
    pressed.current = false
    cancel()
    if (longPressDisabled) return
    start.current = { x: e.clientX, y: e.clientY }
    const button = e.currentTarget
    timer.current = setTimeout(() => {
      cancel()
      pressed.current = true
      onLongPress(button)
    }, LONG_PRESS_MS)
  }

  function move(e: PointerEvent) {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (Math.hypot(dx, dy) > MOVE_SLOP) cancel()
  }

  return (
    <button
      {...rest}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      // iOS の長押しの標準メニュー（文字選択・画像の保存）を出さない
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (pressed.current) {
          pressed.current = false
          return
        }
        onClick?.(e)
      }}
    />
  )
}

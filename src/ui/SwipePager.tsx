import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { swipeAxis, swipeOffset, swipeTarget } from '../domain/swipe'

/** 指を離したあと、隣の区分へ（または元の位置へ）スライドする時間 */
export const SLIDE_MS = 250

type Props = {
  /** 区分の数 */
  count: number
  /** 今の区分の番号 */
  index: number
  onChange: (index: number) => void
  /** メニューや編集画面を開いている間はスワイプで切り替えない */
  disabled: boolean
  /** 区分ごとの中身。スワイプ中は隣の区分も描く */
  renderPage: (index: number) => ReactNode
}

type Gesture = {
  pointerId: number
  x: number
  y: number
  /** 動き始めの向き。決まるまで null */
  axis: 'x' | 'y' | null
  lastX: number
  lastTime: number
  /** 最後に動いたときの横の速さ（px/ms） */
  velocity: number
}

type Slide = {
  /** 並びを横に動かす距離 */
  offset: number
  /** 横に並べて描く隣の区分 */
  neighbor: number | null
  /** 指を離したあとのスライド中 */
  settling: boolean
  /** どの区分を表示しているときの動きか */
  from: number
}

const REST: Slide = { offset: 0, neighbor: null, settling: false, from: -1 }

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** 横スワイプで隣の区分へ移る、ページめくり風の領域（在庫 D-66・レシピ D-68）。縦のスクロールはブラウザに任せる */
export function SwipePager({ count, index, onChange, disabled, renderPage }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  // 横にスワイプしたあとに届く click で、指の下の食材・料理を開かない
  const swiped = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [state, setSlide] = useState<Slide>(REST)
  // スライド中に上部の切替で区分が変わったら、その動きは捨てる
  const slide = state.from === index ? state : REST
  const current = useRef(index)
  useEffect(() => {
    current.current = index
  }, [index])
  useEffect(() => () => clearTimeout(timer.current), [])

  const width = () => ref.current?.getBoundingClientRect().width || window.innerWidth

  /** offset までスライドしてから done する。「視差効果を減らす」ならすぐ done する */
  function settle(offset: number, neighbor: number | null, done: () => void = () => {}) {
    if (reducedMotion()) {
      setSlide(REST)
      done()
      return
    }
    const from = index
    setSlide({ offset, neighbor, settling: true, from })
    timer.current = setTimeout(() => {
      setSlide(REST)
      if (current.current === from) done()
    }, SLIDE_MS)
  }

  function down(e: PointerEvent) {
    swiped.current = false
    // 前の指の pointerup が領域の外（長押しメニューの背景など）に届いて残っていても、新しい指で始め直す
    gesture.current = null
    if (disabled || slide.settling) return
    gesture.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      axis: null,
      lastX: e.clientX,
      lastTime: performance.now(),
      velocity: 0,
    }
  }

  function move(e: PointerEvent) {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    // メニューが開いた・マウスのボタンが離れている（pointerup を受け取り損ねた）ならやめる
    if (disabled || (e.pointerType === 'mouse' && e.buttons === 0)) {
      gesture.current = null
      return
    }
    const dx = e.clientX - g.x
    if (!g.axis) {
      g.axis = swipeAxis(dx, e.clientY - g.y)
      if (g.axis === 'x') {
        swiped.current = true
        // 指が領域の外へ出ても追えるようにする
        ref.current?.setPointerCapture?.(e.pointerId)
      }
    }
    if (g.axis === 'y') {
      gesture.current = null
      return
    }
    if (g.axis !== 'x') return

    const now = performance.now()
    g.velocity = now > g.lastTime ? (e.clientX - g.lastX) / (now - g.lastTime) : 0
    g.lastX = e.clientX
    g.lastTime = now
    const neighbor = index - Math.sign(dx)
    setSlide({
      offset: swipeOffset({ dx, index, count }),
      neighbor: neighbor >= 0 && neighbor < count && neighbor !== index ? neighbor : null,
      settling: false,
      from: index,
    })
  }

  function up(e: PointerEvent) {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    gesture.current = null
    if (g.axis !== 'x') return
    const w = width()
    const next = swipeTarget({ index, count, dx: e.clientX - g.x, width: w, velocity: g.velocity })
    if (next === index) settle(0, slide.neighbor)
    else settle((index - next) * w, next, () => onChange(next))
  }

  function cancel(e: PointerEvent) {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    gesture.current = null
    if (g.axis === 'x') settle(0, slide.neighbor)
  }

  return (
    <div
      ref={ref}
      className="swipe-pager"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={(e) => {
        if (!swiped.current) return
        swiped.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div
        className="pager-track"
        data-settling={slide.settling || undefined}
        style={slide.offset ? { transform: `translateX(${slide.offset}px)` } : undefined}
      >
        <div className="pager-page">{renderPage(index)}</div>
        {slide.neighbor !== null && (
          // スワイプ中だけ横に並べる隣の区分。見せるだけで、読み上げ・操作の対象にしない
          <div
            className="pager-page neighbor"
            data-side={slide.neighbor > index ? 'right' : 'left'}
            aria-hidden
            inert
          >
            {renderPage(slide.neighbor)}
          </div>
        )}
      </div>
    </div>
  )
}

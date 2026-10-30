// 在庫の保存場所の切替を横スワイプで移る（D-66）

/** これより指が動いたら、縦か横かを決める（長押しを取り消す距離と同じ） */
export const SWIPE_SLOP = 10
/** 一覧の幅のこの割合以上動かしたら隣へ移る */
const SWITCH_RATIO = 1 / 4
/** 指を離す直前の速さ（px/ms）がこれ以上なら、短くても払ったとみなす */
export const FLICK_VELOCITY = 0.5
/** 端の外へ動かすときは、指の動きのこの割合だけ動かす（抵抗） */
const EDGE_RESISTANCE = 1 / 3

/** 動き始めの向き。縦の移動が横以上なら縦のスクロールとして扱う。動きが小さいうちは null */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) < SWIPE_SLOP) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

type Swipe = {
  /** 今の区分の番号 */
  index: number
  /** 区分の数 */
  count: number
  /** 横に動いた距離（左がマイナス） */
  dx: number
  /** 一覧の幅 */
  width: number
  /** 指を離す直前の横の速さ（px/ms。左がマイナス） */
  velocity: number
}

/** 指を離したときに移る区分の番号。左へスワイプで右隣、右へで左隣。端では止まる */
export function swipeTarget({ index, count, dx, width, velocity }: Swipe): number {
  const far = Math.abs(dx) >= width * SWITCH_RATIO
  const flick = Math.abs(velocity) >= FLICK_VELOCITY && Math.sign(velocity) === Math.sign(dx)
  if (dx === 0 || !(far || flick)) return index
  const next = index - Math.sign(dx)
  return Math.min(Math.max(next, 0), count - 1)
}

/** スワイプ中に並びを動かす距離。隣がない向き（端の外）は抵抗をつけて少しだけ動かす */
export function swipeOffset({ dx, index, count }: Pick<Swipe, 'dx' | 'index' | 'count'>): number {
  const outward = (dx > 0 && index === 0) || (dx < 0 && index === count - 1)
  return outward ? dx * EDGE_RESISTANCE : dx
}

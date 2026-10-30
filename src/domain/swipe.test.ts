import { FLICK_VELOCITY, SWIPE_SLOP, swipeAxis, swipeOffset, swipeTarget } from './swipe'

describe('swipeAxis', () => {
  it('動きが小さいうちは決めない', () => {
    expect(swipeAxis(SWIPE_SLOP - 1, 0)).toBeNull()
    expect(swipeAxis(3, 3)).toBeNull()
  })

  it('横の移動が縦より大きければ横', () => {
    expect(swipeAxis(-12, 5)).toBe('x')
    expect(swipeAxis(12, -5)).toBe('x')
  })

  it('縦の移動が横以上なら縦（スクロール）', () => {
    expect(swipeAxis(5, -12)).toBe('y')
    expect(swipeAxis(10, 10)).toBe('y')
  })
})

describe('swipeTarget', () => {
  const base = { index: 1, count: 5, width: 400, velocity: 0 }

  it('幅の 1/4 以上左へ動かすと右隣へ', () => {
    expect(swipeTarget({ ...base, dx: -100 })).toBe(2)
  })

  it('幅の 1/4 以上右へ動かすと左隣へ', () => {
    expect(swipeTarget({ ...base, dx: 100 })).toBe(0)
  })

  it('短いと元のまま', () => {
    expect(swipeTarget({ ...base, dx: -99 })).toBe(1)
    expect(swipeTarget({ ...base, dx: 99 })).toBe(1)
  })

  it('短くても素早く払えば隣へ', () => {
    expect(swipeTarget({ ...base, dx: -30, velocity: -FLICK_VELOCITY })).toBe(2)
    expect(swipeTarget({ ...base, dx: 30, velocity: FLICK_VELOCITY })).toBe(0)
  })

  it('払った向きと動かした向きが逆なら元のまま（戻しかけて離した）', () => {
    expect(swipeTarget({ ...base, dx: -30, velocity: FLICK_VELOCITY })).toBe(1)
  })

  it('遅ければ払ったことにしない', () => {
    expect(swipeTarget({ ...base, dx: -30, velocity: -FLICK_VELOCITY * 0.9 })).toBe(1)
  })

  it('端では止まり、反対の端へは回らない', () => {
    expect(swipeTarget({ ...base, index: 4, dx: -300 })).toBe(4)
    expect(swipeTarget({ ...base, index: 0, dx: 300 })).toBe(0)
  })
})

describe('swipeOffset', () => {
  it('隣があれば指にそのまま付いてくる', () => {
    expect(swipeOffset({ dx: -120, index: 1, count: 5 })).toBe(-120)
    expect(swipeOffset({ dx: 120, index: 1, count: 5 })).toBe(120)
  })

  it('端の外へは抵抗をつけて少しだけ動く', () => {
    expect(swipeOffset({ dx: -120, index: 4, count: 5 })).toBe(-40)
    expect(swipeOffset({ dx: 120, index: 0, count: 5 })).toBe(40)
  })

  it('端でも内側へはそのまま動く', () => {
    expect(swipeOffset({ dx: 120, index: 4, count: 5 })).toBe(120)
    expect(swipeOffset({ dx: -120, index: 0, count: 5 })).toBe(-120)
  })
})

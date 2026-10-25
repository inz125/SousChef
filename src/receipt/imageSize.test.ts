import { fitWithin } from './imageSize'

describe('fitWithin', () => {
  it('長辺が上限以下ならそのまま', () => {
    expect(fitWithin(1500, 2000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('縦長は高さを上限に合わせて、縦横比を保って縮める', () => {
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('横長は幅を上限に合わせる', () => {
    expect(fitWithin(4000, 1000, 2000)).toEqual({ width: 2000, height: 500 })
  })
})

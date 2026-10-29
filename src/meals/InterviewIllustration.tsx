/**
 * 献立インタビューのイラスト（D-62）。Claude が描いた SVG（illustrations/*.svg）。
 * 食材のイラスト（D-56）とは別に置き、設定画面の「イラスト待ち」には含めない
 */
export type InterviewIllustrationName =
  | 'clock'
  | 'timer-15'
  | 'timer-30'
  | 'timer-45'
  | 'yunomi'
  | 'basket'
  | 'basket-veg'
  | 'fridge'
  | 'fridge-open'
  | 'rice-bowl'
  | 'rice-steam'
  | 'rice-bag'
  | 'noodle-bowl'
  | 'udon-bowl'
  | 'pasta-plate'
  | 'zaru-soba'
  | 'soup-bowl'
  | 'soup-steam'
  | 'soup-empty'
  | 'kobachi'
  | 'kobachi-full'
  | 'kobachi-empty'
  | 'microwave'
  | 'pan-microwave'
  | 'speech'

const urls = import.meta.glob<string>('./illustrations/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** 飾りなので読み上げない */
export function InterviewIllustration({
  name,
  className,
}: {
  name: InterviewIllustrationName
  className: string
}) {
  return (
    <img
      className={className}
      src={urls[`./illustrations/${name}.svg`]}
      alt=""
      draggable={false}
      data-illustration={name}
    />
  )
}

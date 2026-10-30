/**
 * 食材のイラスト（D-56）。Claude が実装時に描いた SVG（svg/*.svg）と、食材名との対応表。
 * 名前は完全一致か先頭一致（すぐ後ろが空白・数字・記号。D-67）で引く。
 * 当てはまらない食材は「作成中」になり、設定画面の「イラスト待ち」に並ぶ。
 * イラストを足すときは svg/ に 64×64 の SVG を置き、ここに名前（別名も）を書く
 */
export const ILLUSTRATIONS: { file: string; names: string[] }[] = [
  { file: 'milk', names: ['牛乳'] },
  { file: 'egg', names: ['卵', 'たまご', '玉子', '生卵'] },
  { file: 'yogurt', names: ['ヨーグルト'] },
  { file: 'cheese', names: ['チーズ', 'ピザ用チーズ', 'スライスチーズ', 'とろけるチーズ'] },
  { file: 'butter', names: ['バター'] },
  {
    file: 'pork',
    names: ['豚こま肉', '豚肉', '豚こま切れ肉', '豚バラ肉', '豚ロース'],
  },
  { file: 'chicken', names: ['鶏もも肉', '鶏肉', '鶏むね肉', '鶏肉もも'] },
  { file: 'beef', names: ['牛肉', '牛こま肉', '牛こま切れ肉'] },
  { file: 'minced', names: ['ひき肉', '合いびき肉', '合挽き肉', '豚ひき肉', '鶏ひき肉'] },
  { file: 'bacon', names: ['ベーコン'] },
  { file: 'ham', names: ['ハム'] },
  { file: 'sausage', names: ['ウインナー', 'ウィンナー', 'ソーセージ'] },
  { file: 'salmon', names: ['鮭', 'さけ', 'サーモン', '塩鮭', '生鮭', '鮭 冷凍'] },
  { file: 'tuna', names: ['シーチキン', 'ツナ', 'ツナ缶'] },
  { file: 'mentaiko', names: ['明太子', 'めんたいこ'] },
  { file: 'tofu', names: ['豆腐', '絹豆腐', '木綿豆腐'] },
  { file: 'natto', names: ['納豆'] },
  { file: 'kimchi', names: ['キムチ'] },
  { file: 'kanikama', names: ['カニカマ', 'かにかま'] },
  { file: 'mekabu', names: ['めかぶ'] },
  { file: 'aburaage', names: ['油揚げ'] },
  { file: 'takuan', names: ['たくあん', '沢庵'] },
  { file: 'cabbage', names: ['キャベツ'] },
  { file: 'lettuce', names: ['レタス'] },
  { file: 'onion', names: ['玉ねぎ', 'たまねぎ', '玉葱'] },
  { file: 'carrot', names: ['にんじん', '人参'] },
  { file: 'potato', names: ['じゃがいも', 'ジャガイモ'] },
  { file: 'daikon', names: ['大根'] },
  { file: 'tomato', names: ['トマト', 'ミニトマト', 'プチトマト'] },
  { file: 'tomato_can', names: ['あらごしトマト', 'トマト缶', 'カットトマト', 'ホールトマト'] },
  { file: 'cucumber', names: ['きゅうり', '胡瓜'] },
  { file: 'eggplant', names: ['なす', 'ナス', '茄子'] },
  { file: 'pepper', names: ['ピーマン'] },
  { file: 'spinach', names: ['ほうれん草', '小松菜'] },
  { file: 'negi', names: ['ねぎ', '長ねぎ', '長ネギ', '青ねぎ'] },
  { file: 'moyashi', names: ['もやし'] },
  { file: 'broccoli', names: ['ブロッコリー'] },
  { file: 'okra', names: ['オクラ'] },
  { file: 'renkon', names: ['れんこん', 'レンコン', '蓮根'] },
  { file: 'shimeji', names: ['しめじ', 'ぶなしめじ'] },
  { file: 'shiitake', names: ['しいたけ', '椎茸'] },
  { file: 'enoki', names: ['えのき', 'えのき茸'] },
  { file: 'maitake', names: ['まいたけ', '舞茸'] },
  { file: 'apple', names: ['りんご'] },
  { file: 'banana', names: ['バナナ'] },
  { file: 'rice', names: ['ご飯', '米', 'お米', '白米'] },
  { file: 'bread', names: ['食パン', 'パン'] },
  { file: 'udon', names: ['うどん', '冷凍うどん', 'ゆでうどん'] },
  { file: 'pasta', names: ['パスタ', 'スパゲッティ', 'スパゲティ'] },
  { file: 'somen', names: ['そうめん', '素麺'] },
  { file: 'soba', names: ['そば', '蕎麦'] },
  { file: 'chuka', names: ['冷やし中華麺', '中華麺', '冷やし中華'] },
  { file: 'curry_roux', names: ['カレールー'] },
  { file: 'hayashi_roux', names: ['ハヤシルー', 'ハヤシライスルー'] },
  { file: 'basil', names: ['バジルソース', 'ジェノベーゼ'] },
]

const urls = import.meta.glob<string>('./svg/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})

const byName = new Map(
  ILLUSTRATIONS.flatMap(({ file, names }) => names.map((n) => [n, urls[`./svg/${file}.svg`]])),
)

const tableNames = [...byName.keys()]

/**
 * 食材名に当てはまる対応表の名前を返す（D-67）。完全一致か、先頭が一致してすぐ後ろが区切り
 * （文字＝ひらがな・カタカナ・漢字・英字以外。空白・数字・記号）のもの。複数あれば長いほう
 */
export function matchIllustrationName(name: string, names: readonly string[]): string | null {
  const trimmed = name.trim()
  let best: string | null = null
  for (const n of names) {
    if (best && n.length <= best.length) continue
    if (trimmed === n || (trimmed.startsWith(n) && /^\P{L}/u.test(trimmed.slice(n.length))))
      best = n
  }
  return best
}

/** 食材名のイラストの URL を返す（前後の空白は除く）。ないときは null（作成中） */
export function illustrationFor(name: string): string | null {
  const matched = matchIllustrationName(name, tableNames)
  return matched ? (byName.get(matched) ?? null) : null
}

/** イラストのない食材名を、重複なく五十音順で返す */
export function missingIllustrations(names: string[]): string[] {
  return [...new Set(names.filter((n) => !illustrationFor(n)))].toSorted((a, b) =>
    a.localeCompare(b, 'ja'),
  )
}

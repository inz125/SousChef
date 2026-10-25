// CI で、統合テスト・E2E が必要な変更かを判定する。ドキュメントだけの変更ではテストの結果は変わらないので省く。
// 判定できないときは安全側に倒して「必要」とする。
//
//   BASE_SHA=... HEAD_SHA=... node scripts/ci-changes.mjs   → GITHUB_OUTPUT に tests=true|false
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const isDoc = (file) => file.startsWith('docs/') || file.endsWith('.md')

/** 変更されたファイルの一覧から、テストが必要か返す */
export function needsTests(files) {
  return files.length === 0 || !files.every(isDoc)
}

function changedFiles(base, head) {
  // ブランチの作成直後などは比較元がない（0 が並ぶ）
  if (!base || /^0+$/.test(base)) return []
  try {
    return execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    // 強制 push で比較元が消えた場合など
    return []
  }
}

if (import.meta.main) {
  const files = changedFiles(process.env.BASE_SHA, process.env.HEAD_SHA ?? 'HEAD')
  const tests = needsTests(files)
  console.log(
    `変更されたファイル: ${files.length} 件 → 統合テスト・E2E: ${tests ? '実行' : '省略'}`,
  )
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tests=${tests}\n`)
}

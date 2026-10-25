// public/icon.svg から PWA・iPhone 用の PNG アイコンを生成する。アイコンを変えたら再実行する
//   node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const publicDir = resolve(import.meta.dirname, '..', 'public')
const svg = readFileSync(resolve(publicDir, 'icon.svg'), 'utf8')

const icons = [
  { file: 'apple-touch-icon.png', size: 180, padding: 0 },
  { file: 'pwa-192x192.png', size: 192, padding: 0 },
  { file: 'pwa-512x512.png', size: 512, padding: 0 },
  // Android などで丸や角丸に切り抜かれても欠けないよう、余白を取る
  { file: 'maskable-512x512.png', size: 512, padding: 0.1 },
]

const browser = await chromium.launch()
for (const { file, size, padding } of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  const inner = Math.round(size * (1 - padding * 2))
  await page.setContent(
    `<body style="margin:0;background:#34a853;display:flex;align-items:center;justify-content:center;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg', `<svg width="${inner}" height="${inner}"`)}</div>
    </body>`,
  )
  await page.screenshot({ path: resolve(publicDir, file) })
  await page.close()
}
await browser.close()
console.log(`generated ${icons.length} icons`)

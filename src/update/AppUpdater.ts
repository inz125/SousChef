/** 新しいバージョンの確認と反映（D-52）。本番は Service Worker、テストは Fake を使う */
export interface AppUpdater {
  /** 新しいバージョンが見つかったときに呼ぶ関数を登録する。戻り値で登録を解除する */
  onNeedRefresh(listener: () => void): () => void
  /** 新しいバージョンがあるかを確認する */
  check(): Promise<void>
  /** 新しいバージョンに切り替えて再読み込みする */
  apply(): void
}

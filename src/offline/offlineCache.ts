// オフライン時の閲覧（D-17）。最後に取得した在庫・補完候補・★保存したレシピを端末に保存し、
// 取得できないときはそれを返す。編集は元の保存先にそのまま渡す（オフラインでは失敗する）
import type { InventoryRepository } from '../inventory/InventoryRepository'
import type { RecipesRepository } from '../recipes/RecipesRepository'

export type KeyValueStore = {
  get(key: string): string | null
  set(key: string, value: string): void
}

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) }
}

/** 端末の localStorage。使えない環境（プライベートブラウズなど）では何も保存しない */
export function localStore(): KeyValueStore {
  return {
    get(key) {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value)
      } catch {
        // 保存できなくてもオンライン時の動作には影響しない
      }
    },
  }
}

export type IsOnline = () => boolean

const browserOnline: IsOnline = () => typeof navigator === 'undefined' || navigator.onLine

/**
 * 取得できたら保存し、失敗したら最後に保存した値を返す。
 * 端末がオフラインと分かっているときは通信しない（supabase-js は失敗すると再試行し、表示まで数秒かかるため）
 */
function cached<T>(store: KeyValueStore, key: string, load: () => Promise<T>, isOnline: IsOnline) {
  const fromStore = (): T | null => {
    const saved = store.get(key)
    if (saved === null) return null
    try {
      return JSON.parse(saved) as T
    } catch {
      return null
    }
  }

  return async (): Promise<T> => {
    if (!isOnline()) {
      const saved = fromStore()
      if (saved !== null) return saved
    }
    try {
      const value = await load()
      store.set(key, JSON.stringify(value))
      return value
    } catch (error) {
      const saved = fromStore()
      if (saved === null) throw error
      return saved
    }
  }
}

export function cachedInventoryRepository(
  repo: InventoryRepository,
  store: KeyValueStore,
  isOnline: IsOnline = browserOnline,
): InventoryRepository {
  return {
    ...bindAll(repo),
    list: cached(store, 'souschef:inventory', () => repo.list(), isOnline),
    catalog: cached(store, 'souschef:catalog', () => repo.catalog(), isOnline),
  }
}

export function cachedRecipesRepository(
  repo: RecipesRepository,
  store: KeyValueStore,
  isOnline: IsOnline = browserOnline,
): RecipesRepository {
  return {
    ...bindAll(repo),
    savedDishes: cached(store, 'souschef:saved-dishes', () => repo.savedDishes(), isOnline),
  }
}

/** クラスのインスタンスでもメソッドを分割代入で渡せるよう、this を固定したコピーを作る */
function bindAll<T extends object>(obj: T): T {
  const proto = Object.getPrototypeOf(obj)
  const names = new Set([
    ...Object.keys(obj),
    ...(proto === Object.prototype ? [] : Object.getOwnPropertyNames(proto)),
  ])
  const bound: Record<string, unknown> = {}
  for (const name of names) {
    if (name === 'constructor') continue
    const value = (obj as Record<string, unknown>)[name]
    bound[name] = typeof value === 'function' ? value.bind(obj) : value
  }
  return bound as T
}

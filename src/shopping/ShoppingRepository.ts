import type { ShoppingItem } from '../domain/shopping'

/** 買い物リストに入れた結果。チェックしていない同じ名前の品物があれば重ねず existing に入る（D-74） */
export type AddResult = { added: string[]; existing: string[] }

/** 買い物リスト（D-72）と常備食品（D-71）の保存先の境界。本番は Supabase、テストは FakeShoppingRepository */
export interface ShoppingRepository {
  list(): Promise<ShoppingItem[]>
  /** 名前を入れた順に載せる */
  add(names: string[]): Promise<AddResult>
  /** チェックを外したとき、チェックしていない同じ名前の品物がすでにあれば 1 つにまとめる */
  setChecked(id: string, checked: boolean): Promise<void>
  remove(id: string): Promise<void>
  /** チェックした品物をまとめて消す */
  clearChecked(): Promise<void>
  /** 常備食品の名前（登録した順） */
  stocked(): Promise<string[]>
  /** 登録すると、当たる在庫が「ある」でなければ買い物リストにも載る（サーバのトリガー。D-73） */
  addStocked(name: string): Promise<void>
  removeStocked(name: string): Promise<void>
  /** 買い物リスト・常備食品の変更を購読する（自分の変更も届く）。購読が始まってから解決し、購読解除関数を返す */
  subscribe(listener: () => void): Promise<() => void>
}

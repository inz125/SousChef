import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShoppingItem } from '../domain/shopping'
import type { ShoppingRepository } from './ShoppingRepository'

type Row = { id: string; name: string; checked: boolean; created_at: string }

/** 一意制約の違反（PostgreSQL のエラーコード） */
const UNIQUE_VIOLATION = '23505'

const fromRow = (r: Row): ShoppingItem => ({
  id: r.id,
  name: r.name,
  checked: r.checked,
  createdAt: r.created_at,
})

export function createSupabaseShoppingRepository(client: SupabaseClient): ShoppingRepository {
  const items = () => client.from('shopping_items')
  const stocked = () => client.from('stocked_foods')

  return {
    async list() {
      const { data, error } = await items()
        .select('id, name, checked, created_at')
        .order('created_at')
        .returns<Row[]>()
      if (error) throw error
      return data.map(fromRow)
    },
    async add(names) {
      const { data, error } = await client.rpc('add_shopping_items', { names })
      if (error) throw error
      const rows = (data ?? []) as { name: string; added: boolean }[]
      return {
        added: rows.filter((r) => r.added).map((r) => r.name),
        existing: rows.filter((r) => !r.added).map((r) => r.name),
      }
    },
    async setChecked(id, checked) {
      const { error } = await items().update({ checked }).eq('id', id)
      if (!error) return
      // チェックを外したら、チェックしていない同じ名前とぶつかった。1 つにまとめる
      if (error.code !== UNIQUE_VIOLATION) throw error
      const { error: e } = await items().delete().eq('id', id)
      if (e) throw e
    },
    async remove(id) {
      const { error } = await items().delete().eq('id', id)
      if (error) throw error
    },
    async clearChecked() {
      const { error } = await items().delete().eq('checked', true)
      if (error) throw error
    },
    async stocked() {
      const { data, error } = await stocked()
        .select('name')
        .order('created_at')
        .returns<{ name: string }[]>()
      if (error) throw error
      return data.map((r) => r.name)
    },
    async addStocked(name) {
      const { error } = await stocked().insert({ name })
      if (error) throw error
    },
    async removeStocked(name) {
      const { error } = await stocked().delete().eq('name', name)
      if (error) throw error
    },
    subscribe(listener) {
      const channel = client
        .channel(`shopping-${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () =>
          listener(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stocked_foods' }, () =>
          listener(),
        )
      const unsubscribe = () => void client.removeChannel(channel)
      return new Promise((resolve, reject) => {
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') resolve(unsubscribe)
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(err ?? new Error(`購読に失敗しました: ${status}`))
          }
        })
      })
    },
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InventoryItem, NewInventoryItem } from '../domain/inventory'
import type { CatalogEntry, InventoryEvent, InventoryRepository } from './InventoryRepository'

type Row = {
  id: string
  name: string
  category: InventoryItem['category']
  location: InventoryItem['location']
  quantity: InventoryItem['quantity']
  expires_on: string | null
  expires_on_estimated: boolean
}

const COLUMNS = 'id, name, category, location, quantity, expires_on, expires_on_estimated'

const fromRow = (r: Row): InventoryItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  location: r.location,
  quantity: r.quantity,
  expiresOn: r.expires_on,
  expiresOnEstimated: r.expires_on_estimated,
})

type EventRow = {
  action: InventoryEvent['action']
  item_name: string
  actor_email: string
  actor_name: string
}

const toRow = (i: NewInventoryItem) => ({
  name: i.name,
  category: i.category,
  location: i.location,
  quantity: i.quantity,
  expires_on: i.expiresOn,
  expires_on_estimated: i.expiresOnEstimated,
})

export function createSupabaseInventoryRepository(client: SupabaseClient): InventoryRepository {
  const items = () => client.from('inventory_items')

  return {
    async list() {
      const { data, error } = await items().select(COLUMNS).returns<Row[]>()
      if (error) throw error
      return data.map(fromRow)
    },
    async add(item) {
      const { data, error } = await items().insert(toRow(item)).select(COLUMNS).single<Row>()
      if (error) throw error
      return fromRow(data)
    },
    async update(item) {
      const { error } = await items().update(toRow(item)).eq('id', item.id)
      if (error) throw error
    },
    async updateQuantity(id, quantity) {
      const { error } = await items().update({ quantity }).eq('id', id)
      if (error) throw error
    },
    async remove(id) {
      const { error } = await items().delete().eq('id', id)
      if (error) throw error
    },
    async restore(item) {
      const { error } = await items().insert({ id: item.id, ...toRow(item) })
      if (error) throw error
    },
    async catalog() {
      const { data, error } = await client
        .from('food_catalog')
        .select('name, category, location')
        .returns<CatalogEntry[]>()
      if (error) throw error
      return data
    },
    subscribe(listener) {
      const channel = client
        .channel(`inventory-events-${crypto.randomUUID()}`)
        .on<EventRow>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'inventory_events' },
          ({ new: e }) =>
            listener({
              action: e.action,
              itemName: e.item_name,
              actorEmail: e.actor_email,
              actorName: e.actor_name,
            }),
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

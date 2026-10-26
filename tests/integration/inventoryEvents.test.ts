import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewInventoryItem } from '../../src/domain/inventory'
import type { InventoryEvent } from '../../src/inventory/InventoryRepository'
import { createSupabaseInventoryRepository } from '../../src/inventory/supabaseInventoryRepository'
import { adminClient, createUser, signedInClient, uniqueEmail } from '../support/supabase'

const newItem = (name: string): NewInventoryItem => ({
  name,
  category: 'dairy',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: null,
  expiresOnEstimated: false,
  thawedOn: null,
})

/** 条件に合うイベントが届くまで待つ */
function waitFor(events: InventoryEvent[], match: (e: InventoryEvent) => boolean, ms = 5000) {
  return new Promise<InventoryEvent>((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const found = events.find(match)
      if (found) {
        clearInterval(timer)
        resolve(found)
      } else if (Date.now() - started > ms) {
        clearInterval(timer)
        reject(new Error('イベントが届きませんでした'))
      }
    }, 50)
  })
}

/**
 * Realtime は起動直後しばらく変更を配信しない（購読は成功する）。
 * 試しの変更を流し、実際にイベントが届くようになるまで待つ
 */
async function waitUntilRealtimeDelivers(listener: SupabaseClient, actor: SupabaseClient) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const events: InventoryEvent[] = []
    const unsubscribe = await createSupabaseInventoryRepository(listener).subscribe((e) =>
      events.push(e),
    )
    try {
      const name = `準備確認-${crypto.randomUUID()}`
      const added = await createSupabaseInventoryRepository(actor).add(newItem(name))
      await createSupabaseInventoryRepository(actor).remove(added.id)
      await waitFor(events, (e) => e.itemName === name, 1000)
      return
    } catch {
      // まだ配信されていない
    } finally {
      unsubscribe()
    }
  }
  throw new Error('Realtime がイベントを配信しませんでした')
}

describe('在庫の変更イベント（D-30）', () => {
  let wife: SupabaseClient
  let husband: SupabaseClient
  let wifeEmail: string
  let husbandEmail: string

  beforeAll(async () => {
    wifeEmail = uniqueEmail('wife')
    husbandEmail = uniqueEmail('husband')
    await createUser(wifeEmail, { allowed: true, displayName: 'はな' })
    await createUser(husbandEmail, { allowed: true, displayName: 'けん' })
    wife = await signedInClient(wifeEmail)
    husband = await signedInClient(husbandEmail)
    await waitUntilRealtimeDelivers(husband, wife)
  }, 60_000)

  it('追加・変更・削除を、誰がどの食材に行ったかとして受け取れる', async () => {
    const events: InventoryEvent[] = []
    const unsubscribe = await createSupabaseInventoryRepository(husband).subscribe((e) =>
      events.push(e),
    )
    try {
      const repo = createSupabaseInventoryRepository(wife)
      const name = `牛乳-${crypto.randomUUID()}`
      const added = await repo.add(newItem(name))
      await repo.updateQuantity(added.id, 'low')
      await repo.remove(added.id)

      for (const action of ['added', 'updated', 'removed'] as const) {
        expect(await waitFor(events, (e) => e.itemName === name && e.action === action)).toEqual({
          action,
          itemName: name,
          actorEmail: wifeEmail,
          actorName: 'はな',
        })
      }
    } finally {
      unsubscribe()
    }
  })

  it('表示名が未設定ならメールアドレスの @ より前を使う', async () => {
    const email = uniqueEmail('noname')
    await createUser(email, { allowed: true })
    const events: InventoryEvent[] = []
    const unsubscribe = await createSupabaseInventoryRepository(husband).subscribe((e) =>
      events.push(e),
    )
    try {
      const name = `卵-${crypto.randomUUID()}`
      await createSupabaseInventoryRepository(await signedInClient(email)).add(newItem(name))
      const event = await waitFor(events, (e) => e.itemName === name)
      expect(event.actorName).toBe(email.split('@')[0])
    } finally {
      unsubscribe()
    }
  })

  it('許可リストにないユーザーはイベントを受け取れない', async () => {
    const strangerEmail = uniqueEmail('stranger')
    await createUser(strangerEmail, { allowed: false })
    const events: InventoryEvent[] = []
    const unsubscribe = await createSupabaseInventoryRepository(
      await signedInClient(strangerEmail),
    ).subscribe((e) => events.push(e))
    try {
      const name = `秘密-${crypto.randomUUID()}`
      await createSupabaseInventoryRepository(wife).add(newItem(name))
      await expect(waitFor(events, (e) => e.itemName === name, 1500)).rejects.toThrow()
    } finally {
      unsubscribe()
    }
  })

  it('イベントを直接書き込んで他人になりすますことはできない', async () => {
    const { error } = await wife.from('inventory_events').insert({
      action: 'added',
      item_name: 'なりすまし',
      actor_email: husbandEmail,
      actor_name: 'けん',
    })
    expect(error?.message).toMatch(/row-level security|permission denied/i)
    const { count } = await adminClient()
      .from('inventory_events')
      .select('*', { count: 'exact', head: true })
      .eq('item_name', 'なりすまし')
    expect(count).toBe(0)
  })
})

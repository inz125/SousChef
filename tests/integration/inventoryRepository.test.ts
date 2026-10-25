import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewInventoryItem } from '../../src/domain/inventory'
import { createSupabaseInventoryRepository } from '../../src/inventory/supabaseInventoryRepository'
import { anonClient, createUser, signedInClient, uniqueEmail } from '../support/supabase'

const newItem = (over: Partial<NewInventoryItem> = {}): NewInventoryItem => ({
  name: `豚バラ肉-${crypto.randomUUID()}`,
  category: 'meat',
  location: 'fridge',
  quantity: 'enough',
  expiresOn: '2026-10-28',
  expiresOnEstimated: true,
  ...over,
})

describe('createSupabaseInventoryRepository', () => {
  let client: SupabaseClient

  beforeAll(async () => {
    const email = uniqueEmail('repo')
    await createUser(email, { allowed: true })
    client = await signedInClient(email)
  })

  it('追加した食材を一覧で取得できる', async () => {
    const repo = createSupabaseInventoryRepository(client)
    const added = await repo.add(newItem({ name: '牛乳-repo' }))
    expect(added.id).toBeTruthy()
    expect(await repo.list()).toContainEqual(added)
  })

  it('量を更新できる', async () => {
    const repo = createSupabaseInventoryRepository(client)
    const added = await repo.add(newItem())
    await repo.updateQuantity(added.id, 'low')
    const found = (await repo.list()).find((i) => i.id === added.id)
    expect(found?.quantity).toBe('low')
  })

  it('削除した食材を同じ ID で元に戻せる', async () => {
    const repo = createSupabaseInventoryRepository(client)
    const added = await repo.add(newItem())
    await repo.remove(added.id)
    expect((await repo.list()).map((i) => i.id)).not.toContain(added.id)
    await repo.restore(added)
    expect(await repo.list()).toContainEqual(added)
  })

  it('追加した食材は削除後も補完候補に残り、最新のカテゴリ・場所で上書きされる', async () => {
    const repo = createSupabaseInventoryRepository(client)
    const name = `にんじん-${crypto.randomUUID()}`
    const first = await repo.add(newItem({ name, category: 'root', location: 'fridge' }))
    await repo.add(newItem({ name, category: 'root', location: 'vegetable' }))
    await repo.remove(first.id)

    const entries = (await repo.catalog()).filter((e) => e.name === name)
    expect(entries).toEqual([{ name, category: 'root', location: 'vegetable' }])
  })

  it('許可リストにないユーザーは補完候補を読めない', async () => {
    const repo = createSupabaseInventoryRepository(client)
    const name = `秘密の食材-${crypto.randomUUID()}`
    await repo.add(newItem({ name }))

    const strangerEmail = uniqueEmail('stranger')
    await createUser(strangerEmail, { allowed: false })
    const stranger = createSupabaseInventoryRepository(await signedInClient(strangerEmail))
    expect((await stranger.catalog()).map((e) => e.name)).not.toContain(name)

    const anon = createSupabaseInventoryRepository(anonClient())
    expect((await anon.catalog()).map((e) => e.name)).not.toContain(name)
  })
})

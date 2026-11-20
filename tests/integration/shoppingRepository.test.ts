import type { SupabaseClient } from '@supabase/supabase-js'
import type { NewInventoryItem } from '../../src/domain/inventory'
import { namesMatch } from '../../src/domain/shopping'
import { createSupabaseInventoryRepository } from '../../src/inventory/supabaseInventoryRepository'
import { createSupabaseShoppingRepository } from '../../src/shopping/supabaseShoppingRepository'
import type { ShoppingRepository } from '../../src/shopping/ShoppingRepository'
import {
  adminClient,
  anonClient,
  createUser,
  signedInClient,
  uniqueEmail,
} from '../support/supabase'

const newItem = (name: string, quantity: NewInventoryItem['quantity'] = 'enough') =>
  ({
    name,
    category: 'dairy',
    location: 'fridge',
    quantity,
    expiresOn: null,
    expiresOnEstimated: false,
    thawedOn: null,
  }) satisfies NewInventoryItem

/** テストで作ったデータだけを見る（世帯で共有しているので、ほかのテストのデータが混ざる） */
const suffixes: string[] = []
const uid = () => {
  const u = crypto.randomUUID().slice(0, 8)
  suffixes.push(u)
  return u
}

// 常備食品は名前の一部が当たる在庫すべてに効くので、ほかのテストに残さない
afterAll(async () => {
  const admin = adminClient()
  for (const u of suffixes) {
    await admin.from('stocked_foods').delete().like('name', `%${u}`)
    await admin.from('shopping_items').delete().like('name', `%${u}`)
    await admin.from('inventory_items').delete().like('name', `%${u}`)
  }
})

describe('createSupabaseShoppingRepository（D-71〜D-74）', () => {
  let wifeEmail: string
  let wife: SupabaseClient
  let husband: SupabaseClient
  let shop: ShoppingRepository

  const namesOnList = async (repo: ShoppingRepository, suffix: string) =>
    (await repo.list()).filter((i) => i.name.endsWith(suffix))

  beforeAll(async () => {
    wifeEmail = uniqueEmail('wife')
    const husbandEmail = uniqueEmail('husband')
    await createUser(wifeEmail, { allowed: true, displayName: 'はな' })
    await createUser(husbandEmail, { allowed: true, displayName: 'けん' })
    wife = await signedInClient(wifeEmail)
    husband = await signedInClient(husbandEmail)
    shop = createSupabaseShoppingRepository(wife)
  })

  describe('買い物リスト（D-72・D-74）', () => {
    it('入れた品物は入れた順に並び、もう一人からも見える。入れた人はログイン中のユーザー', async () => {
      const u = uid()
      const result = await shop.add([`牛乳${u}`, `卵${u}`])
      expect(result).toEqual({ added: [`牛乳${u}`, `卵${u}`], existing: [] })
      await shop.add([`豆腐${u}`])

      const list = await namesOnList(createSupabaseShoppingRepository(husband), u)
      expect(list.map((i) => i.name)).toEqual([`牛乳${u}`, `卵${u}`, `豆腐${u}`])
      expect(list.every((i) => !i.checked)).toBe(true)

      const { data } = await adminClient()
        .from('shopping_items')
        .select('created_by')
        .eq('name', `牛乳${u}`)
      expect(data).toEqual([{ created_by: wifeEmail.toLowerCase() }])
    })

    it('チェックしていない同じ名前があれば重ねて入れない。チェックしたものだけなら新しく入る', async () => {
      const u = uid()
      await shop.add([`豆腐${u}`])
      expect(await shop.add([`豆腐${u}`, `長ねぎ${u}`])).toEqual({
        added: [`長ねぎ${u}`],
        existing: [`豆腐${u}`],
      })
      const [tofu] = await namesOnList(shop, `豆腐${u}`)
      await shop.setChecked(tofu.id, true)
      expect(await shop.add([`豆腐${u}`])).toEqual({ added: [`豆腐${u}`], existing: [] })
      const tofus = await namesOnList(shop, `豆腐${u}`)
      expect(tofus.map((i) => i.checked).toSorted()).toEqual([false, true])
    })

    it('チェックを外したとき、チェックしていない同じ名前があれば 1 つにまとめる', async () => {
      const u = uid()
      await shop.add([`納豆${u}`])
      const [first] = await namesOnList(shop, u)
      await shop.setChecked(first.id, true)
      await shop.add([`納豆${u}`])
      await shop.setChecked(first.id, false)
      const list = await namesOnList(shop, u)
      expect(list.map((i) => [i.name, i.checked])).toEqual([[`納豆${u}`, false]])
    })

    it('削除と「チェック済みを消す」', async () => {
      const u = uid()
      await shop.add([`a${u}`, `b${u}`, `c${u}`])
      const [a, b] = await namesOnList(shop, u)
      await shop.setChecked(b.id, true)
      await shop.remove(a.id)
      await shop.clearChecked()
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`c${u}`])
    })
  })

  describe('常備食品（D-71）', () => {
    it('登録した順に並び、もう一人と共有する。同じ名前は重ねて登録できない', async () => {
      const u = uid()
      // 在庫に「ある」で入れておき、登録で買い物リストに載らないようにする
      const inv = createSupabaseInventoryRepository(wife)
      await inv.add(newItem(`牛乳${u}`))
      await inv.add(newItem(`卵${u}`))
      await shop.addStocked(`牛乳${u}`)
      await shop.addStocked(`卵${u}`)
      const theirs = createSupabaseShoppingRepository(husband)
      expect((await theirs.stocked()).filter((n) => n.endsWith(u))).toEqual([`牛乳${u}`, `卵${u}`])
      await expect(shop.addStocked(`牛乳${u}`)).rejects.toThrow()
      await theirs.removeStocked(`牛乳${u}`)
      expect((await shop.stocked()).filter((n) => n.endsWith(u))).toEqual([`卵${u}`])
      expect(await namesOnList(shop, u)).toEqual([])
    })
  })

  describe('常備食品を自動で載せる（D-73）', () => {
    it('「少ない」にすると、その常備食品の名前で載る', async () => {
      const u = uid()
      const inv = createSupabaseInventoryRepository(wife)
      const milk = await inv.add(newItem(`低脂肪牛乳${u}`))
      await shop.addStocked(`牛乳${u}`)
      expect(await namesOnList(shop, u)).toEqual([])

      await inv.updateQuantity(milk.id, 'low')
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`牛乳${u}`])

      // もう一度「少ない」の行を変えても重ならない。「ある」に戻しても消えない
      await inv.updateQuantity(milk.id, 'enough')
      await inv.updateQuantity(milk.id, 'low')
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`牛乳${u}`])
    })

    it('もう一人が削除しても載り、「元に戻す」でその品物が消える', async () => {
      const u = uid()
      const milk = await createSupabaseInventoryRepository(wife).add(newItem(`牛乳${u}`))
      await shop.addStocked(`牛乳${u}`)
      const theirInv = createSupabaseInventoryRepository(husband)
      await theirInv.remove(milk.id)
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`牛乳${u}`])

      await theirInv.restore(milk)
      expect(await namesOnList(shop, u)).toEqual([])
    })

    it('手で入れた品物は「元に戻す」で消えない', async () => {
      const u = uid()
      const inv = createSupabaseInventoryRepository(wife)
      const cabbage = await inv.add(newItem(`キャベツ${u}`))
      await inv.remove(cabbage.id)
      await shop.add([`キャベツ${u}`])
      await inv.restore(cabbage)
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`キャベツ${u}`])
    })

    it('同じ常備食品に当たるほかの在庫が「ある」なら載らない。「少ない」だけなら載る', async () => {
      const u = uid()
      const inv = createSupabaseInventoryRepository(wife)
      const frozen = await inv.add({ ...newItem(`鶏もも肉${u}`), location: 'freezer' })
      const thawing = await inv.add(newItem(`鶏もも肉${u}`))
      await shop.addStocked(`鶏もも肉${u}`)
      await inv.remove(thawing.id)
      expect(await namesOnList(shop, u)).toEqual([])

      const egg = await inv.add(newItem(`卵${u}`))
      await inv.add(newItem(`卵${u}`, 'low'))
      await shop.addStocked(`卵${u}`)
      await inv.remove(egg.id)
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`卵${u}`])
      await inv.remove(frozen.id)
    })

    it('常備食品を登録したとき、当たる在庫が「ある」でなければすぐ載る', async () => {
      const u = uid()
      const inv = createSupabaseInventoryRepository(wife)
      await inv.add(newItem(`牛乳${u}`, 'low'))
      await inv.add(newItem(`卵${u}`))
      await shop.addStocked(`納豆${u}`)
      await shop.addStocked(`牛乳${u}`)
      await shop.addStocked(`卵${u}`)
      expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`納豆${u}`, `牛乳${u}`])
    })

    it('常備でない在庫は「少ない」・削除で載らない', async () => {
      const u = uid()
      const inv = createSupabaseInventoryRepository(wife)
      const a = await inv.add(newItem(`キャベツ${u}`))
      const b = await inv.add(newItem(`にんじん${u}`))
      await inv.updateQuantity(a.id, 'low')
      await inv.remove(b.id)
      expect(await namesOnList(shop, u)).toEqual([])
    })
  })

  it('サーバの名前の照らし合わせは namesMatch と同じ結果になる', async () => {
    const pairs = [
      ['牛乳', '牛乳'],
      ['牛乳', '低脂肪牛乳'],
      ['低脂肪牛乳', '牛乳'],
      ['牛乳', '卵'],
      ['鶏もも肉', '鶏むね肉'],
    ]
    for (const [a, b] of pairs) {
      const { data, error } = await wife.rpc('names_match', { a, b })
      expect(error).toBeNull()
      expect(data).toBe(namesMatch(a, b))
    }
  })

  it('もう一人の変更が購読で届く', async () => {
    const u = uid()
    let count = 0
    const unsubscribe = await createSupabaseShoppingRepository(husband).subscribe(() => count++)
    try {
      // Realtime は起動直後しばらく配信しないので、届くまで何度か変える
      for (let attempt = 0; attempt < 20 && count === 0; attempt++) {
        await shop.add([`購読確認${attempt}-${u}`])
        await new Promise((r) => setTimeout(r, 500))
      }
      expect(count).toBeGreaterThan(0)
    } finally {
      unsubscribe()
    }
  })

  it('許可リストにないユーザー・未ログインは読み書きできない', async () => {
    const u = uid()
    await shop.add([`秘密${u}`])
    await shop.addStocked(`秘密の常備${u}`)
    const strangerEmail = uniqueEmail('stranger')
    await createUser(strangerEmail, { allowed: false })
    for (const client of [await signedInClient(strangerEmail), anonClient()]) {
      const repo = createSupabaseShoppingRepository(client)
      expect(await namesOnList(repo, u)).toEqual([])
      expect((await repo.stocked()).filter((n) => n.endsWith(u))).toEqual([])
      await expect(repo.add([`いたずら${u}`])).rejects.toThrow()
      await expect(repo.addStocked(`いたずら${u}`)).rejects.toThrow()
    }
    // 「秘密の常備」は登録したときに在庫がないので自動で載っている
    expect((await namesOnList(shop, u)).map((i) => i.name)).toEqual([`秘密${u}`, `秘密の常備${u}`])
  })
})

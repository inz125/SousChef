// suggest-meals の DB アクセス。呼び出したユーザーの JWT で接続するので、RLS がそのまま効く
import { createClient } from '@supabase/supabase-js'
import type { MealContext } from './meals.ts'
import { consumeAiQuota } from './supabaseQuota.ts'
import type { SuggestMealsDeps } from './suggestMealsHandler.ts'

/** 1 日の提案回数の上限（D-21）の初期値 */
export const MEAL_DAILY_LIMIT = 20

type MemberRow = {
  display_name: string | null
  email: string
  member_preferences:
    | { dislikes: string[]; allergies: string[] }
    | { dislikes: string[]; allergies: string[] }[]
    | null
}

/** 直近何日間に作った料理を避けるか（D-38）。今日を含む */
const RECENT_DAYS = 7

/** 提案された料理を何日間残すか（D-51）。今日を含む */
const SUGGESTED_DAYS = 7

/** YYYY-MM-DD に日数を足す */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

const tokyoToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())

export function createSupabaseMealDeps(
  url: string,
  anonKey: string,
  { dailyLimit = MEAL_DAILY_LIMIT }: { dailyLimit?: number } = {},
): Omit<SuggestMealsDeps, 'suggest'> {
  const clientFor = (authorization: string) =>
    createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })

  return {
    consumeQuota: (authorization) => consumeAiQuota(clientFor(authorization), 'meal', dailyLimit),

    async loadContext(authorization): Promise<MealContext> {
      const db = clientFor(authorization)
      const today = tokyoToday()
      const [inventory, members, settings, history, saved] = await Promise.all([
        db.from('inventory_items').select('name, quantity, expires_on, location, thawed_on'),
        db
          .from('allowed_members')
          .select('email, display_name, member_preferences(dislikes, allergies)')
          .returns<MemberRow[]>(),
        db.from('household_settings').select('staples').maybeSingle<{ staples: string[] | null }>(),
        db
          .from('cooking_history')
          .select('dish_names')
          .gte('cooked_on', addDays(today, -(RECENT_DAYS - 1)))
          .returns<{ dish_names: string[] }[]>(),
        db
          .from('saved_dishes')
          .select('name, microwave')
          .order('saved_at', { ascending: false })
          .limit(30),
      ])
      for (const r of [inventory, members, settings, history, saved]) if (r.error) throw r.error

      return {
        today,
        inventory: (inventory.data ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          expiresOn: i.expires_on,
          frozen: i.location === 'freezer',
          thawing: i.location === 'fridge' && i.thawed_on !== null,
        })),
        members: (members.data ?? []).map((m) => {
          const prefs = Array.isArray(m.member_preferences)
            ? m.member_preferences[0]
            : m.member_preferences
          return {
            displayName: m.display_name ?? m.email.split('@')[0],
            dislikes: prefs?.dislikes ?? [],
            allergies: prefs?.allergies ?? [],
          }
        }),
        staples: settings.data?.staples ?? [],
        recentDishes: [...new Set((history.data ?? []).flatMap((h) => h.dish_names))],
        savedDishes: (saved.data ?? []).map((d) => d.name),
        microwaveDishes: (saved.data ?? []).filter((d) => d.microwave).map((d) => d.name),
      }
    },

    async recordSuggested(authorization, dishes) {
      const db = clientFor(authorization)
      const today = tokyoToday()
      const now = Date.now()
      // 一覧は新しい順なので、同じ提案の中では案の順に並ぶよう 1 ミリ秒ずつずらす。
      // actor_email / actor_name はトリガーがログイン中のユーザーで設定する
      const { error } = await db.from('suggested_dishes').upsert(
        dishes.map(({ dish, microwave }, i) => ({
          name: dish.name,
          dish,
          microwave,
          suggested_on: today,
          suggested_at: new Date(now - i).toISOString(),
          actor_email: '',
          actor_name: '',
        })),
      )
      if (error) throw error
      const { error: e } = await db
        .from('suggested_dishes')
        .delete()
        .lt('suggested_on', addDays(today, -(SUGGESTED_DAYS - 1)))
      if (e) throw e
    },
  }
}

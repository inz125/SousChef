import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays } from '../domain/expiry'
import {
  SUGGESTED_DAYS,
  type Dish,
  type RecipesRepository,
  type SavedDish,
} from './RecipesRepository'

export function createSupabaseRecipesRepository(client: SupabaseClient): RecipesRepository {
  const saved = () => client.from('saved_dishes')

  return {
    async savedDishes() {
      const { data, error } = await saved()
        .select('recipe, microwave')
        .order('saved_at', { ascending: false })
        .returns<{ recipe: Dish; microwave: boolean }[]>()
      if (error) throw error
      return data.map((r): SavedDish => ({ ...r.recipe, microwave: r.microwave }))
    },
    async saveDish(dish, microwave = false) {
      // ★一覧の料理（SavedDish）を保存し直しても、レシピには料理だけを入れる
      const { microwave: _, ...recipe } = dish as Partial<SavedDish>
      const { error } = await saved().upsert({
        name: dish.name,
        recipe,
        microwave,
        saved_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    async unsaveDish(name) {
      const { error } = await saved().delete().eq('name', name)
      if (error) throw error
    },
    async recordCooked(dishes) {
      // actor_email / actor_name はトリガーがログイン中のユーザーで設定する
      const { error } = await client.from('cooking_history').insert({
        dish_names: dishes.map((d) => d.name),
        dishes,
        actor_email: '',
        actor_name: '',
      })
      if (error) throw error
    },
    async history(from, to) {
      const { data, error } = await client
        .from('cooking_history')
        .select('cooked_on, dish_names, dishes, actor_name')
        .gte('cooked_on', from)
        .lte('cooked_on', to)
        .order('created_at', { ascending: false })
        .returns<
          { cooked_on: string; dish_names: string[]; dishes: Dish[] | null; actor_name: string }[]
        >()
      if (error) throw error
      return data.map((r) => ({
        cookedOn: r.cooked_on,
        dishNames: r.dish_names,
        dishes: r.dishes,
        actorName: r.actor_name,
      }))
    },
    async suggestedDishes(today) {
      const { data, error } = await client
        .from('suggested_dishes')
        .select('dish, microwave, suggested_on, actor_name')
        .gte('suggested_on', addDays(today, -(SUGGESTED_DAYS - 1)))
        .order('suggested_at', { ascending: false })
        .returns<{ dish: Dish; microwave: boolean; suggested_on: string; actor_name: string }[]>()
      if (error) throw error
      return data.map((r) => ({
        dish: r.dish,
        microwave: r.microwave,
        suggestedOn: r.suggested_on,
        actorName: r.actor_name,
      }))
    },
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Dish, RecipesRepository } from './RecipesRepository'

export function createSupabaseRecipesRepository(client: SupabaseClient): RecipesRepository {
  const saved = () => client.from('saved_dishes')

  return {
    async savedDishes() {
      const { data, error } = await saved()
        .select('recipe')
        .order('saved_at', { ascending: false })
        .returns<{ recipe: Dish }[]>()
      if (error) throw error
      return data.map((r) => r.recipe)
    },
    async saveDish(dish) {
      const { error } = await saved().upsert({
        name: dish.name,
        recipe: dish,
        saved_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    async unsaveDish(name) {
      const { error } = await saved().delete().eq('name', name)
      if (error) throw error
    },
    async recordCooked(dishNames) {
      // actor_email / actor_name はトリガーがログイン中のユーザーで設定する
      const { error } = await client
        .from('cooking_history')
        .insert({ dish_names: dishNames, actor_email: '', actor_name: '' })
      if (error) throw error
    },
    async history() {
      const { data, error } = await client
        .from('cooking_history')
        .select('cooked_on, dish_names, actor_name')
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<{ cooked_on: string; dish_names: string[]; actor_name: string }[]>()
      if (error) throw error
      return data.map((r) => ({
        cookedOn: r.cooked_on,
        dishNames: r.dish_names,
        actorName: r.actor_name,
      }))
    },
  }
}

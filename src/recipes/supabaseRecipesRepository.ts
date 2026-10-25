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
  }
}

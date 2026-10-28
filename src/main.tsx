import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createSupabaseAuth } from './auth/supabaseAuth.ts'
import { createSupabaseInventoryRepository } from './inventory/supabaseInventoryRepository.ts'
import { supabase } from './lib/supabase.ts'
import {
  cachedInventoryRepository,
  cachedRecipesRepository,
  localStore,
} from './offline/offlineCache.ts'
import { createSupabaseMealsApi } from './meals/supabaseMealsApi.ts'
import { createSupabaseReceiptApi } from './receipt/supabaseReceiptApi.ts'
import { createSupabaseRecipesRepository } from './recipes/supabaseRecipesRepository.ts'
import { createSupabaseSettingsRepository } from './settings/supabaseSettingsRepository.ts'
import { createPwaUpdater } from './update/pwaUpdater.ts'

// オフライン時は最後に同期した在庫・★レシピを表示する（D-17）。最後の提案結果も残す（D-43）
const store = localStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      auth={createSupabaseAuth(supabase)}
      inventory={cachedInventoryRepository(createSupabaseInventoryRepository(supabase), store)}
      settings={createSupabaseSettingsRepository(supabase)}
      meals={createSupabaseMealsApi(supabase)}
      receipt={createSupabaseReceiptApi(supabase)}
      recipes={cachedRecipesRepository(createSupabaseRecipesRepository(supabase), store)}
      store={store}
      updater={createPwaUpdater()}
      now={() => new Date()}
    />
  </StrictMode>,
)

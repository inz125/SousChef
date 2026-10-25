import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createSupabaseAuth } from './auth/supabaseAuth.ts'
import { createSupabaseInventoryRepository } from './inventory/supabaseInventoryRepository.ts'
import { supabase } from './lib/supabase.ts'
import { createSupabaseMealsApi } from './meals/supabaseMealsApi.ts'
import { createSupabaseSettingsRepository } from './settings/supabaseSettingsRepository.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      auth={createSupabaseAuth(supabase)}
      inventory={createSupabaseInventoryRepository(supabase)}
      settings={createSupabaseSettingsRepository(supabase)}
      meals={createSupabaseMealsApi(supabase)}
      now={() => new Date()}
    />
  </StrictMode>,
)

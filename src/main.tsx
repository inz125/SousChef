import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createSupabaseAuth } from './auth/supabaseAuth.ts'
import { toIsoDate } from './domain/expiry.ts'
import { createSupabaseInventoryRepository } from './inventory/supabaseInventoryRepository.ts'
import { supabase } from './lib/supabase.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      auth={createSupabaseAuth(supabase)}
      inventory={createSupabaseInventoryRepository(supabase)}
      today={toIsoDate(new Date())}
    />
  </StrictMode>,
)

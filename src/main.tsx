import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { createSupabaseAuth } from './auth/supabaseAuth.ts'
import { supabase } from './lib/supabase.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App auth={createSupabaseAuth(supabase)} />
  </StrictMode>,
)

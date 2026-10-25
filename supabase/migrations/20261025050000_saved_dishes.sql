-- ★保存した料理（D-36）。料理名で 1 つにまとめ、保存し直すとレシピを最新にする

create table public.saved_dishes (
  name text primary key,
  recipe jsonb not null,
  saved_at timestamptz not null default now()
);

alter table public.saved_dishes enable row level security;

create policy "許可メンバーは保存した料理を読み書きできる"
  on public.saved_dishes
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

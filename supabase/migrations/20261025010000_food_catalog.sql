-- 補完候補（D-26）: 在庫に追加した食材の名前と、最後に使ったカテゴリ・場所を覚える。
-- 「ない」で在庫から削除しても残る（D-09）

create table public.food_catalog (
  name text primary key,
  category text not null,
  location text not null,
  updated_at timestamptz not null default now()
);

alter table public.food_catalog enable row level security;

create policy "許可メンバーは補完候補を読み書きできる"
  on public.food_catalog
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

create function public.remember_food()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.food_catalog (name, category, location)
  values (new.name, new.category, new.location)
  on conflict (name) do update
    set category = excluded.category,
        location = excluded.location,
        updated_at = now();
  return new;
end;
$$;

create trigger remember_food
  after insert on public.inventory_items
  for each row execute function public.remember_food();

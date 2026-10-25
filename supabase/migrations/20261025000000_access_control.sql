-- アクセス制限（D-16）: 許可リストに登録したメールアドレスのユーザーだけが全データを共有する

create table public.allowed_members (
  email text primary key
);

-- ポリシーを定義しない = service role 以外は読み書きできない
alter table public.allowed_members enable row level security;

create function public.is_allowed_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_members
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

revoke execute on function public.is_allowed_member() from public, anon;
grant execute on function public.is_allowed_member() to authenticated;

-- 在庫（D-09, D-10, D-11, D-23）。「ない」になった食材は行を削除する
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text not null check (
    category in (
      'meat', 'fish', 'egg', 'dairy', 'soy', 'leafy',
      'root', 'mushroom', 'fruit', 'processed', 'staple', 'seasoning'
    )
  ),
  location text not null check (location in ('fridge', 'freezer', 'vegetable', 'pantry')),
  quantity text not null default 'enough' check (quantity in ('enough', 'low')),
  expires_on date,
  expires_on_estimated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create policy "許可メンバーは在庫を読み書きできる"
  on public.inventory_items
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

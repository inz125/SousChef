-- 好み・苦手・アレルギー（D-13）と常備調味料（D-32）

-- メンバー同士は表示名を見られる（設定画面で夫婦それぞれの好みを表示するため）
create policy "許可メンバーはメンバー一覧を読める"
  on public.allowed_members
  for select
  to authenticated
  using (public.is_allowed_member());

create table public.member_preferences (
  email text primary key references public.allowed_members (email) on delete cascade,
  dislikes text[] not null default '{}',
  allergies text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.member_preferences enable row level security;

-- 夫婦はお互いの好みも編集できる
create policy "許可メンバーは好みを読み書きできる"
  on public.member_preferences
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

-- 世帯の設定は 1 行だけ。staples が null なら既定の常備調味料を使う
create table public.household_settings (
  id smallint primary key default 1 check (id = 1),
  staples text[],
  updated_at timestamptz not null default now()
);

alter table public.household_settings enable row level security;

create policy "許可メンバーは世帯の設定を読み書きできる"
  on public.household_settings
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

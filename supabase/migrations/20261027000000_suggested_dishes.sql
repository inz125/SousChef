-- 提案された料理の履歴（D-51）。料理名で 1 つにまとめ、最後に提案されたときのレシピ・日付・提案した人を残す。
-- 記録は suggest-meals がログイン中のユーザーとして行い、同じ処理で 7 日より古い行を消す

create table public.suggested_dishes (
  name text primary key,
  dish jsonb not null,
  -- 「レンジ」の印（D-50）を付けるか
  microwave boolean not null default false,
  suggested_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  suggested_at timestamptz not null default now(),
  actor_email text not null,
  actor_name text not null
);

create index suggested_dishes_suggested_on on public.suggested_dishes (suggested_on);

alter table public.suggested_dishes enable row level security;

create policy "許可メンバーは提案された料理を読み書きできる"
  on public.suggested_dishes
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

-- 提案した人はログイン中のユーザーで上書きする（調理履歴と同じ関数。管理者の登録ではそのまま）
create trigger set_suggested_actor
  before insert or update on public.suggested_dishes
  for each row execute function public.set_cooking_actor();

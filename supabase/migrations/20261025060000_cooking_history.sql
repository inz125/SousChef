-- 調理履歴（D-37）。提案で直近 7 日に作った料理を避ける（D-38）のにも使う

create table public.cooking_history (
  id bigint generated always as identity primary key,
  cooked_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  dish_names text[] not null check (cardinality(dish_names) > 0),
  actor_email text not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index cooking_history_cooked_on on public.cooking_history (cooked_on);

alter table public.cooking_history enable row level security;

create policy "許可メンバーは調理履歴を読み書きできる"
  on public.cooking_history
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

-- 作った人はログイン中のユーザーで上書きする（クライアントの指定を信用しない）
create function public.set_cooking_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
begin
  new.actor_email := actor;
  new.actor_name := coalesce(
    (select m.display_name from public.allowed_members m where lower(m.email) = actor),
    split_part(actor, '@', 1)
  );
  return new;
end;
$$;

create trigger set_cooking_actor
  before insert on public.cooking_history
  for each row execute function public.set_cooking_actor();

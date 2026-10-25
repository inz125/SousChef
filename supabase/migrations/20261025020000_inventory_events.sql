-- 在庫の変更イベント（D-30）: もう一人の端末に「誰が・どの食材を・どうしたか」を届ける

-- 通知に使う表示名。未設定ならメールアドレスの @ より前を使う
alter table public.allowed_members add column display_name text;

-- 名前・カテゴリ・場所を編集したときも補完候補を更新する（D-27）
create trigger remember_food_on_update
  after update of name, category, location on public.inventory_items
  for each row execute function public.remember_food();

create table public.inventory_events (
  id bigint generated always as identity primary key,
  action text not null check (action in ('added', 'updated', 'removed')),
  item_name text not null,
  actor_email text not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

-- 読み取りのみ許可。書き込みはトリガーだけが行う（クライアントからのなりすまし防止）
alter table public.inventory_events enable row level security;

create policy "許可メンバーは変更イベントを読める"
  on public.inventory_events
  for select
  to authenticated
  using (public.is_allowed_member());

create function public.record_inventory_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
begin
  -- 管理者（service role）による操作は記録しない
  if actor is null then
    return null;
  end if;

  insert into public.inventory_events (action, item_name, actor_email, actor_name)
  values (
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'removed' end,
    case when tg_op = 'DELETE' then old.name else new.name end,
    actor,
    coalesce(
      (select m.display_name from public.allowed_members m where lower(m.email) = actor),
      split_part(actor, '@', 1)
    )
  );
  return null;
end;
$$;

create trigger record_inventory_event
  after insert or update or delete on public.inventory_items
  for each row execute function public.record_inventory_event();

alter publication supabase_realtime add table public.inventory_events;

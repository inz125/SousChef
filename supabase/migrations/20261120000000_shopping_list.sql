-- 常備食品（D-71）と買い物リスト（D-72〜D-74）

-- 名前の照らし合わせ（D-69 と同じ）: 名前が同じか、片方がもう片方を含む。
-- src/domain/shopping.ts の namesMatch と同じ結果になることを統合テストで確かめる
create function public.names_match(a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select a = b or strpos(a, b) > 0 or strpos(b, a) > 0;
$$;

-- 常備食品: 切らしたくない食材。献立提案の常備調味料（household_settings.staples）とは別
create table public.stocked_foods (
  name text primary key check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

alter table public.stocked_foods enable row level security;

create policy "許可メンバーは常備食品を読み書きできる"
  on public.stocked_foods
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

-- 買い物リスト。品物は名前だけを持つ
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  checked boolean not null default false,
  -- 在庫の削除で自動で載せたときの、その在庫の行（D-73）。「元に戻す」でこの品物を消す
  removed_inventory_item_id uuid,
  created_by text,
  -- 1 回の insert で複数入れても入れた順に並ぶよう、行ごとに時刻を取る
  created_at timestamptz not null default clock_timestamp()
);

-- チェックしていない同じ名前の品物は 1 つだけ（D-74）
create unique index shopping_items_unchecked_name on public.shopping_items (name) where not checked;

alter table public.shopping_items enable row level security;

create policy "許可メンバーは買い物リストを読み書きできる"
  on public.shopping_items
  for all
  to authenticated
  using (public.is_allowed_member())
  with check (public.is_allowed_member());

-- 名前を入れた順に載せ、それぞれ載せたか（チェックしていない同じ名前があって載せなかったか）を返す（D-74）。
-- 呼んだ人の権限で動くので RLS がかかる
create function public.add_shopping_items(names text[])
returns table (name text, added boolean)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  n text;
  inserted int;
begin
  foreach n in array names loop
    insert into public.shopping_items (name) values (n)
    on conflict (name) where not checked do nothing;
    get diagnostics inserted = row_count;
    name := n;
    added := inserted > 0;
    return next;
  end loop;
end;
$$;

-- 入れた人はログイン中のユーザーで上書きする（なりすまし防止。管理者の登録では null）
create function public.set_shopping_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := lower(auth.jwt() ->> 'email');
  return new;
end;
$$;

create trigger set_shopping_creator
  before insert on public.shopping_items
  for each row execute function public.set_shopping_creator();

-- 常備食品の在庫を「少ない」にした・在庫から消したら、買い物リストに載せる（D-73）。
-- 同じ常備食品に当たるほかの在庫が「ある」で残っていれば載せない。どの操作・どちらの人でも漏れないようサーバで行う
create function public.add_stocked_food_to_shopping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_id uuid;
  item_name text;
  removed boolean := tg_op = 'DELETE';
begin
  if removed then
    item_id := old.id;
    item_name := old.name;
  elsif new.quantity = 'low' and old.quantity <> 'low' then
    item_id := new.id;
    item_name := new.name;
  else
    return null;
  end if;

  insert into public.shopping_items (name, removed_inventory_item_id)
  select s.name, case when removed then item_id end
  from public.stocked_foods s
  where public.names_match(s.name, item_name)
    and not exists (
      select 1
      from public.inventory_items i
      where i.id <> item_id
        and i.quantity = 'enough'
        and public.names_match(s.name, i.name)
    )
  on conflict (name) where not checked do nothing;
  return null;
end;
$$;

create trigger add_stocked_food_to_shopping
  after update of quantity or delete on public.inventory_items
  for each row execute function public.add_stocked_food_to_shopping();

-- 削除の「元に戻す」は同じ ID で入れ直す。その削除で自動で載った品物（チェックしていないもの）を消す（D-73）
create function public.remove_shopping_on_restore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.shopping_items
  where removed_inventory_item_id = new.id and not checked;
  return null;
end;
$$;

create trigger remove_shopping_on_restore
  after insert on public.inventory_items
  for each row execute function public.remove_shopping_on_restore();

-- 常備食品を登録したとき、当たる在庫が「ある」でなければすぐ載せる（D-73）
create function public.add_new_stocked_food_to_shopping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.inventory_items i
    where i.quantity = 'enough' and public.names_match(new.name, i.name)
  ) then
    insert into public.shopping_items (name) values (new.name)
    on conflict (name) where not checked do nothing;
  end if;
  return null;
end;
$$;

create trigger add_new_stocked_food_to_shopping
  after insert on public.stocked_foods
  for each row execute function public.add_new_stocked_food_to_shopping();

-- もう一人の変更をリアルタイムに反映する（D-72）
alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.stocked_foods;

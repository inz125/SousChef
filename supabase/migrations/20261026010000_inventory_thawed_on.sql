-- 冷凍の肉を冷蔵に移して解凍した日（D-47）。冷蔵にあってこの日があれば「解凍中」。
-- 冷蔵以外の行には持たせない（冷凍に戻したら解凍中ではなくなる）

alter table public.inventory_items add column thawed_on date;

alter table public.inventory_items
  add constraint inventory_items_thawed_on_fridge
  check (thawed_on is null or location = 'fridge');

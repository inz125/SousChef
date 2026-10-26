-- 調理履歴のカレンダーから作った料理のレシピを開けるよう、レシピも記録する（D-45）。
-- この変更より前の記録は null のまま（料理名だけを表示する）

alter table public.cooking_history add column dishes jsonb;

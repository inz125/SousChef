-- 常備調味料の初期値（D-32）は DB だけが持つ（画面とサーバで二重に持たない）
insert into public.household_settings (id, staples)
values (1, array['塩', 'こしょう', '砂糖', '醤油', 'みりん', '酒', '酢', '味噌', 'サラダ油', 'ごま油', '顆粒だし', 'マヨネーズ', 'ケチャップ'])
on conflict (id) do update set staples = coalesce(public.household_settings.staples, excluded.staples);

-- ★保存した料理が「レンジで作る料理」か（D-50）。「レンジ」の印が付いた料理を保存したときに true。
-- この列より前に保存した料理は「レンジで作る料理」ではない扱い

alter table public.saved_dishes add column microwave boolean not null default false;

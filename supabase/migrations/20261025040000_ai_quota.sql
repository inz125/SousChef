-- AI 利用回数の上限（D-21）。世帯で共有し、日本時間の日付ごとに数える

create table public.ai_usage (
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (day, kind)
);

-- ポリシーを定義しない = クライアントから直接は読み書きできない。consume_ai_quota 経由でのみ増える
alter table public.ai_usage enable row level security;

create function public.consume_ai_quota(kind text, daily_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Tokyo')::date;
  used integer;
begin
  if not public.is_allowed_member() then
    raise exception 'not_allowed';
  end if;

  insert into public.ai_usage as u (day, kind, count)
  values (today, consume_ai_quota.kind, 1)
  on conflict on constraint ai_usage_pkey do update set count = u.count + 1
  returning u.count into used;

  -- 上限を超えた分は数えない（例外でトランザクションごと取り消される）
  if used > daily_limit then
    raise exception 'quota_exceeded';
  end if;
  return used;
end;
$$;

revoke execute on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;

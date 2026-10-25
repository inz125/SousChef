-- 管理者（service role）による調理履歴の登録では作った人を上書きしない。
-- ログインユーザーは必ずメールアドレスを持つので、なりすまし防止はそのまま
create or replace function public.set_cooking_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
begin
  if actor is null then
    return new;
  end if;
  new.actor_email := actor;
  new.actor_name := coalesce(
    (select m.display_name from public.allowed_members m where lower(m.email) = actor),
    split_part(actor, '@', 1)
  );
  return new;
end;
$$;

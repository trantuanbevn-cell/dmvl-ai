-- 1) Mỗi tài khoản chỉ đăng nhập trên 1 máy: máy đăng nhập sau cùng giữ phiên, máy cũ bị đăng xuất
create table if not exists public.user_sessions (
  user_id uuid primary key,
  device_id text not null,
  device_label text,
  updated_at timestamptz not null default now()
);
alter table public.user_sessions enable row level security;
create policy us_select on public.user_sessions for select using (user_id = auth.uid() or public.app_role() = 'admin');
create policy us_insert on public.user_sessions for insert with check (user_id = auth.uid());
create policy us_update on public.user_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) Nhật ký chỉnh sửa (chỉ admin xem): ai sửa gì, ở đâu, lúc nào
create table if not exists public.edit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  project_id uuid,
  tbl text not null,
  row_id uuid,
  code text,
  action text not null,
  fields text[],
  detail jsonb
);
create index if not exists edit_log_at on public.edit_log (at desc);
alter table public.edit_log enable row level security;
create policy el_admin_select on public.edit_log for select using (public.app_role() = 'admin');

create or replace function public.log_edit() returns trigger language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); nm text; pid uuid; cd text; r jsonb; o jsonb; ch text[]; det jsonb;
begin
  begin
  if uid is null then return coalesce(new, old); end if;
  r := to_jsonb(coalesce(new, old));
  if tg_table_name = 'occurrences' then
    select e.project_id, e.code into pid, cd from public.entries e where e.id = (r->>'entry_id')::uuid;
  else
    pid := (r->>'project_id')::uuid; cd := r->>'code';
  end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    select coalesce(array_agg(k), '{}'), coalesce(jsonb_object_agg(k, jsonb_build_array(left(coalesce(o->>k, ''), 120), left(coalesce(r->>k, ''), 120))), '{}'::jsonb)
      into ch, det from jsonb_object_keys(r) k
      where (r->k) is distinct from (o->k) and k not in ('updated_at', 'created_at', 'sort', 'enriched_at');
    if cardinality(ch) = 0 then return new; end if;
  end if;
  select coalesce(full_name, email) into nm from public.profiles where id = uid;
  insert into public.edit_log (user_id, user_name, project_id, tbl, row_id, code, action, fields, detail)
    values (uid, nm, pid, tg_table_name, (r->>'id')::uuid, cd, tg_op, ch, det);
  exception when others then null;   -- nhật ký lỗi không bao giờ được chặn việc lưu dữ liệu
  end;
  return coalesce(new, old);
end $f$;

create trigger trg_log_entries after insert or update or delete on public.entries for each row execute function public.log_edit();
create trigger trg_log_rooms after insert or update or delete on public.rooms for each row execute function public.log_edit();
create trigger trg_log_occ after insert or update or delete on public.occurrences for each row execute function public.log_edit();

alter publication supabase_realtime add table public.edit_log;

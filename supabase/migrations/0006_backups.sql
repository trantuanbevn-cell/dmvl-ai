-- Sao lưu / khôi phục dữ liệu theo dự án (phòng, trang, mã vật liệu, vị trí, cảnh báo, mặt bằng) + đánh dấu nguồn của từng vị trí.
alter table public.occurrences add column if not exists origin text;   -- 'ai' = do phân tích tạo; 'manual' = người dùng tự thêm

create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  kind text not null default 'manual',          -- manual | auto
  label text,
  counts jsonb,
  data jsonb not null
);
create index if not exists backups_project_idx on public.backups(project_id, created_at desc);
alter table public.backups enable row level security;
drop policy if exists backups_sel on public.backups;
create policy backups_sel on public.backups for select to authenticated using (public.app_role() = 'admin');
-- ghi/xoá chỉ qua các hàm bên dưới (security definer)

create or replace function public.create_backup(p_project uuid, p_label text default null, p_kind text default 'manual') returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_data jsonb; v_counts jsonb;
begin
  if public.app_role() is null or public.app_role() not in ('admin','editor') then raise exception 'Không có quyền sao lưu'; end if;
  v_data := jsonb_build_object(
    'rooms', coalesce((select jsonb_agg(to_jsonb(x)) from rooms x where x.project_id = p_project), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(x)) from pages x where x.project_id = p_project), '[]'::jsonb),
    'floor_plans', coalesce((select jsonb_agg(to_jsonb(x)) from floor_plans x where x.project_id = p_project), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(x)) from entries x where x.project_id = p_project), '[]'::jsonb),
    'warnings', coalesce((select jsonb_agg(to_jsonb(x)) from warnings x where x.project_id = p_project), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(to_jsonb(o)) from occurrences o where o.entry_id in (select id from entries where project_id = p_project)), '[]'::jsonb));
  v_counts := jsonb_build_object('rooms', jsonb_array_length(v_data->'rooms'), 'pages', jsonb_array_length(v_data->'pages'), 'entries', jsonb_array_length(v_data->'entries'), 'occurrences', jsonb_array_length(v_data->'occurrences'));
  insert into backups(project_id, label, kind, counts, data) values (p_project, p_label, case when p_kind = 'auto' then 'auto' else 'manual' end, v_counts, v_data) returning id into v_id;
  delete from backups where project_id = p_project and kind = 'auto' and id not in (select id from backups where project_id = p_project and kind = 'auto' order by created_at desc limit 40);
  return v_id;
end $fn$;

create or replace function public.restore_backup(p_backup uuid) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare b backups%rowtype; pre uuid;
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Chỉ quản trị viên được khôi phục'; end if;
  select * into b from backups where id = p_backup;
  if not found then raise exception 'Không thấy bản sao lưu'; end if;
  pre := public.create_backup(b.project_id, 'Tự động trước khi khôi phục', 'auto');
  delete from occurrences where entry_id in (select id from entries where project_id = b.project_id);
  delete from entries where project_id = b.project_id;
  delete from warnings where project_id = b.project_id;
  delete from pages where project_id = b.project_id;
  delete from rooms where project_id = b.project_id;
  delete from floor_plans where project_id = b.project_id;
  insert into rooms select * from jsonb_populate_recordset(null::rooms, b.data->'rooms');
  insert into pages select * from jsonb_populate_recordset(null::pages, b.data->'pages');
  insert into floor_plans select * from jsonb_populate_recordset(null::floor_plans, b.data->'floor_plans');
  insert into entries select * from jsonb_populate_recordset(null::entries, b.data->'entries');
  insert into warnings select * from jsonb_populate_recordset(null::warnings, b.data->'warnings');
  insert into occurrences select * from jsonb_populate_recordset(null::occurrences, b.data->'occurrences');
  return jsonb_build_object('restored', b.counts, 'pre_backup', pre);
end $fn$;

create or replace function public.delete_backup(p_backup uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'Chỉ quản trị viên được xoá'; end if;
  delete from backups where id = p_backup;
end $fn$;

revoke all on function public.create_backup(uuid, text, text), public.restore_backup(uuid), public.delete_backup(uuid) from public, anon;
grant execute on function public.create_backup(uuid, text, text), public.restore_backup(uuid), public.delete_backup(uuid) to authenticated;

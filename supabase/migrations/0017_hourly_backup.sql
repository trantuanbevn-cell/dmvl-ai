-- Sao lưu tự động MỖI GIỜ (chạy trên máy chủ Supabase, không cần ai mở web) + giữ lâu dài:
--  • 7 ngày gần nhất: giữ TẤT CẢ bản tự động
--  • cũ hơn: mỗi ngày giữ lại 1 bản (bản cuối ngày) – không bao giờ xoá bản thủ công
--  • giờ nào dữ liệu không đổi so với bản trước thì bỏ qua (đỡ tốn chỗ)
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public._project_snapshot(p_project uuid) returns jsonb
language sql stable set search_path = public as $fn$
  select jsonb_build_object(
    'rooms', coalesce((select jsonb_agg(to_jsonb(x)) from rooms x where x.project_id = p_project), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(x)) from pages x where x.project_id = p_project), '[]'::jsonb),
    'floor_plans', coalesce((select jsonb_agg(to_jsonb(x)) from floor_plans x where x.project_id = p_project), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(x)) from entries x where x.project_id = p_project), '[]'::jsonb),
    'warnings', coalesce((select jsonb_agg(to_jsonb(x)) from warnings x where x.project_id = p_project), '[]'::jsonb),
    'occurrences', coalesce((select jsonb_agg(to_jsonb(o)) from occurrences o where o.entry_id in (select id from entries where project_id = p_project)), '[]'::jsonb));
$fn$;

create or replace function public._prune_backups(p_project uuid) returns void
language sql set search_path = public as $fn$
  delete from backups b
  where b.project_id = p_project and b.kind = 'auto' and b.created_at < now() - interval '7 days'
    and b.id not in (
      select distinct on ((created_at at time zone 'Asia/Ho_Chi_Minh')::date) id
      from backups where project_id = p_project and kind = 'auto'
      order by (created_at at time zone 'Asia/Ho_Chi_Minh')::date, created_at desc);
$fn$;

create or replace function public.create_backup(p_project uuid, p_label text default null, p_kind text default 'manual') returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_data jsonb; v_counts jsonb;
begin
  if public.app_role() is null or public.app_role() not in ('admin','editor') then raise exception 'Không có quyền sao lưu'; end if;
  v_data := public._project_snapshot(p_project);
  v_counts := jsonb_build_object('rooms', jsonb_array_length(v_data->'rooms'), 'pages', jsonb_array_length(v_data->'pages'), 'entries', jsonb_array_length(v_data->'entries'), 'occurrences', jsonb_array_length(v_data->'occurrences'));
  insert into backups(project_id, label, kind, counts, data) values (p_project, p_label, case when p_kind = 'auto' then 'auto' else 'manual' end, v_counts, v_data) returning id into v_id;
  perform public._prune_backups(p_project);
  return v_id;
end $fn$;

create or replace function public.cron_backup_all() returns int
language plpgsql security definer set search_path = public as $fn$
declare pr record; v_data jsonb; v_last jsonb; n int := 0;
begin
  for pr in select id from projects loop
    v_data := public._project_snapshot(pr.id);
    if jsonb_array_length(v_data->'entries') = 0 and jsonb_array_length(v_data->'rooms') = 0 then continue; end if;
    select data into v_last from backups where project_id = pr.id order by created_at desc limit 1;
    if v_last is not null and v_last = v_data then continue; end if;
    insert into backups(project_id, label, kind, counts, data, created_by)
    values (pr.id, 'Tự động theo giờ', 'auto',
      jsonb_build_object('rooms', jsonb_array_length(v_data->'rooms'), 'pages', jsonb_array_length(v_data->'pages'), 'entries', jsonb_array_length(v_data->'entries'), 'occurrences', jsonb_array_length(v_data->'occurrences')),
      v_data, null);
    perform public._prune_backups(pr.id);
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function public.cron_backup_all(), public._project_snapshot(uuid), public._prune_backups(uuid) from public, anon, authenticated;

select cron.unschedule('dmvl-hourly-backup') where exists (select 1 from cron.job where jobname = 'dmvl-hourly-backup');
select cron.schedule('dmvl-hourly-backup', '0 * * * *', $$select public.cron_backup_all()$$);

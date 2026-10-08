-- Chạy trong Supabase → SQL Editor (cần quyền của bạn vì có lệnh xoá). Cài hai hàm: khôi phục và xoá bản sao lưu (chỉ quản trị viên gọi được).
-- Hàm khôi phục chạy trong MỘT giao dịch: nếu lỗi giữa chừng thì dữ liệu hiện tại được giữ nguyên; và luôn tạo bản sao lưu tự động của hiện trạng trước khi ghi đè.
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

revoke all on function public.restore_backup(uuid), public.delete_backup(uuid) from public, anon;
grant execute on function public.restore_backup(uuid), public.delete_backup(uuid) to authenticated;

-- Dọn dự án thử do tôi tạo khi kiểm tra (không phải dữ liệu thật):
delete from public.projects where name = '__TEST_RESTORE__';

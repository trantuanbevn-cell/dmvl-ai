-- Đổi thứ tự vật liệu trong một nhóm mã: p_ids = thứ tự MỚI (cùng dự án, cùng nhóm mã).
-- Các mã hiện có (CT-01, CT-02…) được giữ nguyên bộ số, chỉ gán lại theo thứ tự mới. Chạy trong 1 giao dịch nên không bao giờ dở dang.
create or replace function public.reorder_entries(p_ids uuid[]) returns void
language plpgsql as $$
declare
  n int := coalesce(array_length(p_ids, 1), 0);
  found int; projs int; grps int;
  cds text[];
  i int;
begin
  if n < 2 then return; end if;
  select count(*), count(distinct project_id), count(distinct group_code) into found, projs, grps from public.entries where id = any(p_ids);
  if found <> n or projs <> 1 or grps <> 1 then raise exception 'Chỉ đổi thứ tự được các vật liệu cùng dự án và cùng nhóm mã'; end if;
  select array_agg(code order by coalesce(nullif(regexp_replace(code, '\D', '', 'g'), ''), '0')::int, code) into cds from public.entries where id = any(p_ids);
  update public.entries set code = 'TMP-' || replace(id::text, '-', '') where id = any(p_ids);
  for i in 1..n loop
    update public.entries set code = cds[i] where id = p_ids[i];
  end loop;
end $$;
revoke all on function public.reorder_entries(uuid[]) from public, anon;
grant execute on function public.reorder_entries(uuid[]) to authenticated;

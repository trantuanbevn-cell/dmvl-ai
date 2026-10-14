-- Hoàn tác / lịch sử thay đổi: ghi giá trị cũ & mới của mã vật liệu, phòng, vị trí/hình, quy định; cho phép quay lại từng bước.
create table if not exists public.undo_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid not null,
  user_name text,
  project_id uuid not null,
  tbl text not null,
  row_id uuid not null,
  code text,
  op text not null,              -- INSERT | UPDATE | DELETE
  old_vals jsonb,                -- UPDATE: các cột đã đổi (giá trị cũ); DELETE: nguyên dòng cũ
  new_vals jsonb,                -- UPDATE: các cột đã đổi (giá trị mới) – để phát hiện bị sửa tiếp
  via_undo boolean not null default false,   -- dòng sinh ra do bấm Hoàn tác (để “Làm lại”)
  reverted boolean not null default false
);
create index if not exists undo_log_proj on public.undo_log (project_id, id desc);
alter table public.undo_log enable row level security;
create policy ul_sel on public.undo_log for select using (public.can_feature('undo') and public.can_access(project_id) and (user_id = auth.uid() or public.app_role() = 'admin'));
create policy ul_upd on public.undo_log for update using (public.can_feature('undo') and public.can_access(project_id) and (user_id = auth.uid() or public.app_role() = 'admin')) with check (public.can_feature('undo') and public.can_access(project_id));
revoke all on public.undo_log from anon, authenticated;
grant select on public.undo_log to authenticated;
grant update (reverted) on public.undo_log to authenticated;

create or replace function public.undo_capture() returns trigger language plpgsql security definer set search_path = public as $f$
declare
  uid uuid := auth.uid(); r jsonb; o jsonb; pid uuid; cd text; ov jsonb; nv jsonb; nm text; oc record;
  via boolean := coalesce(nullif(current_setting('dmvl.undo', true), ''), '0') = '1';
begin
  begin
    if uid is null then return case when tg_op = 'DELETE' then old else new end; end if;
    select coalesce(full_name, email) into nm from public.profiles where id = uid;
    r := to_jsonb(case when tg_op = 'DELETE' then old else new end);
    if tg_table_name = 'occurrences' then select e.project_id, e.code into pid, cd from public.entries e where e.id = (r->>'entry_id')::uuid;
    else pid := (r->>'project_id')::uuid; cd := r->>'code'; end if;
    if pid is not null then
      if tg_op = 'DELETE' then
        -- xoá mã: ghi các vị trí/hình đi kèm TRƯỚC, rồi mới ghi mã (hoàn tác sẽ dựng mã trước, vị trí sau)
        if tg_table_name = 'entries' then
          for oc in select * from public.occurrences where entry_id = (r->>'id')::uuid loop
            insert into public.undo_log (user_id, user_name, project_id, tbl, row_id, code, op, old_vals, via_undo) values (uid, nm, pid, 'occurrences', oc.id, cd, 'DELETE', to_jsonb(oc), via);
          end loop;
        end if;
        insert into public.undo_log (user_id, user_name, project_id, tbl, row_id, code, op, old_vals, via_undo) values (uid, nm, pid, tg_table_name, (r->>'id')::uuid, cd, 'DELETE', r, via);
      elsif tg_op = 'INSERT' then
        insert into public.undo_log (user_id, user_name, project_id, tbl, row_id, code, op, via_undo) values (uid, nm, pid, tg_table_name, (r->>'id')::uuid, cd, 'INSERT', via);
      else
        o := to_jsonb(old);
        select jsonb_object_agg(k, o->k), jsonb_object_agg(k, r->k) into ov, nv from jsonb_object_keys(r) k
          where (r->k) is distinct from (o->k) and k not in ('updated_at', 'created_at', 'sort', 'enriched_at');
        if ov is not null then
          insert into public.undo_log (user_id, user_name, project_id, tbl, row_id, code, op, old_vals, new_vals, via_undo) values (uid, nm, pid, tg_table_name, (r->>'id')::uuid, cd, 'UPDATE', ov, nv, via);
        end if;
      end if;
    end if;
    if random() < 0.003 then delete from public.undo_log where at < now() - interval '45 days'; end if;
  exception when others then null;   -- ghi lịch sử lỗi không bao giờ được chặn việc lưu dữ liệu
  end;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
revoke execute on function public.undo_capture() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['entries', 'rooms', 'occurrences', 'project_rules'] loop
    execute format('drop trigger if exists trg_undo_iu on public.%I', t);
    execute format('drop trigger if exists trg_undo_del on public.%I', t);
    execute format('create trigger trg_undo_iu after insert or update on public.%I for each row execute function public.undo_capture()', t);
    execute format('create trigger trg_undo_del before delete on public.%I for each row execute function public.undo_capture()', t);
  end loop;
end $$;

-- Quay lại các dòng lịch sử (mới → cũ). Chạy với quyền người gọi (RLS vẫn áp dụng). Dòng đã bị sửa tiếp sau đó thì bỏ qua, không ghi đè.
create or replace function public.undo_revert(p_ids bigint[], p_redo boolean default false) returns jsonb
language plpgsql security invoker set search_path = public as $f$
declare r record; cur jsonb; cols text; pending bigint[]; retry bigint[]; n_done int := 0; n_skip int := 0; pass int;
begin
  if not public.can_feature('undo') then raise exception 'Không có quyền hoàn tác'; end if;
  perform set_config('dmvl.undo', case when p_redo then '0' else '1' end, true);
  pending := array(select id from public.undo_log where id = any(p_ids) and not reverted order by id desc);
  for pass in 1..3 loop
    exit when coalesce(cardinality(pending), 0) = 0;
    retry := '{}';
    for r in select * from public.undo_log where id = any(pending) order by id desc loop
      begin
        if r.op = 'UPDATE' then
          execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.tbl) into cur using r.row_id;
          if cur is null or exists (select 1 from jsonb_each(r.new_vals) e where (cur -> e.key) is distinct from e.value) then
            n_skip := n_skip + 1; continue;
          end if;
          select string_agg(format('%I', k), ',') into cols from jsonb_object_keys(r.old_vals) k;
          execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2)) where t.id = $1', r.tbl, cols, cols, r.tbl) using r.row_id, r.old_vals;
        elsif r.op = 'INSERT' then
          execute format('delete from public.%I where id = $1', r.tbl) using r.row_id;
        else
          execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing', r.tbl, r.tbl) using r.old_vals;
        end if;
        update public.undo_log set reverted = true where id = r.id;
        n_done := n_done + 1;
      exception when others then
        retry := retry || r.id;
      end;
    end loop;
    pending := retry;
  end loop;
  return jsonb_build_object('done', n_done, 'skipped', n_skip, 'failed', coalesce(cardinality(pending), 0));
end $f$;
revoke execute on function public.undo_revert(bigint[], boolean) from public, anon;
grant execute on function public.undo_revert(bigint[], boolean) to authenticated;

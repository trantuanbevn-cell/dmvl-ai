-- Làm việc nhóm: vai trò (admin / editor / viewer), trạng thái hoàn thành theo phòng, đồng bộ thời gian thực.
-- Chạy trong Supabase → SQL Editor (hoặc qua MCP apply_migration). Tài khoản hiện có sẽ thành admin.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.app_role() returns text language sql stable security definer set search_path = public as $$
  select case when active then role end from public.profiles where id = auth.uid()
$$;
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

insert into public.profiles (id, email, full_name, role)
select id, email, split_part(email,'@',1), 'admin' from auth.users
on conflict (id) do update set role = 'admin', active = true;

create policy profiles_read on public.profiles for select to authenticated using (public.app_role() is not null or id = auth.uid());

alter table public.rooms add column if not exists work_status text not null default 'todo' check (work_status in ('todo','doing','done'));
alter table public.rooms add column if not exists assigned_to text;
alter table public.rooms add column if not exists work_by text;
alter table public.rooms add column if not exists work_at timestamptz;

do $$
declare t text;
begin
  foreach t in array array['entries','floor_plans','library_products','occurrences','pages','rooms','warnings'] loop
    execute format('drop policy if exists %I on public.%I', 'auth_all_'||t, t);
    execute format('create policy %I on public.%I for select to authenticated using (public.app_role() is not null)', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.app_role() in (''admin'',''editor''))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.app_role() in (''admin'',''editor'')) with check (public.app_role() in (''admin'',''editor''))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.app_role() in (''admin'',''editor''))', t||'_del', t);
  end loop;
end $$;
drop policy if exists auth_all_projects on public.projects;
create policy projects_sel on public.projects for select to authenticated using (public.app_role() is not null);
create policy projects_ins on public.projects for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy projects_upd on public.projects for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy projects_del on public.projects for delete to authenticated using (public.app_role() = 'admin');
drop policy if exists auth_all_app_settings on public.app_settings;
create policy app_settings_sel on public.app_settings for select to authenticated using (public.app_role() is not null);
create policy app_settings_wr on public.app_settings for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

drop policy if exists auth_rw_concept on storage.objects;
create policy concept_sel on storage.objects for select to authenticated using (bucket_id = 'concept' and public.app_role() is not null);
create policy concept_ins on storage.objects for insert to authenticated with check (bucket_id = 'concept' and public.app_role() in ('admin','editor'));
create policy concept_upd on storage.objects for update to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor'));
create policy concept_del on storage.objects for delete to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor'));

alter table public.rooms replica identity full;
alter publication supabase_realtime add table public.rooms, public.entries, public.occurrences, public.warnings, public.pages, public.floor_plans;

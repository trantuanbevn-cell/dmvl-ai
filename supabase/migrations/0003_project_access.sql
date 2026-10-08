-- Phân quyền theo từng dự án: thành viên chỉ thấy các dự án được gán (quản trị thấy tất cả).
-- Chạy trong Supabase SQL Editor: dán toàn bộ rồi Run. Chạy lại nhiều lần vẫn an toàn.
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;
alter table public.projects add column if not exists created_by uuid default auth.uid();

create or replace function public.can_access(pid uuid) returns boolean language sql stable security definer set search_path = public as 'select case when public.app_role() = ''admin'' then true when public.app_role() is null then false else exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = auth.uid()) end';
create or replace function public.can_access_entry(eid uuid) returns boolean language sql stable security definer set search_path = public as 'select exists (select 1 from public.entries e where e.id = eid and public.can_access(e.project_id))';
create or replace function public.can_access_path(p text) returns boolean language sql stable security definer set search_path = public as 'select case when (storage.foldername(p))[1] ~ ''^[0-9a-fA-F-]{36}$'' then public.can_access(((storage.foldername(p))[1])::uuid) else public.app_role() = ''admin'' end';
revoke all on function public.can_access(uuid), public.can_access_entry(uuid), public.can_access_path(text) from public, anon;
grant execute on function public.can_access(uuid), public.can_access_entry(uuid), public.can_access_path(text) to authenticated;

create or replace function public.add_creator_member() returns trigger language plpgsql security definer set search_path = public as 'begin if auth.uid() is not null then insert into public.project_members (project_id, user_id) values (new.id, auth.uid()) on conflict do nothing; end if; return new; end';
drop trigger if exists trg_project_creator on public.projects;
create trigger trg_project_creator after insert on public.projects for each row execute function public.add_creator_member();

drop policy if exists pm_sel on public.project_members;
drop policy if exists pm_all on public.project_members;
create policy pm_sel on public.project_members for select to authenticated using (public.app_role() = 'admin' or user_id = auth.uid());
create policy pm_all on public.project_members for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

drop policy if exists entries_sel on public.entries;
drop policy if exists entries_ins on public.entries;
drop policy if exists entries_upd on public.entries;
drop policy if exists entries_del on public.entries;
create policy entries_sel on public.entries for select to authenticated using (public.can_access(project_id));
create policy entries_ins on public.entries for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy entries_upd on public.entries for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id)) with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy entries_del on public.entries for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id));

drop policy if exists floor_plans_sel on public.floor_plans;
drop policy if exists floor_plans_ins on public.floor_plans;
drop policy if exists floor_plans_upd on public.floor_plans;
drop policy if exists floor_plans_del on public.floor_plans;
create policy floor_plans_sel on public.floor_plans for select to authenticated using (public.can_access(project_id));
create policy floor_plans_ins on public.floor_plans for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy floor_plans_upd on public.floor_plans for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id)) with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy floor_plans_del on public.floor_plans for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id));

drop policy if exists pages_sel on public.pages;
drop policy if exists pages_ins on public.pages;
drop policy if exists pages_upd on public.pages;
drop policy if exists pages_del on public.pages;
create policy pages_sel on public.pages for select to authenticated using (public.can_access(project_id));
create policy pages_ins on public.pages for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy pages_upd on public.pages for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id)) with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy pages_del on public.pages for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id));

drop policy if exists rooms_sel on public.rooms;
drop policy if exists rooms_ins on public.rooms;
drop policy if exists rooms_upd on public.rooms;
drop policy if exists rooms_del on public.rooms;
create policy rooms_sel on public.rooms for select to authenticated using (public.can_access(project_id));
create policy rooms_ins on public.rooms for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy rooms_upd on public.rooms for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id)) with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy rooms_del on public.rooms for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id));

drop policy if exists warnings_sel on public.warnings;
drop policy if exists warnings_ins on public.warnings;
drop policy if exists warnings_upd on public.warnings;
drop policy if exists warnings_del on public.warnings;
create policy warnings_sel on public.warnings for select to authenticated using (public.can_access(project_id));
create policy warnings_ins on public.warnings for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy warnings_upd on public.warnings for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id)) with check (public.app_role() in ('admin','editor') and public.can_access(project_id));
create policy warnings_del on public.warnings for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access(project_id));

drop policy if exists occurrences_sel on public.occurrences;
drop policy if exists occurrences_ins on public.occurrences;
drop policy if exists occurrences_upd on public.occurrences;
drop policy if exists occurrences_del on public.occurrences;
create policy occurrences_sel on public.occurrences for select to authenticated using (public.can_access_entry(entry_id));
create policy occurrences_ins on public.occurrences for insert to authenticated with check (public.app_role() in ('admin','editor') and public.can_access_entry(entry_id));
create policy occurrences_upd on public.occurrences for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access_entry(entry_id)) with check (public.app_role() in ('admin','editor') and public.can_access_entry(entry_id));
create policy occurrences_del on public.occurrences for delete to authenticated using (public.app_role() in ('admin','editor') and public.can_access_entry(entry_id));

drop policy if exists projects_sel on public.projects;
drop policy if exists projects_ins on public.projects;
drop policy if exists projects_upd on public.projects;
drop policy if exists projects_del on public.projects;
create policy projects_sel on public.projects for select to authenticated using (public.can_access(id) or created_by = auth.uid());
create policy projects_ins on public.projects for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy projects_upd on public.projects for update to authenticated using (public.app_role() in ('admin','editor') and public.can_access(id)) with check (public.app_role() in ('admin','editor') and public.can_access(id));
create policy projects_del on public.projects for delete to authenticated using (public.app_role() = 'admin');

drop policy if exists concept_sel on storage.objects;
drop policy if exists concept_ins on storage.objects;
drop policy if exists concept_upd on storage.objects;
drop policy if exists concept_del on storage.objects;
create policy concept_sel on storage.objects for select to authenticated using (bucket_id = 'concept' and public.can_access_path(name));
create policy concept_ins on storage.objects for insert to authenticated with check (bucket_id = 'concept' and public.app_role() in ('admin','editor') and public.can_access_path(name));
create policy concept_upd on storage.objects for update to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor') and public.can_access_path(name));
create policy concept_del on storage.objects for delete to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor') and public.can_access_path(name));

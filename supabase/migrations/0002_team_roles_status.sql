-- Làm việc nhóm: vai trò, trạng thái phòng. Chạy trong Supabase SQL Editor (dán nội dung, không dùng khối DO).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.app_role() returns text language sql stable security definer set search_path = public as 'select case when active then role end from public.profiles where id = auth.uid()';
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

insert into public.profiles (id, email, full_name, role)
select id, email, split_part(email,'@',1), 'admin' from auth.users
on conflict (id) do update set role = 'admin', active = true;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.app_role() is not null or id = auth.uid());

alter table public.rooms add column if not exists work_status text not null default 'todo' check (work_status in ('todo','doing','done'));
alter table public.rooms add column if not exists assigned_to text;
alter table public.rooms add column if not exists work_by text;
alter table public.rooms add column if not exists work_at timestamptz;

drop policy if exists auth_all_entries on public.entries;
drop policy if exists entries_sel on public.entries;
drop policy if exists entries_ins on public.entries;
drop policy if exists entries_upd on public.entries;
drop policy if exists entries_del on public.entries;
create policy entries_sel on public.entries for select to authenticated using (public.app_role() is not null);
create policy entries_ins on public.entries for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy entries_upd on public.entries for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy entries_del on public.entries for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_floor_plans on public.floor_plans;
drop policy if exists floor_plans_sel on public.floor_plans;
drop policy if exists floor_plans_ins on public.floor_plans;
drop policy if exists floor_plans_upd on public.floor_plans;
drop policy if exists floor_plans_del on public.floor_plans;
create policy floor_plans_sel on public.floor_plans for select to authenticated using (public.app_role() is not null);
create policy floor_plans_ins on public.floor_plans for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy floor_plans_upd on public.floor_plans for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy floor_plans_del on public.floor_plans for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_library_products on public.library_products;
drop policy if exists library_products_sel on public.library_products;
drop policy if exists library_products_ins on public.library_products;
drop policy if exists library_products_upd on public.library_products;
drop policy if exists library_products_del on public.library_products;
create policy library_products_sel on public.library_products for select to authenticated using (public.app_role() is not null);
create policy library_products_ins on public.library_products for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy library_products_upd on public.library_products for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy library_products_del on public.library_products for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_occurrences on public.occurrences;
drop policy if exists occurrences_sel on public.occurrences;
drop policy if exists occurrences_ins on public.occurrences;
drop policy if exists occurrences_upd on public.occurrences;
drop policy if exists occurrences_del on public.occurrences;
create policy occurrences_sel on public.occurrences for select to authenticated using (public.app_role() is not null);
create policy occurrences_ins on public.occurrences for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy occurrences_upd on public.occurrences for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy occurrences_del on public.occurrences for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_pages on public.pages;
drop policy if exists pages_sel on public.pages;
drop policy if exists pages_ins on public.pages;
drop policy if exists pages_upd on public.pages;
drop policy if exists pages_del on public.pages;
create policy pages_sel on public.pages for select to authenticated using (public.app_role() is not null);
create policy pages_ins on public.pages for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy pages_upd on public.pages for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy pages_del on public.pages for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_rooms on public.rooms;
drop policy if exists rooms_sel on public.rooms;
drop policy if exists rooms_ins on public.rooms;
drop policy if exists rooms_upd on public.rooms;
drop policy if exists rooms_del on public.rooms;
create policy rooms_sel on public.rooms for select to authenticated using (public.app_role() is not null);
create policy rooms_ins on public.rooms for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy rooms_upd on public.rooms for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy rooms_del on public.rooms for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_warnings on public.warnings;
drop policy if exists warnings_sel on public.warnings;
drop policy if exists warnings_ins on public.warnings;
drop policy if exists warnings_upd on public.warnings;
drop policy if exists warnings_del on public.warnings;
create policy warnings_sel on public.warnings for select to authenticated using (public.app_role() is not null);
create policy warnings_ins on public.warnings for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy warnings_upd on public.warnings for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy warnings_del on public.warnings for delete to authenticated using (public.app_role() in ('admin','editor'));

drop policy if exists auth_all_projects on public.projects;
drop policy if exists projects_sel on public.projects;
drop policy if exists projects_ins on public.projects;
drop policy if exists projects_upd on public.projects;
drop policy if exists projects_del on public.projects;
create policy projects_sel on public.projects for select to authenticated using (public.app_role() is not null);
create policy projects_ins on public.projects for insert to authenticated with check (public.app_role() in ('admin','editor'));
create policy projects_upd on public.projects for update to authenticated using (public.app_role() in ('admin','editor')) with check (public.app_role() in ('admin','editor'));
create policy projects_del on public.projects for delete to authenticated using (public.app_role() = 'admin');

drop policy if exists auth_all_app_settings on public.app_settings;
drop policy if exists app_settings_sel on public.app_settings;
drop policy if exists app_settings_wr on public.app_settings;
create policy app_settings_sel on public.app_settings for select to authenticated using (public.app_role() is not null);
create policy app_settings_wr on public.app_settings for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

drop policy if exists auth_rw_concept on storage.objects;
drop policy if exists concept_sel on storage.objects;
drop policy if exists concept_ins on storage.objects;
drop policy if exists concept_upd on storage.objects;
drop policy if exists concept_del on storage.objects;
create policy concept_sel on storage.objects for select to authenticated using (bucket_id = 'concept' and public.app_role() is not null);
create policy concept_ins on storage.objects for insert to authenticated with check (bucket_id = 'concept' and public.app_role() in ('admin','editor'));
create policy concept_upd on storage.objects for update to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor'));
create policy concept_del on storage.objects for delete to authenticated using (bucket_id = 'concept' and public.app_role() in ('admin','editor'));

alter table public.rooms replica identity full;

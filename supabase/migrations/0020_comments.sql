-- Nhận xét / giao việc: người check ghi chú ở hạng mục – cột – ô và gửi đến một người; người nhận có thông báo, bấm vào là tới đúng chỗ
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete set null,
  entry_code text,
  col text,
  body text not null,
  author_id uuid not null default auth.uid(),
  author_name text,
  to_user uuid,
  status text not null default 'open' check (status in ('open','done')),
  seen_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists comments_to_idx on public.comments (to_user, status, created_at desc);
create index if not exists comments_proj_idx on public.comments (project_id, created_at desc);
alter table public.comments enable row level security;
create policy cm_select on public.comments for select to authenticated using (public.can_access(project_id) and (author_id = auth.uid() or to_user = auth.uid() or public.app_role() = 'admin'));
create policy cm_insert on public.comments for insert to authenticated with check (public.can_access(project_id) and author_id = auth.uid());
create policy cm_update on public.comments for update to authenticated using (author_id = auth.uid() or to_user = auth.uid() or public.app_role() = 'admin') with check (author_id = auth.uid() or to_user = auth.uid() or public.app_role() = 'admin');

-- Danh sách người có thể nhận nhận xét của dự án: quản trị + thành viên được cấp dự án
create or replace function public.project_people(pid uuid) returns table(id uuid, name text, role text) language sql stable security definer set search_path = public as $f$
  select p.id, coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)), p.role
  from public.profiles p
  where public.can_access(pid) and p.active and (p.role = 'admin' or exists (select 1 from public.project_members m where m.project_id = pid and m.user_id = p.id))
  order by 3, 2
$f$;
alter publication supabase_realtime add table public.comments;

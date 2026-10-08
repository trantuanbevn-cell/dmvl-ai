-- Quy định vận hành (vd Marriott) áp riêng cho từng dự án – chỉ hiển thị trong ứng dụng, KHÔNG đưa vào file xuất.
create table if not exists public.project_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_ids uuid[] not null default '{}',
  elements text[] not null default '{}',
  title_vn text, title_en text, body_en text, body_vn text, source text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.project_rules enable row level security;
create policy project_rules_sel on public.project_rules for select using (can_access(project_id));
create policy project_rules_ins on public.project_rules for insert with check (app_role() = 'admin');
create policy project_rules_upd on public.project_rules for update using (app_role() = 'admin') with check (app_role() = 'admin');
create policy project_rules_del on public.project_rules for delete using (app_role() = 'admin');
-- Dữ liệu quy định của dự án BOH Westin Kim Mã: xem supabase/seed_0008_westin_marriott_rules.sql

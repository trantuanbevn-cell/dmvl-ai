-- Gợi ý của AI ở bước QC cuối: admin chạy AI, mọi thành viên của dự án xem và xác nhận / bỏ qua
create table if not exists public.qc_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id uuid references public.entries(id) on delete cascade,
  code text,
  kind text not null,
  field text,
  current_text text,
  suggestion text,
  message text not null,
  confidence real,
  related text[] not null default '{}',
  status text not null default 'open' check (status in ('open','accepted','dismissed')),
  run_id text,
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);
create index if not exists qc_findings_proj_idx on public.qc_findings (project_id, status);
alter table public.qc_findings enable row level security;
create policy qcf_select on public.qc_findings for select to authenticated using (public.can_access(project_id));
create policy qcf_insert on public.qc_findings for insert to authenticated with check (public.can_access(project_id) and public.app_role() = 'admin');
create policy qcf_update on public.qc_findings for update to authenticated using (public.can_access(project_id)) with check (public.can_access(project_id));
create policy qcf_delete on public.qc_findings for delete to authenticated using (public.can_access(project_id) and public.app_role() = 'admin');

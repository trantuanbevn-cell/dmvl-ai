-- Các điểm QC đã được người dùng xác nhận "không phải lỗi" (dùng chung cả nhóm, mọi máy):
--   kind='word'  : từ đúng chính tả (toàn công ty, project_id = 00000000-…)
--   kind='spell' : một mục chính tả đã ẩn (theo dự án)
--   kind='dup' / 'link' : cặp mã "khác nhau / không liên quan" (theo dự án)
create table if not exists public.qc_ignores (
  id bigserial primary key,
  project_id uuid not null default '00000000-0000-0000-0000-000000000000',
  kind text not null,
  key text not null,
  by_user uuid default auth.uid(),
  at timestamptz not null default now()
);
create unique index if not exists qc_ignores_uq2 on public.qc_ignores (project_id, kind, key);
alter table public.qc_ignores enable row level security;
create policy qci_sel on public.qc_ignores for select using (public.app_role() is not null and (project_id = '00000000-0000-0000-0000-000000000000'::uuid or public.can_access(project_id)));
create policy qci_ins on public.qc_ignores for insert with check (public.app_role() in ('admin', 'editor') and (project_id = '00000000-0000-0000-0000-000000000000'::uuid or public.can_access(project_id)));
create policy qci_del on public.qc_ignores for delete using (public.app_role() = 'admin');
revoke all on public.qc_ignores from anon;
grant select, insert, delete on public.qc_ignores to authenticated;
grant usage on sequence public.qc_ignores_id_seq to authenticated;

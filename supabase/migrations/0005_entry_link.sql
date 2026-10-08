alter table public.entries add column if not exists link_id uuid;
create index if not exists entries_link_id_idx on public.entries(link_id);

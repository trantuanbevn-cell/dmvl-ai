-- Thư viện vật liệu (hãng: An Cường, Formica, Hưng Thịnh, gạch…): mỗi dòng 1 mã, variants = các kích thước/độ dày/bề mặt
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  source_id text not null,
  product_code text not null,
  name text,
  line text,
  kind text not null default 'wood',
  url text,
  image_url text,
  tex_url text,
  attrs jsonb not null default '{}'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  color_hex text,
  updated_at timestamptz not null default now(),
  unique (brand, source_id)
);
create index if not exists idx_materials_brand on public.materials(brand);
create index if not exists idx_materials_code on public.materials(lower(product_code));
alter table public.materials enable row level security;
drop policy if exists materials_sel on public.materials;
create policy materials_sel on public.materials for select to authenticated using (public.app_role() is not null);

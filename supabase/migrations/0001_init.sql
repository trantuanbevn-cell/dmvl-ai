-- DMVL AI – lược đồ dữ liệu giai đoạn 1
-- Dự án → Trang (ảnh) → Phòng → Hạng mục mã (entries) → Lần xuất hiện (occurrences: phòng + ảnh + khung crop)

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  client text,
  pdf_path text,
  status text not null default 'new',            -- new | pages_ready | classified | analyzed
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,                              -- R01, R02...
  name_vn text not null,
  name_en text,
  room_type text not null default 'other',         -- office|meeting|dining|pantry|locker_wc|lounge_training|corridor|storage|clinic|other
  concept_counts jsonb not null default '[]',      -- [{label, qty, unit}] đọc từ trang concept
  analysis_status text not null default 'pending', -- pending | running | done | error
  analysis_log text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_no int not null,
  image_path text not null,                        -- trong bucket 'concept' (ảnh lớn ~2000px)
  thumb_path text,                                 -- ảnh nhỏ ~900px
  width int, height int,
  kind text not null default 'unknown',            -- cover|moodboard|plan|render|other|unknown
  room_id uuid references public.rooms(id) on delete set null,
  page_text text,
  analyzed boolean not null default false,
  unique (project_id, page_no)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,                              -- CT-01, LM-02...
  group_code text not null,                        -- CT, LM, PT, JN, FF...
  category text,                                   -- floor|wall|ceiling|... (bề mặt chính)
  name_vn text not null,
  name_en text,
  part_vn text, part_en text,                      -- bộ phận áp dụng
  material_vn text, material_en text,              -- mô tả ngắn vật liệu AI nhận ra
  color_hex text,
  desc_vn text, desc_en text,                      -- mô tả & thông số
  perf_vn text, perf_en text,                      -- tính chất yêu cầu theo không gian
  standards text,
  composition text,                                -- đồ liền tường/rời: "Thùng LM-01; Mặt ES-01"
  parent_id uuid references public.entries(id) on delete set null,
  brand text, product_code text, product_name text, product_url text, product_image_url text, origin text,
  candidates jsonb not null default '[]',          -- đề xuất mã thực tế [{brand, product_code, product_name, url, image_url, reason_vn, confidence, verified}]
  qty numeric, unit text, qty_flag text,           -- ok | warn | derived
  qty_note text,
  source text not null default 'image',            -- image | inferred | manual
  status text not null default 'pending',          -- pending | approved | rejected | review
  note_vn text, note_en text,
  enriched boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  page_id uuid references public.pages(id) on delete set null,
  category text,
  bbox jsonb,                                      -- [x, y, w, h] chuẩn hoá 0..1 trên ảnh trang
  qty numeric,
  confidence numeric,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  text text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Cài đặt dùng chung: checklist theo loại phòng, quy tắc suy luận, tính chất theo không gian
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Thư viện mã hãng (giai đoạn 2 sẽ tự quét web hãng; giai đoạn 1 lưu các mã người dùng đã chọn)
create table if not exists public.library_products (
  id uuid primary key default gen_random_uuid(),
  group_code text not null,
  brand text not null,
  product_code text not null,
  product_name text,
  url text,
  image_url text,
  color_hex text,
  tags text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (brand, product_code)
);

create index if not exists idx_pages_project on public.pages(project_id);
create index if not exists idx_rooms_project on public.rooms(project_id);
create index if not exists idx_entries_project on public.entries(project_id);
create index if not exists idx_occ_entry on public.occurrences(entry_id);
create index if not exists idx_occ_room on public.occurrences(room_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_entries_touch on public.entries;
create trigger trg_entries_touch before update on public.entries for each row execute function public.touch_updated_at();

-- RLS: công cụ nội bộ – mọi tài khoản đã đăng nhập đều xem/sửa được
alter table public.projects enable row level security;
alter table public.rooms enable row level security;
alter table public.pages enable row level security;
alter table public.entries enable row level security;
alter table public.occurrences enable row level security;
alter table public.warnings enable row level security;
alter table public.app_settings enable row level security;
alter table public.library_products enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projects','rooms','pages','entries','occurrences','warnings','app_settings','library_products'] loop
    execute format('drop policy if exists "auth_all_%1$s" on public.%1$s', t);
    execute format('create policy "auth_all_%1$s" on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Kho file: bucket riêng tư 'concept' cho PDF và ảnh trang
insert into storage.buckets (id, name, public) values ('concept', 'concept', false)
on conflict (id) do nothing;

drop policy if exists "auth_rw_concept" on storage.objects;
create policy "auth_rw_concept" on storage.objects for all to authenticated
  using (bucket_id = 'concept') with check (bucket_id = 'concept');

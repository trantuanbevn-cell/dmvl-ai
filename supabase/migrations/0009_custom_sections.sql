-- Nhóm vật liệu (hạng mục) do người dùng tạo thêm cho từng dự án
alter table public.projects add column if not exists custom_sections jsonb;
alter table public.entries add column if not exists section_key text;

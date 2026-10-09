-- Loại bản ghi: 'catalog' = lập danh mục vật liệu, 'concept' = bộ dàn trang concept (bước đầu của quy trình khép kín)
alter table public.projects add column if not exists kind text not null default 'catalog';

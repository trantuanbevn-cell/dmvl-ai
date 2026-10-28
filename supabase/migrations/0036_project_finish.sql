-- Hoàn tất dự án: đánh dấu + ghi lại kết quả nén ảnh (không xoá dữ liệu nào)
alter table public.projects add column if not exists finished_at timestamptz;
alter table public.projects add column if not exists finish_info jsonb;

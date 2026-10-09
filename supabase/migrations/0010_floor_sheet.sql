-- Trang dàn mặt bằng tổng (concept): lưu vị trí ô tên, màu, tiêu đề cho từng mặt bằng tầng
alter table public.floor_plans add column if not exists sheet jsonb;

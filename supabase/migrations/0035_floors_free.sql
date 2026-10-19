-- Tầng nhập tự do cho phòng và cho trang mặt bằng (ghi vào nhóm theo tầng ở bảng phòng, đặt camera trên mặt bằng đúng tầng)
alter table public.rooms add column if not exists floor text;
alter table public.pages add column if not exists floor text;

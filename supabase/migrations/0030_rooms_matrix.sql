-- Tổng hợp phòng (ma trận vật liệu theo phòng): cờ phòng 'none' = không có/không thực hiện; matrix_na = hạng mục không cần ở phòng này
alter table public.rooms add column if not exists matrix_flag text, add column if not exists matrix_na text[] not null default '{}';

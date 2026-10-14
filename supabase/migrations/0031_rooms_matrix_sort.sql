-- Thứ tự phòng riêng của bảng Tổng hợp phòng (không đụng rooms.sort dùng cho các bảng khác)
alter table public.rooms add column if not exists matrix_sort integer;

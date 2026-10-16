-- Cấu tạo lớp tường/trần/sàn (tích chọn) + cờ "đổi loại vật liệu → ký hiệu/thông số cần xem lại"
alter table public.entries add column if not exists build jsonb;
-- spec_stale = loại vật liệu (kind thư viện) mà thông số hiện tại KHÔNG còn đúng; null = bình thường
alter table public.entries add column if not exists spec_stale text;

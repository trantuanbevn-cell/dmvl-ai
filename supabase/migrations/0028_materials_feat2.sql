-- Đặc trưng ảnh v2 (vân/hướng vân/tỷ lệ chi tiết) của map vật liệu – tính ở trình duyệt, xem src/lib/matchFeat.ts
alter table public.materials add column if not exists feat2 jsonb;

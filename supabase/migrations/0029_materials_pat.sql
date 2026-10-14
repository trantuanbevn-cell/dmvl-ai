-- Hồ sơ vân do AI đọc 1 lần cho mỗi map (nhãn chuẩn hoá, xem supabase/functions/pattern-tag)
alter table public.materials add column if not exists pat jsonb;

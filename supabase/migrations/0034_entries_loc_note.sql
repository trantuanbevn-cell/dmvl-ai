-- Ghi chú cho cột "Vị trí" (vd. "Tất cả các phòng, trừ WC") – song ngữ
alter table public.entries add column if not exists loc_note_vn text;
alter table public.entries add column if not exists loc_note_en text;

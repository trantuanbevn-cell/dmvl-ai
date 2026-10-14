-- Cảnh báo lớp hoàn thiện đã được người dùng xác nhận là không đúng (khoá cảnh báo) – không báo lại
alter table public.entries add column if not exists finish_ok text[] not null default '{}';

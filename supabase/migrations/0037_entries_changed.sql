-- Đánh dấu vật liệu đã chỉnh sửa (tô vàng trong phần mềm và trong file xuất). null = chưa đánh dấu
alter table public.entries add column if not exists changed_at timestamptz;

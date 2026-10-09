-- Bố cục quản lý nhóm lớn của dự án (tạo/tách/gộp nhóm lớn, chuyển mục giữa nhóm)
alter table public.projects add column if not exists section_layout jsonb;

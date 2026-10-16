-- Thư viện > 10k mã: sắp theo product_code không có chỉ mục → phân trang bị statement timeout (lỗi 57014)
create index if not exists idx_materials_order on public.materials (product_code, id);

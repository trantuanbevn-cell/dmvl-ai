-- Quyền dùng tính năng lớn: mặc định rỗng = chỉ admin thấy; admin tick trong trang Thành viên
alter table profiles add column if not exists features text[] not null default '{}';
drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update using (app_role()='admin') with check (app_role()='admin');

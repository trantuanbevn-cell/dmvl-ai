-- Admin được nhập/sửa/xoá thư viện vật liệu và ảnh map (bucket 'materials')
insert into storage.buckets (id, name, public) values ('materials', 'materials', true) on conflict (id) do nothing;
drop policy if exists materials_ins on public.materials;
drop policy if exists materials_upd on public.materials;
drop policy if exists materials_del on public.materials;
create policy materials_ins on public.materials for insert to authenticated with check (public.app_role() = 'admin');
create policy materials_upd on public.materials for update to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy materials_del on public.materials for delete to authenticated using (public.app_role() = 'admin');
drop policy if exists materials_obj_ins on storage.objects;
drop policy if exists materials_obj_upd on storage.objects;
create policy materials_obj_ins on storage.objects for insert to authenticated with check (bucket_id = 'materials' and public.app_role() = 'admin');
create policy materials_obj_upd on storage.objects for update to authenticated using (bucket_id = 'materials' and public.app_role() = 'admin') with check (bucket_id = 'materials' and public.app_role() = 'admin');

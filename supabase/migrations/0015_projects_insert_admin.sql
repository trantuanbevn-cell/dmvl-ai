alter policy projects_ins on public.projects with check (public.app_role() = 'admin');

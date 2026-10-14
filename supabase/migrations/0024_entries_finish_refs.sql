-- Lớp hoàn thiện: mục nền (thạch cao, vách…) trỏ tới mã sơn/hoàn thiện (PT…) thay vì gõ lại thông số
alter table public.entries add column if not exists finish_refs uuid[] not null default '{}';

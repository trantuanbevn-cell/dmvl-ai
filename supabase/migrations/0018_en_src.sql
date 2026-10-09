-- Ghi lại bản tiếng Việt đã dùng khi phần mềm TỰ dịch ô tiếng Anh: { "name_en": {"vi": "...", "en": "..."} }
-- để phát hiện khi tiếng Việt đổi sau đó (và tiếng Anh chưa bị sửa tay) thì dịch lại cho đồng bộ.
alter table public.entries add column if not exists en_src jsonb;
alter table public.rooms add column if not exists en_src jsonb;

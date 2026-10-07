# DMVL AI – Danh mục vật liệu hoàn thiện tự động

Web app nội bộ: tải file concept nội thất (PDF) → AI gom ảnh theo phòng → bóc tách toàn bộ vật liệu trần/tường/sàn, đồ liền tường (kèm vật liệu cấu thành & phụ kiện), đồ rời, đèn, thiết bị, decor, artwork, đầu chờ MEP → suy luận hạng mục bắt buộc không thể hiện → soát lại theo checklist loại phòng → đề xuất mã thực tế (AI tìm trên web hãng) → người dùng rà soát, xác nhận → xuất Excel (VN/EN) và PDF theo nhóm vật liệu.

## Kiến trúc
| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Giao diện | React + Vite (thư mục `src/`) | Chạy trong trình duyệt; đọc PDF, cắt ảnh, rà soát, xuất file |
| Dữ liệu | Supabase Postgres (`supabase/migrations`) | Dự án, phòng, trang, mã vật liệu, vị trí xuất hiện, cài đặt, thư viện mã hãng |
| Kho file | Supabase Storage, bucket riêng tư `concept` | PDF gốc + ảnh từng trang |
| AI | Supabase Edge Function `ai` → Claude API | Phân loại trang, bóc tách, soát lại, viết thông số, tìm mã (web search) |
| Đăng nhập | Supabase Auth (email + mật khẩu) | Chỉ tài khoản đăng nhập mới dùng được |
| Hosting | GitHub Pages (`.github/workflows/deploy.yml`) | Tự build & đăng mỗi khi push lên `main` |

## Cài đặt
1. **Supabase** – chạy `supabase/migrations/0001_init.sql` (SQL Editor) → tạo bảng, RLS, bucket `concept`.
2. **Edge Function** – deploy `supabase/functions/ai` (CLI: `supabase functions deploy ai`).
3. **Secrets** (Supabase → Edge Functions → Secrets):
   - `ANTHROPIC_API_KEY` – khoá API từ console.anthropic.com (bắt buộc)
   - `ANTHROPIC_MODEL` – tuỳ chọn, mặc định `claude-sonnet-5-5`
4. **Biến giao diện** – `.env.production` (hoặc GitHub → Settings → Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key công khai được).
5. **GitHub Pages** – repo Settings → Pages → Source: *GitHub Actions*. Push lên `main` là web tự cập nhật.
6. **Auth** – Supabase → Authentication → Providers → Email. Sau khi tạo đủ tài khoản cho nhóm, nên tắt *Allow new users to sign up*.

Chạy thử trên máy: `npm install && npm run dev` (cần file `.env`).

## Quy trình sử dụng
1. **Hồ sơ & phòng**: tải PDF → AI phân loại trang và gom phòng → sửa nếu cần (tên, loại phòng, gán trang).
2. **Phân tích AI**: chạy từng phòng hoặc tất cả. Mỗi phòng: bóc tách từng ảnh → soát lại lần 2 → viết thông số.
3. **Theo phòng**: ảnh có khung khoanh từng mã; bấm để xem/sửa; khoanh lại vùng; thêm mục thiếu.
4. **Theo nhóm vật liệu**: xem mọi Sơn / Gỗ / Gạch… ở tất cả không gian; AI tìm 3 mã thực tế → chọn.
5. **Kiểm tra đủ**: ma trận phòng × hạng mục, checklist bắt buộc theo loại phòng, cảnh báo số lượng.
6. **Xuất file**: Excel VN / EN, PDF – chỉ mã "Đã xác nhận" (hoặc kèm nháp).

Cài đặt chung (checklist, quy tắc suy luận, tính chất theo không gian) sửa trong trang **Cài đặt**.

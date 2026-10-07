# DMVL AI – Danh mục vật liệu hoàn thiện tự động

Web app nội bộ: tải file concept nội thất (PDF) → bóc tách toàn bộ vật liệu trần/tường/sàn, đồ liền tường (kèm vật liệu cấu thành & phụ kiện), đồ rời, đèn, thiết bị, decor, artwork, đầu chờ MEP → suy luận hạng mục bắt buộc không thể hiện → kiểm tra đủ theo checklist → gợi ý mã từ thư viện công ty → rà soát, xác nhận → xuất Excel (VN/EN) và PDF theo nhóm vật liệu.

## Nguyên tắc chi phí: AI chỉ làm việc phần mềm không tự làm được
| Việc | Ai làm | Chi phí |
|---|---|---|
| Tách trang, đọc tiêu đề, gom phòng, đọc ô số liệu, phát hiện số liệu chép nhầm | Phần mềm (đọc chữ trong PDF) | 0 |
| **Nhìn ảnh phối cảnh → liệt kê vật liệu/đồ đạc + khung vị trí** | **AI – 1 lần/ảnh** (Gemini 3.8 Flash, có hạn mức miễn phí) | 0 trong hạn mức |
| Ghép mã trùng giữa các ảnh/phòng | Phần mềm (so khớp từ khóa) + AI gợi ý mã trùng | 0 |
| Lấy màu chủ đạo | Phần mềm (điểm ảnh) | 0 |
| Suy luận hạng mục thiếu (nắp thăm trần, phụ kiện cửa, len, thoát sàn…) | Phần mềm (bộ quy tắc `src/lib/infer.ts`) | 0 |
| Mô tả kỹ thuật, tính chất theo không gian, tiêu chuẩn (VN/EN) | Phần mềm (mẫu `src/lib/specs.ts`) | 0 |
| Gợi ý mã hãng | Thư viện công ty (xếp theo ΔE màu) + nút tìm nhanh trên web hãng | 0 |
| Phân loại trang cho PDF scan không có chữ | AI (tùy chọn, bấm tay) | 0 trong hạn mức |

Lưu ý: gói miễn phí của Gemini API cho phép Google dùng dữ liệu gửi lên để cải thiện sản phẩm; gói trả phí thì không.

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
3. **Secrets** (Supabase → Edge Functions → Secrets) – chọn MỘT nhà cung cấp AI, đổi lúc nào cũng được, không cần sửa code:
   - **Google Gemini:** `GEMINI_API_KEY` (aistudio.google.com/apikey), tuỳ chọn `GEMINI_MODEL` (mặc định `gemini-3.8-flash` – có hạn mức miễn phí; `gemini-3.1-pro-preview` chính xác hơn nhưng phải trả phí), `GEMINI_THINKING` (`low` mặc định)
   - **Anthropic Claude:** `ANTHROPIC_API_KEY` (console.anthropic.com), tuỳ chọn `ANTHROPIC_MODEL` (mặc định `claude-sonnet-5-5`)
   - `AI_PROVIDER` = `gemini` hoặc `anthropic` (bỏ trống: có khoá Claude thì dùng Claude, không thì dùng Gemini)
   - Tab "Phân tích AI" hiển thị nhà cung cấp & model đang dùng.
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

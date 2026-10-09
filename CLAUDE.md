# DMVL AI – ghi nhớ mục đích sản phẩm (đọc đầu tiên)

**Mục đích của chủ sản phẩm (GS-Archi): xây dựng MỘT QUY TRÌNH KHÉP KÍN, dữ liệu đi xuyên suốt, không nhập lại:**

1. **Dàn trang concept** (tab lớn riêng, độc lập, chỉ admin) – từ PDF mặt bằng AutoCAD vector → tô màu sàn các không gian (đồ nội thất để trắng), gộp/tách + đặt tên + đo diện tích → trang mặt bằng tổng có ô tên nét đứt thẳng hàng, kéo thả được → các trang concept khác theo mẫu (thư viện 4–5 kiểu dàn trang, lấy mẫu từ Canva của công ty). Mặt bằng phóng to từng khu là ảnh người dùng tải lên (ô ảnh trống).
2. **Lập danh mục vật liệu** (tab lớn riêng) – lấy luôn thông tin từ bước concept (tên phòng EN/VN, diện tích, mặt bằng, ảnh phối cảnh) để phân tích và đẩy sang danh mục. Chức năng "Đưa sang lập danh mục" PHẢI có.
3. **Khái toán và dự toán** – phần mềm tự bóc khối lượng từ mặt bằng vector; đơn giá do đơn vị ngoài cấp (file của họ). Đang tạm dừng, quay lại sau.

Nguyên tắc: miễn phí; AI chỉ dùng để nhìn ảnh, mọi việc khác là phần mềm; mọi thay đổi push thẳng `main`; trả lời người dùng bằng tiếng Việt, ngắn gọn.
Kỹ thuật: `projects.kind` = 'catalog' | 'concept' (cùng bảng để dữ liệu dùng chung: floor_plans, rooms…).

## Phân quyền tính năng lớn (quy ước bắt buộc)
Mọi tính năng lớn mới **mặc định chỉ admin (chủ dự án) thấy/dùng**. Thêm vào `src/lib/features.ts` (FEATURES), ẩn menu + route bằng `useAuth().can('key')`. Admin cấp cho từng thành viên bằng ô tích ở trang Thành viên (lưu `profiles.features text[]`, mặc định rỗng).

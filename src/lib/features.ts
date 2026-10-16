// Danh sách tính năng lớn cần cấp quyền. Mặc định CHỈ admin dùng; admin tick cho từng thành viên ở trang Thành viên.
// Thêm tính năng lớn mới => thêm 1 dòng ở đây + dùng can('key') để ẩn menu/route.
/** editorDefault: mặc định người có quyền SỬA dùng được (người chỉ xem phải được admin tích thêm) */
export const FEATURES: { key: string; label: string; editorDefault?: boolean }[] = [
  { key: 'concept', label: 'Dàn trang concept' },
  { key: 'library', label: 'Thư viện vật liệu' },
  { key: 'matrix', label: 'Tổng hợp phòng (ma trận vật liệu theo phòng, thêm phòng, sao chép vật liệu)' },
  { key: 'undo', label: 'Hoàn tác / lịch sử thay đổi (quay lại bước trước)' },
  { key: 'build', label: 'Cấu tạo lớp tường – trần – sàn (tích chọn trong Vật liệu đề xuất)' },
  { key: 'suggest', label: 'Vật liệu đề xuất (nối thư viện vào danh mục)', editorDefault: true },
]
export const editorHas = (key: string) => !!FEATURES.find(f => f.key === key)?.editorDefault

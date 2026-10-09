// Danh sách tính năng lớn cần cấp quyền. Mặc định CHỈ admin dùng; admin tick cho từng thành viên ở trang Thành viên.
// Thêm tính năng lớn mới => thêm 1 dòng ở đây + dùng can('key') để ẩn menu/route.
export const FEATURES: { key: string; label: string }[] = [
  { key: 'concept', label: 'Dàn trang concept' },
]

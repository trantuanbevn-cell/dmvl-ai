/** Cấu tạo mặc định theo nhóm vật liệu: khi chọn nhóm, ô "Cấu tạo" tự điền loại vật liệu (chỉ khi ô còn trống hoặc đang là mặc định của nhóm cũ – không đè chữ người dùng tự viết) */
const COMP: Record<string, string> = {
  CT: 'Gạch ceramic / porcelain', ST: 'Đá tự nhiên', ES: 'Đá nhân tạo', WD: 'Gỗ tự nhiên', LM: 'Gỗ công nghiệp (MDF/MFC)', WPC: 'Gỗ nhựa composite (WPC)',
  LVT: 'Sàn nhựa vinyl (LVT)', CPT: 'Thảm trải kín (broadloom)', CTL: 'Thảm tấm (carpet tile)', RUG: 'Thảm rời (area rug)', PT: 'Sơn nước', SP: 'Sơn đặc biệt', WC: 'Giấy / vải dán tường', WP: 'Tấm ốp tường',
  GWB: 'Thạch cao', FGWB: 'Thạch cao chống cháy', MGWB: 'Thạch cao chịu ẩm', ACT: 'Trần tiêu âm', MT: 'Kim loại', GL: 'Kính', MR: 'Gương', FB: 'Vải', LE: 'Da / giả da',
}
export const compDefault = (group: string): string | null => COMP[group] ?? null
/** Giá trị "Cấu tạo" mới khi đổi nhóm: điền mặc định nếu đang trống/đang là mặc định cũ; ngược lại giữ nguyên */
export function compOnGroupChange(current: string | null | undefined, oldGroup: string, newGroup: string): string | null | undefined {
  const cur = (current ?? '').trim()
  if (!cur || cur === compDefault(oldGroup)) return compDefault(newGroup)
  return current
}

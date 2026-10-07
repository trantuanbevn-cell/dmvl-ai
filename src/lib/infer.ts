// Suy luận hạng mục không thể hiện trong phối cảnh – BỘ QUY TẮC, KHÔNG dùng AI.
// Mỗi quy tắc xem các mã đã nhận diện trong phòng và đề xuất hạng mục logic bắt buộc phải có.
import type { Entry, Room } from './types'

export type Inferred = { group: string; category: string; name_vn: string; name_en: string; material_vn: string; reason: string; qty?: number; unit?: string }

const n = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
const has = (es: Entry[], re: RegExp, groups?: string[]) => es.some(e => (!groups || groups.includes(e.group_code)) && re.test(n(`${e.name_vn} ${e.material_vn ?? ''} ${e.part_vn ?? ''} ${e.name_en ?? ''}`)))

export const RULES: { id: string; label: string; run: (room: Room, es: Entry[]) => Inferred | null }[] = [
  { id: 'access_panel', label: 'Trần thạch cao kín → nắp thăm trần', run: (_r, es) =>
    (es.some(e => e.group_code === 'GWB') || has(es, /thach cao|gypsum/)) && !has(es, /tham tran|access panel/)
      ? { group: 'GWB', category: 'ceiling', name_vn: 'Nắp thăm trần 600x600', name_en: 'Ceiling access panel 600x600', material_vn: 'Khung nhôm âm, mặt tấm thạch cao, sơn trùng màu trần', reason: 'Trần thạch cao kín có thiết bị kỹ thuật phía trên → cần nắp thăm để bảo trì', unit: 'bộ' } : null },
  { id: 'door_hw', label: 'Có cửa → bộ phụ kiện cửa', run: (_r, es) => {
    const doors = es.filter(e => e.group_code === 'DR' || (e.category === 'door' && e.group_code !== 'HW'))
    return doors.length && !es.some(e => e.group_code === 'HW')
      ? { group: 'HW', category: 'door', name_vn: 'Bộ phụ kiện cửa đi', name_en: 'Door hardware set', material_vn: 'Bản lề, khóa/ tay gạt, tay co thủy lực, chặn cửa – inox 304 xước', reason: 'Phối cảnh thể hiện cửa nhưng không rõ phụ kiện', qty: doors.reduce((s, d) => s + (d.qty ?? 0), 0) || undefined, unit: 'bộ' } : null } },
  { id: 'floor_trim', label: '≥ 2 vật liệu sàn → nẹp chuyển tiếp', run: (_r, es) =>
    es.filter(e => e.category === 'floor').length >= 2 && !has(es, /nep chuyen|transition/)
      ? { group: 'MT', category: 'floor', name_vn: 'Nẹp chuyển tiếp vật liệu sàn', name_en: 'Floor transition strip', material_vn: 'Nẹp inox 304/ nhôm, bản 8–10mm, theo cao độ hoàn thiện', reason: 'Phòng có từ 2 vật liệu sàn tiếp giáp', unit: 'md' } : null },
  { id: 'skirting', label: 'Chưa có len → len chân tường', run: (_r, es) =>
    !es.some(e => e.category === 'base' || e.group_code === 'BS') && es.some(e => e.category === 'floor')
      ? { group: 'BS', category: 'base', name_vn: 'Len chân tường', name_en: 'Skirting', material_vn: 'Cao 80–100mm, cùng vật liệu/ màu với sàn hoặc theo chỉ định', reason: 'Phối cảnh không thể hiện rõ len; mọi phòng cần len bảo vệ chân tường', unit: 'md' } : null },
  { id: 'wet_drain', label: 'Khu ướt → thoát sàn', run: (r, es) =>
    r.room_type === 'locker_wc' && !has(es, /thoat san|floor drain/)
      ? { group: 'SF', category: 'sanitary', name_vn: 'Thoát sàn inox chống mùi', name_en: 'SS anti-odour floor drain', material_vn: 'Inox 304, có bẫy mùi, mặt chống trượt', reason: 'Khu WC/ tắm bắt buộc có thoát sàn', unit: 'cái' } : null },
  { id: 'wc_acc', label: 'WC → bộ phụ kiện WC', run: (r, es) =>
    r.room_type === 'locker_wc' && !es.some(e => e.group_code === 'BA')
      ? { group: 'BA', category: 'sanitary', name_vn: 'Bộ phụ kiện phòng vệ sinh', name_en: 'Washroom accessories set', material_vn: 'Lô giấy, hộp giấy lau tay/ máy sấy tay, bình xà phòng, móc áo – inox 304', reason: 'Phòng vệ sinh nhân viên luôn cần bộ phụ kiện này', unit: 'bộ' } : null },
  { id: 'wc_fan', label: 'WC → quạt hút', run: (r, es) =>
    r.room_type === 'locker_wc' && !has(es, /quat hut|exhaust/)
      ? { group: 'ME', category: 'mep', name_vn: 'Quạt hút mùi âm trần', name_en: 'Ceiling exhaust fan', material_vn: 'Mặt nạ trắng trùng màu trần (phối hợp MEP)', reason: 'Khu vệ sinh cần thông gió cưỡng bức', unit: 'cái' } : null },
  { id: 'led_driver', label: 'Đèn hắt/ LED dây → nguồn + máng nhôm', run: (_r, es) =>
    has(es, /hat|led day|khe sang|strip|cove|backlit/, ['LT']) && !has(es, /nguon led|driver|mang nhom/)
      ? { group: 'LT', category: 'lighting', name_vn: 'Bộ nguồn + máng nhôm cho LED dây', name_en: 'LED strip driver & aluminium profile', material_vn: 'Máng nhôm định hình có tấm khuếch tán, nguồn 12/24V đồng bộ', reason: 'Đèn hắt/ LED dây nhìn thấy cần máng và bộ nguồn', unit: 'bộ' } : null },
  { id: 'cabinet_hw', label: 'Tủ có cánh → phụ kiện tủ', run: (_r, es) =>
    has(es, /tu |tu$|cabinet|locker|ke tu/, ['JN']) && !es.some(e => e.group_code === 'FH')
      ? { group: 'FH', category: 'joinery', name_vn: 'Phụ kiện tủ', name_en: 'Cabinet hardware', material_vn: 'Bản lề giảm chấn, ray trượt, tay nắm/ tay móc âm – Hafele/ Blum hoặc tương đương', reason: 'Tủ có cánh/ ngăn kéo cần phụ kiện', unit: 'bộ' } : null },
  { id: 'return_air', label: 'Có miệng gió cấp/ cassette → miệng gió hồi', run: (_r, es) =>
    has(es, /cassette|mieng gio cap|supply|dieu hoa/, ['ME']) && !has(es, /gio hoi|return/)
      ? { group: 'ME', category: 'mep', name_vn: 'Miệng gió hồi', name_en: 'Return air grille', material_vn: 'Nhôm sơn tĩnh điện trùng màu trần (phối hợp MEP)', reason: 'Hệ điều hòa luôn có miệng cấp và miệng hồi', unit: 'cái' } : null },
  { id: 'mep_faceplates', label: 'Mọi phòng → mặt nạ thiết bị MEP', run: (_r, es) =>
    !has(es, /bao khoi|sprinkler|o cam|cong tac|smoke|socket/)
      ? { group: 'ME', category: 'mep', name_vn: 'Đầu báo khói, sprinkler, công tắc – ổ cắm', name_en: 'Smoke detectors, sprinklers, switches & sockets', material_vn: 'Phối hợp vị trí và màu mặt nạ theo màu trần/ tường', reason: 'Không thể hiện trong phối cảnh nhưng luôn có (PCCC, điện)', unit: 'bộ' } : null },
  { id: 'blinds', label: 'Có cửa sổ → rèm', run: (_r, es) =>
    has(es, /cua so|window|kinh ngoai/) && !es.some(e => e.group_code === 'WT')
      ? { group: 'WT', category: 'window', name_vn: 'Rèm cuốn cửa sổ', name_en: 'Window roller blinds', material_vn: 'Vải polyester chống chói/ cản sáng theo chỉ định', reason: 'Phòng có cửa sổ kính ra ngoài', unit: 'bộ' } : null },
]

export function inferForRoom(room: Room, entriesInRoom: Entry[], disabled: string[] = []): Inferred[] {
  const out: Inferred[] = []
  for (const r of RULES) { if (disabled.includes(r.id)) continue; const x = r.run(room, entriesInRoom); if (x) out.push(x) }
  return out
}

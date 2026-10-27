// Cảnh báo "vận hành yêu cầu sửa" gắn theo từng vật liệu (dự án Westin): nhận xét của đơn vị vận hành + đối chiếu Westin Design Standards APAC (Managed, 12/2025).
// Chỉ HIỂN THỊ trong ứng dụng (nút đỏ ⚠), không đưa vào file xuất, không tự sửa dữ liệu vật liệu.
import type { ProjectData } from './useProject'
import type { Entry, Room } from './types'

export type OpFlag = {
  id: string; title: string
  op: string          // nguyên văn góp ý của vận hành
  std?: string        // đối chiếu Design Standards
  fix: string         // nội dung cần sửa
  flip: boolean       // true = chuyển trạng thái sang "cần xem lại" (màu cam); false = chỉ nhắc
}
export type FlagHit = { flag: OpFlag; rooms: Room[]; lux: LuxRow[] }
export type LuxRow = { space: string; lux: string; cct: string; cri: string; page: string }

const WET = /vệ sinh|thay đồ|wc|tắm/i
const KITCHEN = /bếp|rửa bát|sơ chế|kho thực phẩm/i
const PREP = /cắm hoa|sơ chế/i
const OFFICE = /văn phòng|giám đốc|tài chính|hcns|f&b|rủi ro|kinh doanh|phỏng vấn|họp|nhân sự|trưởng/i
const BOH = /hskp|mep|kho|giặt|bếp|rửa bát|đồng phục|vệ sinh dụng cụ|hóa chất|rác|xưởng|kỹ thuật|sơ chế|cắm hoa/i

const DS = 'Westin Design Standards – APAC, Managed, 12/2025'
export const FLAGS: OpFlag[] = [
  { id: 'slip', title: 'Chỉ số chống trượt sàn khu ẩm (WC / thay đồ)', flip: true,
    op: 'Gạch lát sàn khu vực nhà vệ sinh/phòng thay đồ: chỉ số chống trơn trượt là bao nhiêu? Khu vực ẩm ướt yêu cầu đạt chuẩn R12 hoặc R13.',
    std: `${DS}: không dùng chỉ số R mà yêu cầu hệ số ma sát động (DCOF) tối thiểu ở chương 16 (tr. 87, 422); sàn phải chống trượt (tr. 91, 102). R12/R13 là yêu cầu của vận hành.`,
    fix: 'Ghi rõ chống trượt R12 hoặc R13 (khi ướt) vào thông số của vật liệu lát sàn khu ẩm, kèm DCOF theo chương 16. Nếu mã đang ghi R10 thì phải đổi sản phẩm/mã tham khảo đạt R12–R13.' },
  { id: 'voc', title: 'Vinyl LVT: không phát thải VOC + chỉ số trơn', flip: true,
    op: 'Sàn nhựa vinyl (LVT-01 / 02 / 03): loại sàn này không được phát thải khí VOC. Vui lòng xác nhận. Chỉ số chống trơn trượt của LVT-01 là bao nhiêu?',
    std: `${DS}: không có yêu cầu VOC riêng; sàn cứng phải chống trượt theo chương 16. VOC là yêu cầu của vận hành.`,
    fix: 'Xác nhận với nhà cung cấp và ghi vào thông số: "Không phát thải VOC / phát thải thấp (FloorScore hoặc tương đương)" + chỉ số chống trơn trượt. LVT-01 (nhà ăn, thay đồ) phải có chỉ số trơn rõ ràng.' },
  { id: 'kceil', title: 'Trần bếp / rửa bát: không dùng thạch cao chống cháy', flip: true,
    op: 'Trần thạch cao chống cháy (FGWB-01): không phù hợp cho khu vực bếp và khu vực rửa bát tại căng tin. Chọn loại trần nhôm có thể tháo lắp và lau rửa được riêng cho các khu vực bếp.',
    std: `${DS}, tr. 75: trần khu chế biến thực phẩm phải là tấm tháo lắp được, phủ vinyl hoặc không ăn mòn, trên khung nhôm, rửa được nhiều lần.`,
    fix: 'Bỏ trần thạch cao chống cháy khỏi các phòng bếp và khu rửa bát; gán trần nhôm tấm clip-in/lay-in tháo lắp, sơn tĩnh điện, lau rửa được (thêm mã mới hoặc mở rộng mã trần nhôm).' },
  { id: 'bench', title: 'Phòng thay đồ: không ghế băng bọc nệm', flip: true,
    op: 'Không sử dụng ghế băng bọc nệm trong phòng thay đồ; hãy sử dụng ghế bằng kim loại hoặc gỗ đặc.',
    fix: 'Đổi ghế đôn/ghế băng có đệm bọc vải thành ghế khung kim loại hoặc gỗ đặc, bỏ lớp đệm bọc và mã vải tương ứng.' },
  { id: 'kcons', title: 'FF&E phòng xử lý hoa / sơ chế thô thuộc phạm vi tư vấn bếp', flip: true,
    op: 'Tất cả các hạng mục trang thiết bị, đồ nội thất và vật dụng (FF&E) trong phòng xử lý hoa / khu vực sơ chế thô cần nằm trong phạm vi công việc của đơn vị tư vấn bếp.',
    fix: 'Chuyển các mã FF&E ở phòng cắm hoa / khu sơ chế thô sang phạm vi đơn vị tư vấn bếp: gắn ghi chú phạm vi hoặc tách khỏi danh mục nội thất của dự án.' },
  { id: 'cove', title: 'Len chân tường bếp: phải bo góc (coved)', flip: true,
    op: 'Gạch ốp chân tường (SKT-05) trong khu vực bếp: phải là loại bo góc (coved skirting) để đảm bảo vệ sinh. Vui lòng cung cấp hình ảnh mẫu.',
    std: `${DS}, tr. 78: sàn bếp là urethane resinous có chân tường bo góc liền (integral cove base), chống trượt; tr. 489: chân tường coved vinyl hoặc coved porcelain.`,
    fix: 'Ghi "len chân tường bo góc (coved), R≥20mm" vào thông số khu bếp, gắn ảnh mẫu. Cân nhắc đổi sàn bếp sang resinous theo tiêu chuẩn. Lưu ý mã vận hành gọi SKT-05 có thể lệch với mã hiện tại.' },
  { id: 'blind', title: 'Văn phòng: không dùng mành sáo ngang, dùng rèm cuốn', flip: true,
    op: 'Không sử dụng mành sáo ngang (venetian blinds) để tạo sự riêng tư trong văn phòng; hãy sử dụng rèm cuốn (roller blinds). Mành sáo ngang rất dễ hư hỏng và khó vệ sinh (WT-01).',
    std: `${DS}, tr. 105: tiêu chuẩn chỉ nhắc rèm cuốn (roller shade).`,
    fix: 'Đổi các phòng đang dùng rèm sáo sang rèm cuốn (mã rèm cuốn có sẵn), rồi bỏ mã rèm sáo nếu không còn dùng.' },
  { id: 'gm', title: 'Chờ Tổng quản lý (GM) xác nhận trước khi mua sắm', flip: false,
    op: 'Chờ đến khi Tổng quản lý (GM) bắt đầu làm việc mới tiến hành mua sắm nội thất văn phòng, vật phẩm trang trí và tác phẩm nghệ thuật. GM sẽ là người xác nhận số lượng và mẫu mã cuối cùng.',
    fix: 'Không đặt mua. Thêm ghi chú "mua sắm sau khi GM xác nhận số lượng và mẫu mã" cho nội thất văn phòng, decor, tranh.' },
  { id: 'art', title: 'Không bố trí tranh ở khu BOH', flip: true,
    op: 'Không cần bố trí tác phẩm nghệ thuật tại các khu vực BOH.',
    fix: 'Xoá vật liệu tranh khỏi các phòng BOH (HSKP, xưởng MEP, kho, giặt…) hoặc bỏ vị trí BOH khỏi mã.' },
  { id: 'klight', title: 'Đèn bếp / kho thực phẩm / căng tin: loại kín, lau rửa được', flip: true,
    op: 'Hệ thống chiếu sáng trần tại khu vực bếp, kho thực phẩm và khu vực phục vụ của căng tin phải là loại có vỏ bọc, lau rửa được.',
    std: `${DS}, tr. 794 (15C.12, mục Food Production): đèn âm trần mặt nhựa tháo rửa được, phẳng với trần; đèn tuýp có vỏ chống vỡ (shatterproof).`,
    fix: 'Thêm mã đèn kín (âm trần mặt nhựa/kính tháo rửa được, IP phù hợp, vỏ chống vỡ) cho bếp, kho thực phẩm, khu phục vụ căng tin; bỏ các phòng này khỏi đèn downlight thường.' },
  { id: 'relamp', title: 'Đèn phải thay được bóng, tránh đèn liền khối', flip: true,
    op: 'Lưu ý chung về chiếu sáng: hãy chọn các loại đèn có thể thay thế bóng đèn, tránh loại đèn kín (liền khối) mà mỗi khi hỏng bóng lại phải thay toàn bộ thiết bị.',
    fix: 'Ghi vào thông số "bóng/module/driver thay thế được". Với đèn liền khối (LED tích hợp) cần đổi loại hoặc xin vận hành chấp nhận.' },
  { id: 'lux', title: 'Độ rọi (lux) theo Design Standards 15C.12', flip: true,
    op: 'Đảm bảo đáp ứng các tiêu chuẩn về độ rọi (lux) theo quy định tại Tiêu chuẩn Thiết kế (Design Standards) mục 15C.12.',
    std: `${DS}, mục 15C.12 (tr. 792–794): độ rọi duy trì (maintained), kèm CCT và CRI tối thiểu. Không gian không có trong bảng: tối thiểu 35 FC (350 lux). 1 FC ≈ 10,76 lux.`,
    fix: 'Đối chiếu công suất / số lượng đèn với độ rọi, CCT, CRI của từng loại phòng bên dưới và ghi vào thông số đèn. Kiểm tra bằng tính toán chiếu sáng.' },
]

const LUX: { re: RegExp; row: LuxRow }[] = [
  { re: KITCHEN, row: { space: 'Bếp (Food Production)', lux: 'Sơ chế / chế biến ≥ 50 FC (500 lux); rửa bát ≥ 20 FC (200 lux) tại 760mm; kho thực phẩm ≥ 10 FC (100 lux); chung 20–30 FC (200–300 lux) tại sàn', cct: '4000K', cri: '85', page: 'tr. 794' } },
  { re: /kho khô|kho thực phẩm|kho hàng/i, row: { space: 'Kho khô', lux: '20–40 FC (215–430 lux)', cct: '4000K', cri: '70', page: 'tr. 794' } },
  { re: /kho lạnh/i, row: { space: 'Kho lạnh', lux: '20 FC (215 lux)', cct: '4000–5000K', cri: '70', page: 'tr. 794' } },
  { re: /^kho(?! thực phẩm| hàng)/i, row: { space: 'Kho chung', lux: '10–20 FC (100–200 lux) tại sàn', cct: '4000K', cri: '70', page: 'tr. 794' } },
  { re: /nhà ăn|căng tin|cafeteria/i, row: { space: 'Căng tin nhân viên', lux: 'Làm việc 30–50 FC (300–500 lux); chung 20–30 FC (200–300 lux) tại 760mm; quầy đồ ăn 30–50 FC (300–500 lux); tối thiểu 2 FC (20 lux) khi không người', cct: '3000–3500K', cri: '70', page: 'tr. 793' } },
  { re: WET, row: { space: 'WC & thay đồ nhân viên', lux: 'Làm việc 30–50 FC (300–500 lux); chung 20–30 FC (200–300 lux) tại 760mm; tối thiểu 2 FC (20 lux)', cct: '3500–4000K', cri: '70', page: 'tr. 793' } },
  { re: /văn phòng|giám đốc|tài chính|hcns|f&b|rủi ro|kinh doanh|trưởng|phỏng vấn|họp/i, row: { space: 'Văn phòng hành chính / nhân sự', lux: 'Làm việc 30–50 FC (300–500 lux); chung 20–30 FC (200–300 lux) tại 760mm', cct: '3500–4000K', cri: '70', page: 'tr. 793' } },
  { re: /hành lang/i, row: { space: 'Hành lang BOH', lux: 'Trung bình 10–15 FC (50–100 lux)', cct: '3500–4000K', cri: '70', page: 'tr. 793' } },
  { re: /sảnh thang/i, row: { space: 'Sảnh thang dịch vụ', lux: '10–20 FC (100–200 lux); tối thiểu 2 FC (20 lux) khi không người', cct: '3500–4000K', cri: '70', page: 'tr. 793' } },
  { re: /hskp|giặt|đồng phục|vải/i, row: { space: 'Giặt / HSKP', lux: 'Giặt: làm việc 30–60 FC (300–600 lux); HSKP chung 15–30 FC (150–300 lux); kho ≥ 10 FC (100 lux)', cct: '3500–4000K', cri: '80', page: 'tr. 794' } },
  { re: /mep|kỹ thuật|xưởng|máy|cntt/i, row: { space: 'MEP / kỹ thuật', lux: '30–50 FC (300–500 lux) tại 900mm', cct: '4000K', cri: '70', page: 'tr. 794' } },
]
export const LUX_DEFAULT = 'Không gian không có trong bảng 15C.12: tối thiểu 35 FC (350 lux) (tr. 794).'

const occRooms = (d: ProjectData, e: Entry) => {
  const out: Room[] = []
  for (const o of d.occ) { if (o.entry_id !== e.id || !o.room_id) continue; const r = d.rooms.find(x => x.id === o.room_id); if (r && !out.includes(r)) out.push(r) }
  return out
}
const txt = (e: Entry) => `${e.name_vn ?? ''} ${e.part_vn ?? ''} ${e.desc_vn ?? ''} ${e.material_vn ?? ''}`
export const isWestin = (d: ProjectData) => /westin/i.test(d.project?.name ?? '')

/** Cảnh báo áp cho một vật liệu (dựa trên nhóm mã + phòng + nội dung, không phụ thuộc số thứ tự mã) */
/** Cảnh báo cần sửa chỉ hiện khi vật liệu CHƯA ở trạng thái xanh "đã xác nhận" (sửa xong bấm Duyệt là hết cảnh báo); riêng cảnh báo chỉ nhắc (flip=false) luôn hiện */
export function flagsFor(d: ProjectData, e: Entry, ignoreStatus = false): FlagHit[] {
  if (!isWestin(d) || e.status === 'rejected') return []
  const rooms = occRooms(d, e), g = e.group_code, t = txt(e)
  const inR = (re: RegExp) => rooms.filter(r => re.test(r.name_vn))
  const floorWet = d.occ.some(o => o.entry_id === e.id && o.category === 'floor' && o.room_id && WET.test(d.rooms.find(r => r.id === o.room_id)?.name_vn ?? ''))
  const hits: FlagHit[] = []
  const add = (id: string, rs: Room[], lux = false) => { const flag = FLAGS.find(f => f.id === id)!; hits.push({ flag, rooms: rs, lux: lux ? luxFor(rs.length ? rs : rooms) : [] }) }
  if (floorWet || (g === 'CT' && /lát sàn/i.test(t) && inR(WET).length)) add('slip', inR(WET))
  if (g === 'LVT') add('voc', rooms)
  if (g === 'FGWB' && inR(KITCHEN).length) add('kceil', inR(KITCHEN))
  if (/ghế đôn|ghế băng|băng ghế/i.test(t) && inR(/thay đồ/i).length) add('bench', inR(/thay đồ/i))
  if (['FF', 'SF', 'BA', 'EQ', 'JN', 'FH'].includes(g) && inR(PREP).length) add('kcons', inR(PREP))
  if (g === 'BS' && inR(KITCHEN).length) add('cove', inR(KITCHEN))
  if (g === 'WT' && /sáo/i.test(t)) add('blind', rooms)
  if (['FF', 'AW', 'DC', 'JN'].includes(g) && inR(OFFICE).length) add('gm', inR(OFFICE))
  if (g === 'AW' && inR(BOH).length) add('art', inR(BOH))
  if (g === 'LT') {
    const k = inR(/bếp|rửa bát|kho thực phẩm|nhà ăn|căng tin|phục vụ/i)
    if (k.length || rooms.length >= 30) add('klight', k)
    add('relamp', [])
    add('lux', rooms, true)
  }
  return !ignoreStatus && e.status === 'approved' ? hits.filter(h => !h.flag.flip) : hits
}

export function luxFor(rooms: Room[]): LuxRow[] {
  const out: LuxRow[] = []
  for (const r of rooms) { const m = LUX.find(x => x.re.test(r.name_vn)); if (m && !out.includes(m.row)) out.push(m.row) }
  return out
}

/** Vật liệu đang xanh (đã xác nhận) nhưng có cảnh báo cần sửa → chuyển sang "cần xem lại" (cam) */
export const flippable = (d: ProjectData) => d.entries.filter(e => e.status === 'approved' && flagsFor(d, e, true).some(h => h.flag.flip))

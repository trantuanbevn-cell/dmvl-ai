// Thư viện thông số kỹ thuật CHUẨN cho vật liệu cơ bản (thạch cao, khung trần…): lấy theo catalogue Vĩnh Tường – Saint-Gobain (Gyproc).
// Chọn nhanh trong bảng Vật Liệu Đề Xuất → điền vào "Thông số kỹ thuật" + "Cấu tạo". Chỉ ghi nội dung kỹ thuật, KHÔNG có giá.
import type { Entry } from './types'
import { saveEntry } from './entryLink'

export type BasicSpec = { key: string; title: string; groups: string[]; brand: string; note?: string; composition: string; vn: string[]; en: string[]; src: string; src_url?: string }

const FRAME_VN = 'Khung xương chìm Vĩnh Tường (C600/Alpha/Basi): thanh chính & thanh phụ 35×14,5 mm, thép mạ kẽm/Al-Zn dày 0,32 mm, dài 4000 mm (TCVN 7470); thanh chính cách tường ≤ 400 mm, các thanh tiếp theo cách 800 mm; thanh phụ cách 406 mm; ty treo cách 800 mm'
const FRAME_EN = 'Vĩnh Tường concealed ceiling frame (C600/Alpha/Basi): main & cross runners 35×14.5 mm, galvanised/Al-Zn steel 0.32 mm thick, 4000 mm long (TCVN 7470); main runner ≤ 400 mm from wall then 800 mm spacing; cross runners at 406 mm; hangers at 800 mm'
const GY = 'https://vinhtuong.com/sites/default/files/2020-04/%5BFINAL%5D%20DATASHEET%20VINHTUONG-GYPROC%20PLASTERBOARD.pdf'
const FR = 'https://www.saint-gobain.com.vn/index.php/system/files/files/documents/BROCHURE_KHUNG%20TRAN%20CHIM%20C600_Project_C600.pdf'
const TB = 'https://www.saint-gobain.com.vn/documents/vinh-tuong/brochure-fineline-x-project.pdf'

export const BASIC_SPECS: BasicSpec[] = [
  {
    key: 'gwb-std', title: 'Trần thạch cao tiêu chuẩn – khung chìm', groups: ['GWB'], brand: 'Vĩnh Tường – Gyproc', src: 'Datasheet Gyproc + brochure khung C600 (Vĩnh Tường – Saint-Gobain)', src_url: GY,
    composition: 'Tấm thạch cao Gyproc tiêu chuẩn 9 mm + khung chìm Vĩnh Tường',
    vn: ['Tấm thạch cao Vĩnh Tường-Gyproc tiêu chuẩn (mặt giấy xám ngà), dày 9 mm (có 12,5 / 15 mm), 1220×2440 mm, cạnh vạt (RE)', FRAME_VN, 'Tiêu chuẩn: TCVN 8256:2009; EN 520; ASTM C1396; vật liệu không cháy theo QCVN 06:2010/BXD', 'Hoàn thiện: xử lý mối nối, bả matit, sơn theo mã hoàn thiện'],
    en: ['Vĩnh Tường-Gyproc standard plasterboard (ivory-grey face), 9 mm thick (12.5 / 15 mm available), 1220×2440 mm, recessed edge (RE)', FRAME_EN, 'Standards: TCVN 8256:2009; EN 520; ASTM C1396; non-combustible per QCVN 06:2010/BXD', 'Finish: joint treatment, skim coat, paint as per finish code'],
  },
  {
    key: 'gwb-moist', title: 'Trần thạch cao siêu chịu ẩm – khung chìm', groups: ['MGWB', 'GWB'], brand: 'Vĩnh Tường – Gyproc', src: 'Datasheet + brochure tấm chịu ẩm Gyproc', src_url: GY,
    composition: 'Tấm thạch cao Gyproc siêu chịu ẩm + khung chìm Vĩnh Tường',
    vn: ['Tấm thạch cao Vĩnh Tường-Gyproc siêu chịu ẩm (mặt giấy xanh rêu nhạt, lõi có phụ gia chống ẩm), dày 9 / 12,5 / 15 mm, 1220×2440 mm, cạnh vạt (RE) hoặc vuông (SE)', 'Độ hút nước < 5% (ASTM C1396, TCVN 8256); không dùng nơi ẩm ướt liên tục, không phải lớp chống thấm; không dùng ở nhiệt độ > 49 °C', FRAME_VN, 'Tiêu chuẩn: TCVN 8256; EN 520; ASTM C1396; QCVN 16; không cháy theo QCVN 06:2010/BXD', 'Hoàn thiện: sơn chống ẩm / chống nấm mốc; nếu ốp gạch cần chống thấm trước'],
    en: ['Vĩnh Tường-Gyproc moisture-resistant plasterboard (light green face, water-repellent core), 9 / 12.5 / 15 mm, 1220×2440 mm, recessed (RE) or square (SE) edge', 'Water absorption < 5% (ASTM C1396, TCVN 8256); not for continuous wet areas and not a waterproofing layer; not for temperatures above 49 °C', FRAME_EN, 'Standards: TCVN 8256; EN 520; ASTM C1396; QCVN 16; non-combustible per QCVN 06:2010/BXD', 'Finish: moisture / mould-resistant paint; waterproof first if tiled'],
  },
  {
    key: 'gwb-fire', title: 'Trần thạch cao chống cháy – khung chìm', groups: ['FGWB', 'GWB'], brand: 'Vĩnh Tường – Gyproc', src: 'Datasheet Gyproc (tấm chống cháy)', src_url: GY,
    composition: 'Tấm thạch cao Gyproc chống cháy + khung chìm Vĩnh Tường',
    vn: ['Tấm thạch cao Vĩnh Tường-Gyproc chống cháy (mặt giấy hồng, lõi có sợi thủy tinh và micro silica), dày 12,5 / 15 mm, 1220×2440 mm, cạnh vạt (RE)', FRAME_VN, 'Hệ thạch cao có khả năng chống cháy 30–150 phút tùy thiết kế; vật liệu không cháy theo QCVN 06:2010/BXD, EN ISO 1182', 'Tiêu chuẩn: TCVN 8256:2009; EN 520; ASTM C1396'],
    en: ['Vĩnh Tường-Gyproc fire-rated plasterboard (pink face, glass-fibre and micro-silica core), 12.5 / 15 mm, 1220×2440 mm, recessed edge (RE)', FRAME_EN, 'Board system fire resistance 30–150 min depending on design; non-combustible per QCVN 06:2010/BXD, EN ISO 1182', 'Standards: TCVN 8256:2009; EN 520; ASTM C1396'],
  },
  {
    key: 'tbar', title: 'Trần thả (khung nổi T-bar) – tấm 600×600', groups: ['ACT', 'GWB'], brand: 'Vĩnh Tường (FineLINE X)', src: 'Brochure khung trần nổi FineLINE X (Vĩnh Tường – Saint-Gobain)', src_url: TB,
    composition: 'Tấm trần 600×600 mm trên khung nổi Vĩnh Tường FineLINE X',
    vn: ['Khung trần nổi Vĩnh Tường FineLINE X: thanh chính 3600/3660 mm, thanh phụ 1200/1220 mm và 600/610 mm, thép dày 0,27 mm mạ kẽm/Al-Zn/sơn màu (TCVN 7470), đạt ASTM C635', 'Ty treo đầu tiên cách tường ≤ 610 mm, các ty tiếp theo cách 1200 / 1220 mm', 'Bảo hành chống rỉ 10 năm (nhiệt độ ≤ 40 °C, độ ẩm ≤ 90%, trong nhà)', 'Tấm trần lắp vào ô khung 600×600 mm (loại tấm theo hạng mục thiết kế)'],
    en: ['Vĩnh Tường FineLINE X exposed grid: main runner 3600/3660 mm, cross runners 1200/1220 mm and 600/610 mm, 0.27 mm steel, galvanised/Al-Zn/pre-painted (TCVN 7470), complies with ASTM C635', 'First hanger ≤ 610 mm from wall, then 1200 / 1220 mm spacing', '10-year anti-rust warranty (≤ 40 °C, ≤ 90% RH, indoor)', 'Ceiling tiles drop into 600×600 mm grid openings (tile type per design)'],
  },
  {
    key: 'access', title: 'Lỗ thăm trần thạch cao (nắp thăm)', groups: ['GWB', 'MGWB', 'FGWB'], brand: '', note: 'Thông số thông dụng của ngành – chưa tìm được catalogue riêng của Vĩnh Tường, nên chọn hãng sau', src: 'Thông số thông dụng (không theo hãng cụ thể)',
    composition: 'Nắp thăm trần khung nhôm + tấm thạch cao cùng loại trần',
    vn: ['Nắp thăm trần khung nhôm/thép sơn tĩnh điện, lắp tấm thạch cao cùng loại và độ dày với trần (9–12,5 mm), bản lề hoặc khóa bấm', 'Kích thước thông dụng 450×450 / 600×600 mm (theo vị trí thiết bị cần bảo trì)', 'Hoàn thiện cùng màu sơn trần, mép nắp liền mạch với mặt trần'],
    en: ['Ceiling access panel, powder-coated aluminium/steel frame, fitted with plasterboard of the same type and thickness as the ceiling (9–12.5 mm), hinge or push-latch', 'Common sizes 450×450 / 600×600 mm (per maintenance location)', 'Finished in the ceiling paint colour, flush with the ceiling surface'],
  },
]

const HEAD_VN = 'Hệ trần – thông số chuẩn:', HEAD_EN = 'Ceiling system – standard specification:'
const strip = (t: string, head: string) => {
  const ls = (t ?? '').split('\n'), i = ls.findIndex(l => l.trim() === head)
  if (i < 0) return (t ?? '').trim()
  let j = i + 1; while (j < ls.length && /^\s*[-•]/.test(ls[j])) j++
  return [...ls.slice(0, i), ...ls.slice(j)].join('\n').trim()
}

/** Gợi ý theo nhóm; nhóm sơn mà nói về trần/thạch cao cũng được gợi ý (hoàn thiện sơn trên trần thạch cao) */
export function relevantSpecs(e: Pick<Entry, 'group_code' | 'name_vn' | 'part_vn' | 'material_vn' | 'desc_vn'>): BasicSpec[] {
  const g = (e.group_code ?? '').toUpperCase()
  const txt = `${e.name_vn ?? ''} ${e.part_vn ?? ''} ${e.material_vn ?? ''} ${e.desc_vn ?? ''}`.toLowerCase()
  const byGroup = BASIC_SPECS.filter(s => s.groups.includes(g))
  if (byGroup.length) return byGroup
  if (/trần|thạch cao|vách/.test(txt)) return BASIC_SPECS.filter(s => s.key !== 'access')
  return []
}

/** Ghi thông số chuẩn vào mục: thêm khối "Hệ trần – thông số chuẩn" dưới phần mô tả hiện có (áp lại thì thay khối cũ), điền ô Cấu tạo */
export async function applyBasicSpec(e: Entry, s: BasicSpec) {
  const block = (head: string, ls: string[]) => head + '\n' + ls.map(l => '- ' + l).join('\n')
  const join = (a: string, b: string) => (a ? a + '\n' : '') + b
  return saveEntry(e, {
    desc_vn: join(strip(e.desc_vn ?? '', HEAD_VN), block(HEAD_VN, s.vn)),
    desc_en: join(strip(e.desc_en ?? '', HEAD_EN), block(HEAD_EN, s.en)),
    composition: s.composition,
  })
}

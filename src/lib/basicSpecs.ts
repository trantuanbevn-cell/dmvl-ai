// Thư viện thông số kỹ thuật CHUẨN cho vật liệu cơ bản (thạch cao, khung trần…): lấy theo catalogue Vĩnh Tường – Saint-Gobain (Gyproc).
// Chọn nhanh trong bảng Vật Liệu Đề Xuất → điền vào "Thông số kỹ thuật" + "Cấu tạo". Chỉ ghi nội dung kỹ thuật, KHÔNG có giá.
import type { Entry } from './types'
import { saveEntry } from './entryLink'

export type BasicSpec = { key: string; title: string; groups: string[]; brand: string; note?: string; composition: string; vn: string[]; en: string[]; src: string; src_url?: string; head?: [string, string]; match?: RegExp }

const FRAME_VN = 'Khung xương chìm Vĩnh Tường (C600/Alpha/Basi): thanh chính & thanh phụ 35×14,5 mm, thép mạ kẽm/Al-Zn dày 0,32 mm, dài 4000 mm (TCVN 7470); thanh chính cách tường ≤ 400 mm, các thanh tiếp theo cách 800 mm; thanh phụ cách 406 mm; ty treo cách 800 mm'
const FRAME_EN = 'Vĩnh Tường concealed ceiling frame (C600/Alpha/Basi): main & cross runners 35×14.5 mm, galvanised/Al-Zn steel 0.32 mm thick, 4000 mm long (TCVN 7470); main runner ≤ 400 mm from wall then 800 mm spacing; cross runners at 406 mm; hangers at 800 mm'
const GY = 'https://vinhtuong.com/sites/default/files/2020-04/%5BFINAL%5D%20DATASHEET%20VINHTUONG-GYPROC%20PLASTERBOARD.pdf'
const FR = 'https://www.saint-gobain.com.vn/index.php/system/files/files/documents/BROCHURE_KHUNG%20TRAN%20CHIM%20C600_Project_C600.pdf'
const AC = 'https://ancuong.com/melamine-panel/melamine-faced-mdf-mel-mdf.html'
const AC_MFC = 'https://ancuong.com/melamine/303000298.html'
const AC_LK = 'https://ancuong.com/laminate/303000375.html'
const SK_EP = 'https://vnm.sika.com/dms/getdocument.get/9a66d997-537f-45c6-94af-b4a3cd629661/sikafloor-263-sldecor.pdf'
const SK_LD = 'https://usa.sika.com/content/dam/dms/us01/p/sikafloor_-956_ld.pdf'
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

  // ───── Vách ốp gỗ công nghiệp (phôi + bề mặt) ─────
  {
    key: 'clad-mdf-mel', title: 'Vách ốp: phôi MDF + bề mặt melamine', groups: ['EWD'], brand: 'An Cường', head: ['Cấu tạo vách ốp – thông số chuẩn:', 'Wall cladding build-up – standard specification:'], match: /ốp|vách|tường|panel/i,
    src: 'Trang sản phẩm Mel-MDF An Cường (độ dày/tỷ trọng: xem file SPEC của hãng)', src_url: AC,
    composition: 'Ván MDF phủ melamine An Cường ốp lên khung xương/tường',
    vn: ['Phôi: MDF tiêu chuẩn phủ melamine hai mặt (Mel-MDF An Cường), bề mặt phẳng mịn, nhiều màu/vân', 'Khổ tấm thông dụng 1220×2440 mm (có 1220×3050, 1830×2440 tùy mã); độ dày chọn theo thiết kế (thông dụng 17–18 mm)', 'Phát thải formaldehyde tối thiểu E1 (SGS / ISO 12460-1); loại MDF tiêu chuẩn – KHÔNG chống ẩm, chỉ dùng nơi khô ráo', 'Lắp: bắt vít vào khung xương gỗ/thép hoặc dán keo lên tường đã xử lý phẳng; dán nẹp PVC/ABV cùng màu cạnh hở'],
    en: ['Core: standard MDF faced with melamine both sides (An Cuong Mel-MDF), smooth surface, many colours/patterns', 'Common sheet size 1220×2440 mm (1220×3050, 1830×2440 per code); thickness per design (typically 17–18 mm)', 'Formaldehyde emission minimum E1 (SGS / ISO 12460-1); standard MDF – NOT moisture-resistant, dry areas only', 'Fixing: screwed to timber/steel framing or bonded to a levelled wall; edges sealed with matching PVC/ABS edge banding'],
  },
  {
    key: 'clad-mfc-mel', title: 'Vách ốp: phôi ván dăm (MFC) phủ melamine', groups: ['EWD'], brand: 'An Cường', head: ['Cấu tạo vách ốp – thông số chuẩn:', 'Wall cladding build-up – standard specification:'], match: /ốp|vách|tường|panel/i,
    src: 'Trang sản phẩm MFC An Cường (MS 104 SH)', src_url: AC_MFC,
    composition: 'Ván dăm (MFC) phủ melamine An Cường',
    vn: ['Phôi: ván dăm phủ melamine (MFC An Cường), nhiều màu/vân', 'Khổ 1220×2440 mm, độ dày 9 / 12 / 15 / 18 / 25 mm (1830×2440 mm có ở 12 / 18 / 25 mm; tùy mã)', 'Phát thải formaldehyde tối thiểu E1 (SGS / ISO 12460-1)', 'Có loại MFC chống ẩm cho khu vực ẩm; dán nẹp cạnh cùng màu'],
    en: ['Core: melamine-faced particleboard (An Cuong MFC), many colours/patterns', 'Size 1220×2440 mm; thickness 9 / 12 / 15 / 18 / 25 mm (1830×2440 mm in 12 / 18 / 25 mm; per code)', 'Formaldehyde emission minimum E1 (SGS / ISO 12460-1)', 'Moisture-resistant MFC available for humid areas; matching edge banding'],
  },
  {
    key: 'clad-hpl', title: 'Vách ốp: bề mặt laminate HPL dán trên phôi MDF/ván ép', groups: ['EWD'], brand: 'An Cường (Laminate Kingdom)', head: ['Cấu tạo vách ốp – thông số chuẩn:', 'Wall cladding build-up – standard specification:'], match: /ốp|vách|tường|panel/i,
    src: 'Trang sản phẩm Laminate Kingdom An Cường (LK 062 A)', src_url: AC_LK,
    composition: 'Laminate HPL An Cường dán lên phôi MDF/ván ép',
    vn: ['Bề mặt: laminate HPL (Laminate Kingdom An Cường), chịu nhiệt, chống trầy xước, kháng hóa chất', 'Khổ 1220×2440 mm; độ dày laminate 0,6 / 0,7 / 0,8 / 1,0 / 1,2 mm (tùy mã)', 'Phôi: MDF (hoặc ván ép) dày 17–18 mm; dán ép nguội/nóng hai mặt để cân bằng chống cong vênh', 'Phôi chống ẩm (HMR/ván ép) cho khu vực ẩm; dán nẹp cạnh cùng màu'],
    en: ['Face: HPL laminate (An Cuong Laminate Kingdom), heat-, scratch- and chemical-resistant', 'Size 1220×2440 mm; laminate thickness 0.6 / 0.7 / 0.8 / 1.0 / 1.2 mm (per code)', 'Substrate: MDF (or plywood) 17–18 mm; laminate bonded both faces to balance warping', 'Moisture-resistant core (HMR / plywood) for humid areas; matching edge banding'],
  },
  // ───── Sàn bê tông mài & epoxy ─────
  {
    key: 'floor-polished', title: 'Sàn bê tông mài – tăng cứng bằng lithium silicate', groups: [], brand: 'Sika (Sikafloor-956 LD)', head: ['Sàn bê tông mài – thông số chuẩn:', 'Polished concrete floor – standard specification:'], match: /bê tông mài|mài bóng|đánh bóng.*bê tông|sàn bê tông|polished concrete/i,
    note: 'Chiều dày/cấp bền tấm bê tông do kết cấu quyết định – ghi thêm vào bản vẽ', src: 'Datasheet Sikafloor-956 LD (Sika)', src_url: SK_LD,
    composition: 'Bê tông mài lộ cốt liệu + chất tăng cứng lithium silicate',
    vn: ['Nền: bê tông ≥ 7 ngày tuổi (tốt nhất 28 ngày), sạch, không còn chất bảo dưỡng/sealer/dầu', 'Mài kim cương theo cấp hạt tăng dần đến độ bóng yêu cầu (bước đầu hạt 80–200 trước khi thấm chất tăng cứng)', 'Tăng cứng: Sikafloor-956 LD (lithium silicate gốc nước, hàm lượng rắn 12%, không VOC), định mức 4,9–9,8 m²/L; thấm sâu, không tạo màng; tăng độ cứng, chống bụi, chống mài mòn', 'Khô chạm/đi lại sau ~1 giờ, khô hoàn toàn ~24 giờ (21 °C); chờ 24 giờ trước khi phủ sealer', 'Không tự chống thấm nước/dầu – cần thêm lớp bảo vệ (sealer) nếu khu vực dễ bẩn'],
    en: ['Substrate: concrete ≥ 7 days old (28 days preferred), clean, free of curing compound / sealer / oil', 'Diamond grinding through progressive grits to the specified gloss (initial grit 80–200 before densifier)', 'Densifier: Sikafloor-956 LD (water-based lithium silicate, 12% solids, zero VOC), coverage 4.9–9.8 m²/L; penetrating, not a coating; increases hardness, dust-proofing and abrasion resistance', 'Touch-dry / foot traffic after ~1 h, fully dry ~24 h (21 °C); wait 24 h before sealer', 'Does not provide water/oil repellency by itself – add a sealer where staining is likely'],
  },
  {
    key: 'floor-epoxy', title: 'Sàn epoxy tự san phẳng trang trí – dày 3 mm', groups: [], brand: 'Sika (Sikafloor-263 SL Décor)', head: ['Sàn epoxy – thông số chuẩn:', 'Epoxy floor – standard specification:'], match: /epoxy|tự san phẳng|tự cân bằng|self.?level/i,
    src: 'Datasheet Sikafloor-263 SL Décor (Sika Việt Nam)', src_url: SK_EP,
    composition: 'Lót Sikafloor-161 HC + epoxy tự san phẳng Sikafloor-263 SL Décor dày 3 mm',
    vn: ['Hệ: lót 1 lớp Sikafloor-161 HC (0,3–0,5 kg/m²) + lớp hoàn thiện Sikafloor-263 SL Décor (epoxy không dung môi, cát thạch anh, hạt màu), dày 3 mm (tối thiểu 2 mm), ≥ 3,5 kg/m²; tùy chọn phủ mờ Sikafloor-304 W', 'Độ cứng Shore D ~76; cường độ nén ≥ 45 MPa; bám dính ≥ 2 MPa; VOC < 60 g/l (thử theo GB/T 22374-2018)', 'Nền bê tông: nén ≥ 25 N/mm², lực kéo bám ≥ 1,5 N/mm², độ ẩm ≤ 4%, độ dốc ≤ 1%', 'Thi công 18–30 °C, độ ẩm ≤ 80%; đi bộ sau ~24 giờ (25 °C), chịu tải đủ ~7 ngày'],
    en: ['System: 1 coat Sikafloor-161 HC primer (0.3–0.5 kg/m²) + Sikafloor-263 SL Décor topcoat (solvent-free epoxy, quartz sand, colour chips), 3 mm thick (min. 2 mm), ≥ 3.5 kg/m²; optional Sikafloor-304 W matt seal', 'Shore D hardness ~76; compressive strength ≥ 45 MPa; adhesion ≥ 2 MPa; VOC < 60 g/l (tested to GB/T 22374-2018)', 'Concrete substrate: compressive ≥ 25 N/mm², pull-off ≥ 1.5 N/mm², moisture ≤ 4%, slope ≤ 1%', 'Application 18–30 °C, RH ≤ 80%; foot traffic after ~24 h (25 °C), full load ~7 days'],
  },
]

const HEAD_VN = 'Hệ trần – thông số chuẩn:', HEAD_EN = 'Ceiling system – standard specification:'
const strip = (t: string, head: string) => {
  const ls = (t ?? '').split('\n'), i = ls.findIndex(l => l.trim() === head)
  if (i < 0) return (t ?? '').trim()
  let j = i + 1; while (j < ls.length && /^\s*[-•]/.test(ls[j])) j++
  return [...ls.slice(0, i), ...ls.slice(j)].join('\n').trim()
}

/** Gợi ý theo nhóm / từ khoá; nhóm sơn mà nói về trần/thạch cao cũng được gợi ý (hoàn thiện sơn trên trần thạch cao) */
export function relevantSpecs(e: Pick<Entry, 'group_code' | 'name_vn' | 'part_vn' | 'material_vn' | 'desc_vn'>): BasicSpec[] {
  const g = (e.group_code ?? '').toUpperCase()
  const txt = `${e.name_vn ?? ''} ${e.part_vn ?? ''} ${e.material_vn ?? ''} ${e.desc_vn ?? ''}`.toLowerCase()
  const ceiling = BASIC_SPECS.filter(s => !s.head)
  const out = BASIC_SPECS.filter(s => s.groups.includes(g) && (!s.match || s.match.test(txt)))
  for (const s of BASIC_SPECS) if (s.head && s.match && !s.groups.length && s.match.test(txt) && !out.includes(s)) out.push(s)
  if (out.length) return out
  if (/trần|thạch cao|vách/.test(txt)) return ceiling.filter(s => s.key !== 'access')
  return []
}

const SZ_VN = /^Kích thước\s*:.*$/im, SZ_EN = /^Size\s*:.*$/im
/** Ghi thông số chuẩn vào mục: thêm khối thông số dưới phần mô tả hiện có (áp lại thì thay khối cũ cùng tiêu đề), điền ô Cấu tạo */
export async function applyBasicSpec(e: Entry, s: BasicSpec) {
  const [hv, he] = s.head ?? [HEAD_VN, HEAD_EN]
  const block = (head: string, ls: string[]) => head + '\n' + ls.map(l => '- ' + l).join('\n')
  const join = (a: string, b: string) => (a ? a + '\n' : '') + b
  // thông số cũ đã bị đánh dấu sai (đổi loại vật liệu) → bỏ hết, chỉ giữ dòng kích thước
  const base = (t: string | null, re: RegExp) => e.spec_stale ? ((t ?? '').match(re)?.[0] ?? '') : strip(t ?? '', e.spec_stale ? '' : (re === SZ_VN ? hv : he))
  return saveEntry(e, {
    desc_vn: join(base(e.desc_vn, SZ_VN), block(hv, s.vn)),
    desc_en: join(base(e.desc_en, SZ_EN), block(he, s.en)),
    composition: s.composition,
    spec_stale: null,
  })
}

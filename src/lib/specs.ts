// Viết thông số kỹ thuật, tính chất theo không gian và tiêu chuẩn tham chiếu – KHÔNG dùng AI.
// Dựa trên: nhóm mã + mô tả vật liệu AI đã nhận ra + loại phòng. Người dùng sửa lại được.
import { groupOf } from './codes'
import type { Entry, Room } from './types'

const T: Record<string, [string, string]> = {
  CT: ['Lát/ốp bằng keo dán gạch gốc xi măng cải tiến; ron 2–3mm, keo chà ron màu tiệm cận màu gạch.', 'Fixed with polymer-modified cementitious adhesive; 2–3mm joints, colour-matched grout.'],
  ST: ['Đá dày 18–20mm, mài/ vát cạnh, phủ chống thấm (sealer) 2 lớp.', 'Stone 18–20mm thick, eased/chamfered edges, 2 coats penetrating sealer.'],
  ES: ['Dày 12–20mm, cạnh vê, khoét lỗ theo thiết bị, phủ chống ố.', '12–20mm thick, eased edge, cut-outs to suit fittings, stain-proof finish.'],
  LVT: ['Tổng dày ≥ 4mm, lớp chịu mài mòn ≥ 0,3mm; lắp hèm khóa hoặc dán keo chuyên dụng trên nền phẳng.', 'Overall ≥ 4mm, wear layer ≥ 0.3mm; click or glue-down on levelled screed.'],
  CPT: ['Thảm tấm 500x500mm sợi nylon, đế chống tĩnh điện, dán keo cố định.', '500x500mm nylon carpet tile, antistatic backing, tackifier fixed.'],
  BS: ['Len cao 80–100mm, cùng vật liệu/ màu sàn hoặc theo chỉ định; mối nối và góc gia công kín.', '80–100mm high skirting, to match floor or as specified; mitred corners, tight joints.'],
  PT: ['Hệ sơn: bả 2 lớp, 1 lớp lót kháng kiềm, 2 lớp phủ hoàn thiện.', 'System: 2 skim coats, 1 alkali-resistant primer, 2 finish coats.'],
  SP: ['Hệ sơn đặc biệt: 1 lớp lót, 2 lớp phủ theo hướng dẫn hãng.', 'Special coating: 1 primer + 2 finish coats per manufacturer.'],
  WC: ['Giấy/ vải dán tường dán giáp mí bằng keo chuyên dụng trên nền đã bả phẳng, lót chống kiềm.', 'Butt-jointed with recommended adhesive on skimmed, primed substrate.'],
  WP: ['Tấm ốp trên hệ khung xương/ keo chuyên dụng; ron, nẹp góc theo thiết kế.', 'Panels on concealed framing/adhesive; joints and trims as detailed.'],
  GWB: ['Khung xương chìm mạ kẽm (xương chính a ≤ 1200, xương phụ a ≤ 406), tấm thạch cao dày 9–12mm, xử lý mối nối băng keo lưới, bả 2 lớp, sơn 1 lót 2 phủ.', 'Galvanised concealed grid (main ≤ 1200 c/c, furring ≤ 406 c/c), 9–12mm gypsum board, taped joints, 2 skim coats, 1 primer + 2 finish coats.'],
  ACT: ['Tấm tiêu âm 600x600 trên khung nổi/ chìm sơn tĩnh điện, NRC ≥ 0,6.', '600x600 acoustic tiles on exposed/concealed grid, NRC ≥ 0.6.'],
  WD: ['Gỗ tự nhiên/ veneer, sơn PU hoặc lau dầu, độ bóng theo mẫu duyệt.', 'Solid timber/veneer, PU lacquer or oil finish, sheen to approved sample.'],
  LM: ['Cốt MDF/ MFC dày 17–18mm phủ melamine/ laminate; nẹp chỉ PVC đồng màu dán máy; phát thải E1 trở lên.', '17–18mm MDF/MFC core faced with melamine/laminate; machine-applied matching PVC edge-band; E1 emission or better.'],
  MT: ['Inox 304 dày ≥ 1,0mm hoặc thép sơn tĩnh điện màng ≥ 60µm; mối hàn mài phẳng.', 'SS304 ≥ 1.0mm or powder-coated steel ≥ 60µm DFT; welds ground flush.'],
  GL: ['Kính cường lực/ kính dán an toàn, mài cạnh; dán decal nhận diện nếu là vách.', 'Toughened/laminated safety glass, polished edges; manifestation on glazed screens.'],
  MR: ['Gương bạc dày 5mm, mài cạnh, dán băng an toàn mặt sau.', '5mm silvered mirror, polished edges, safety backing film.'],
  FB: ['Vải bọc khổ ~1,4m; mẫu vải duyệt trước khi sản xuất.', 'Upholstery fabric ~1.4m wide; sample approval before production.'],
  LE: ['Da/ giả da bọc trên mút D40; mẫu duyệt trước khi sản xuất.', 'Leather/faux leather over D40 foam; sample approval required.'],
  DR: ['Khung bao, cánh, nẹp chỉ hoàn thiện đồng bộ; gioăng giảm chấn; phụ kiện theo mã HW.', 'Frame, leaf and architraves finished to match; acoustic seals; hardware per HW code.'],
  HW: ['Bộ phụ kiện: bản lề, khóa/ tay gạt, tay co thủy lực (nếu có), chặn cửa – inox 304 xước.', 'Set: hinges, lock/lever, closer (where required), door stop – satin SS304.'],
  JN: ['Gia công theo bản vẽ chi tiết; vật liệu từng bộ phận theo mã cấu tạo.', 'Fabricated to shop drawings; component materials per composition codes.'],
  FH: ['Phụ kiện đồng bộ (bản lề giảm chấn, ray, tay nắm...) – Hafele/ Blum hoặc tương đương.', 'Soft-close hinges, runners, handles – Hafele/Blum or equivalent.'],
  FF: ['Kích thước theo bản vẽ bố trí; mẫu duyệt trước khi sản xuất/ đặt hàng.', 'Dimensions per layout; sample/prototype approval before order.'],
  LT: ['Đèn LED, CRI ≥ 80, nhiệt độ màu theo thiết kế chiếu sáng; driver đồng bộ.', 'LED, CRI ≥ 80, CCT per lighting design; matching driver.'],
  SF: ['Kèm bộ xả, van, phụ kiện lắp đặt đồng bộ của hãng.', 'Complete with waste, valves and manufacturer fixing kit.'],
  BA: ['Inox 304 hoàn thiện xước mờ, lắp vít nở inox.', 'Satin SS304, fixed with stainless anchors.'],
  EQ: ['Nguồn 220V/50Hz; vị trí ổ cắm/ cấp nước phối hợp MEP.', '220V/50Hz; power/water points coordinated with MEP.'],
  AW: ['Kích thước, nội dung theo duyệt; vật liệu in chống cháy, khung/ treo theo chỉ định.', 'Size and artwork per approval; fire-rated media; framing/hanging as specified.'],
  DC: ['Theo mẫu duyệt.', 'Per approved sample.'],
  WT: ['Rèm cuốn/ rèm vải theo kích thước ô cửa; ray, điều khiển đồng bộ.', 'Roller/fabric blinds sized to opening; matching track and controls.'],
  SN: ['Kích thước, nội dung, vật liệu theo hệ thống biển báo dự án.', 'Size, content and material per project signage standard.'],
  ME: ['Chỉ quy định màu/ hoàn thiện mặt nạ và vị trí phối hợp; cung cấp thuộc gói MEP.', 'Finish/colour and coordination only; supply by MEP package.'],
}

const WET = ['locker_wc', 'pantry', 'clinic']
const FNB = ['dining', 'pantry']
const PUBLIC = ['dining', 'lounge_training', 'meeting', 'corridor', 'office']

/** Tính chất yêu cầu theo không gian (VN, EN) */
export function perfFor(e: Pick<Entry, 'group_code' | 'category'>, roomTypes: string[]): [string, string] {
  const vn: string[] = [], en: string[] = []
  const add = (a: string, b: string) => { if (!vn.includes(a)) { vn.push(a); en.push(b) } }
  const wet = roomTypes.some(t => WET.includes(t)), fnb = roomTypes.some(t => FNB.includes(t)), pub = roomTypes.some(t => PUBLIC.includes(t))
  const g = e.group_code, c = e.category
  if (c === 'floor' || g === 'CT' && c !== 'wall' && c !== 'feature_wall') {
    if (wet) add('Chống trượt R10–R11 (DIN 51130) hoặc DCOF ướt ≥ 0,42; độ hút nước ≤ 0,5%', 'Slip R10–R11 (DIN 51130) or wet DCOF ≥ 0.42; absorption ≤ 0.5%')
    else if (fnb) add('Chống trượt R10 / DCOF ướt ≥ 0,42; kháng dầu mỡ, dễ vệ sinh', 'Slip R10 / wet DCOF ≥ 0.42; grease-resistant, cleanable')
    else add('Chịu mài mòn, dễ vệ sinh', 'Wear-resistant, easy to clean')
  }
  if ((c === 'wall' || c === 'feature_wall') && g === 'CT') add('Chống thấm, dễ lau chùi, kháng hóa chất tẩy rửa', 'Water-resistant, cleanable, chemical-resistant')
  if (g === 'PT') add(wet ? 'Sơn chống nấm mốc, lau chùi được' : 'Lau chùi được, hàm lượng VOC thấp', wet ? 'Anti-mould, washable' : 'Washable, low VOC')
  if (g === 'GWB' && wet) add('Tấm thạch cao chống ẩm; sơn chống nấm mốc', 'Moisture-resistant board; anti-mould paint')
  if (['LM', 'WD', 'JN'].includes(g)) { add('Phát thải formaldehyde E1 trở lên', 'Formaldehyde emission E1 or better'); if (wet) add('Cốt chống ẩm (HMR); chân tủ cách sàn ≥ 150mm', 'Moisture-resistant (HMR) core; ≥150mm floor clearance') }
  if (g === 'LT') { if (wet) add('Cấp bảo vệ IP44 trở lên (gần nước IP65)', 'IP44 minimum (IP65 near water)'); if (roomTypes.some(t => ['office', 'meeting', 'lounge_training'].includes(t))) add('Độ rọi 300–500 lux, UGR ≤ 19, CRI ≥ 80', '300–500 lux, UGR ≤ 19, CRI ≥ 80') }
  if ((g === 'FB' || g === 'LE') && pub) add('Vải contract: ≥ 30.000 double rubs (Wyzenbeek), bền màu ≥ 4, chống cháy', 'Contract grade: ≥ 30,000 double rubs, colourfastness ≥ 4, flame-retardant')
  if (g === 'FF' && pub) add('Đồ dùng khu công cộng: kết cấu chắc chắn, bề mặt dễ vệ sinh', 'Contract-grade construction, cleanable surfaces')
  if (g === 'GL') add('Kính an toàn (cường lực/ dán)', 'Safety glass (toughened/laminated)')
  if (['WC', 'WP', 'CPT', 'LVT'].includes(g) && roomTypes.includes('corridor')) add('Nhóm cháy vật liệu theo QCVN 06:2022/BXD', 'Reaction to fire per QCVN 06:2022/BXD')
  if (g === 'MT' && (wet || fnb)) add('Inox 304 chống gỉ khu ẩm', 'SS304 in wet/F&B areas')
  if (g === 'SF') add('Tiết kiệm nước (vòi ≤ 6 l/phút)', 'Water-efficient (taps ≤ 6 L/min)')
  return [vn.join('; '), en.join('; ')]
}

/** Mô tả & thông số (VN, EN) */
export function descFor(e: Pick<Entry, 'group_code' | 'name_vn' | 'name_en' | 'material_vn' | 'material_en' | 'composition'>): [string, string] {
  const [tv, te] = T[e.group_code] ?? ['', '']
  const vn = [e.material_vn ? `${e.material_vn.replace(/\.$/, '')}.` : `${e.name_vn}.`, tv, e.composition ? `Cấu tạo: ${e.composition}.` : ''].filter(Boolean).join(' ')
  const en = [e.material_en ? `${e.material_en.replace(/\.$/, '')}.` : e.name_en ? `${e.name_en}.` : '', te, e.composition ? `Composition: ${e.composition}.` : ''].filter(Boolean).join(' ')
  return [vn, en]
}

export function standardsFor(group: string): string {
  const g = groupOf(group)
  if (!g) return ''
  return [g.std_vn, g.std_intl].filter(s => s && s !== '—').join('; ').replace(/ – kiểm tra bản hiện hành/g, '')
}

export function specPatch(e: Entry, rooms: Room[]) {
  const [desc_vn, desc_en] = descFor(e)
  const [perf_vn, perf_en] = perfFor(e, rooms.map(r => r.room_type))
  return { desc_vn, desc_en, perf_vn, perf_en, standards: standardsFor(e.group_code), enriched: true }
}

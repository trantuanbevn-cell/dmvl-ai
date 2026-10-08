// Chuẩn trình bày danh mục theo mẫu công ty (đối chiếu 11 file DMVL: Capital SQ, Villa Đà Nẵng, Waldorf BOH, Intimex, Thủy Tạ…):
// nhóm theo vật liệu; bề mặt chính (sàn – tường – trần) lên đầu, rồi vật liệu/cấu kiện khác, nội thất & thiết bị, trang trí & artwork.
import { GROUPS } from './codes'
import type { Entry } from './types'

export type Lang = 'vn' | 'en' | 'both'
export type Section = { key: string; vn: string; en: string; band: string; groups: string[] }
export const BANDS: Record<string, { vn: string; en: string }> = {
  A: { vn: 'A. HOÀN THIỆN CHÍNH – SÀN · TƯỜNG · TRẦN', en: 'A. MAIN FINISHES – FLOOR · WALL · CEILING' },
  B: { vn: 'B. VẬT LIỆU & CẤU KIỆN KHÁC', en: 'B. OTHER MATERIALS & ARCHITECTURAL ELEMENTS' },
  C: { vn: 'C. NỘI THẤT & THIẾT BỊ', en: 'C. FURNITURE & EQUIPMENT' },
  D: { vn: 'D. TRANG TRÍ & ARTWORK', en: 'D. DECOR & ARTWORK' },
}
export const SECTIONS: Section[] = [
  { key: 'tile', vn: 'GẠCH', en: 'TILE', band: 'A', groups: ['CT'] },
  { key: 'stone', vn: 'ĐÁ', en: 'STONE', band: 'A', groups: ['ST', 'ES'] },
  { key: 'floor', vn: 'SÀN GỖ – SÀN NHỰA', en: 'WOOD & RESILIENT FLOORING', band: 'A', groups: ['LVT'] },
  { key: 'carpet', vn: 'THẢM SÀN', en: 'CARPET', band: 'A', groups: ['CPT'] },
  { key: 'paint', vn: 'SƠN NƯỚC', en: 'PAINT', band: 'A', groups: ['PT', 'SP'] },
  { key: 'wallcov', vn: 'GIẤY DÁN TƯỜNG', en: 'WALLCOVERING', band: 'A', groups: ['WC'] },
  { key: 'panel', vn: 'ỐP TƯỜNG (GỖ, LAM, TIÊU ÂM)', en: 'WALL PANELLING', band: 'A', groups: ['WP'] },
  { key: 'ceiling', vn: 'TRẦN THẠCH CAO & TRẦN ĐẶC BIỆT', en: 'GYPSUM & SPECIALTY CEILING', band: 'A', groups: ['GWB', 'ACT'] },
  { key: 'skirting', vn: 'LEN CHÂN TƯỜNG – PHÀO CHỈ', en: 'SKIRTING & MOULDING', band: 'A', groups: ['BS'] },
  { key: 'wood', vn: 'GỖ – MELAMINE – LAMINATE', en: 'WOOD & LAMINATE', band: 'B', groups: ['WD', 'LM'] },
  { key: 'metal', vn: 'KIM LOẠI', en: 'METAL', band: 'B', groups: ['MT'] },
  { key: 'glass', vn: 'KÍNH', en: 'GLASS', band: 'B', groups: ['GL'] },
  { key: 'mirror', vn: 'GƯƠNG', en: 'MIRROR', band: 'B', groups: ['MR'] },
  { key: 'door', vn: 'CỬA & PHỤ KIỆN CỬA', en: 'DOORS & HARDWARE', band: 'B', groups: ['DR', 'HW'] },
  { key: 'curtain', vn: 'RÈM – MÀN', en: 'WINDOW TREATMENTS', band: 'B', groups: ['WT'] },
  { key: 'fabric', vn: 'VẢI – DA', en: 'FABRIC & LEATHER', band: 'B', groups: ['FB', 'LE'] },
  { key: 'joinery', vn: 'NỘI THẤT LIỀN TƯỜNG', en: 'BUILT-IN JOINERY', band: 'C', groups: ['JN', 'FH'] },
  { key: 'loose', vn: 'NỘI THẤT RỜI', en: 'LOOSE FURNITURE', band: 'C', groups: ['FF'] },
  { key: 'sanitary', vn: 'THIẾT BỊ VỆ SINH', en: 'SANITARY FIXTURES & FITTINGS', band: 'C', groups: ['SF', 'BA'] },
  { key: 'equipment', vn: 'THIẾT BỊ', en: 'EQUIPMENT & APPLIANCES', band: 'C', groups: ['EQ'] },
  { key: 'lighting', vn: 'THIẾT BỊ ĐÈN', en: 'LIGHTING', band: 'C', groups: ['LT'] },
  { key: 'decor', vn: 'DECOR – CÂY – PHỤ KIỆN TRANG TRÍ', en: 'DECORATIVE ACCESSORIES', band: 'D', groups: ['DC'] },
  { key: 'art', vn: 'TRANH – ARTWORK', en: 'ARTWORK', band: 'D', groups: ['AW'] },
  { key: 'sign', vn: 'BIỂN BÁO', en: 'SIGNAGE', band: 'D', groups: ['SN'] },
  { key: 'mep', vn: 'ĐẦU CHỜ MEP PHỐI HỢP', en: 'MEP INTERFACE', band: 'D', groups: ['ME'] },
]

export function sectionOf(e: Pick<Entry, 'group_code' | 'category'>): Section {
  if ((e.group_code === 'WD' || e.group_code === 'LM') && e.category === 'floor') return SECTIONS.find(s => s.key === 'floor')!
  return SECTIONS.find(s => s.groups.includes(e.group_code)) ?? SECTIONS[SECTIONS.length - 1]
}
export const sectionTitle = (s: Section, lang: Lang) => (lang === 'vn' ? s.vn : lang === 'en' ? s.en : `${s.vn} / ${s.en}`)
export const bandTitle = (b: string, lang: Lang) => (lang === 'vn' ? BANDS[b].vn : lang === 'en' ? BANDS[b].en : `${BANDS[b].vn} / ${BANDS[b].en}`)

/** Nhóm các mã theo mục chuẩn, đúng thứ tự công ty; mã sắp theo ký hiệu */
export function groupBySection<T extends Entry>(entries: T[]): { section: Section; items: T[] }[] {
  const out = SECTIONS.map(section => ({ section, items: [] as T[] }))
  for (const e of entries) out.find(x => x.section.key === sectionOf(e).key)!.items.push(e)
  const gi = (c: string) => GROUPS.findIndex(g => g.code === c)
  for (const x of out) x.items.sort((a, b) => gi(a.group_code) - gi(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  return out.filter(x => x.items.length)
}

// ---- Ký hiệu song ngữ: EN = mã quốc tế (CT-01…), VN = mã truyền thống của công ty (SG1, DA1, TH1, TS1, FU1…)
const LEGACY_FIX: Record<string, string> = { 'TS-a': 'TS', LEN: 'LE', '—': '' }
export const legacyPrefix = (group: string) => { const g = GROUPS.find(x => x.code === group); const l = LEGACY_FIX[g?.legacy ?? ''] ?? g?.legacy ?? group; return l || group }
/** Đánh số mã VN liên tục theo tiền tố (SG1, SG2… kể cả khi CT và LVT cùng dùng "SG") */
export function legacyCodes(entries: Entry[]): Map<string, string> {
  const gi = (c: string) => GROUPS.findIndex(g => g.code === c)
  const sorted = [...entries].sort((a, b) => gi(a.group_code) - gi(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  const n = new Map<string, number>(), out = new Map<string, string>()
  for (const e of sorted) { const p = legacyPrefix(e.group_code); const k = (n.get(p) ?? 0) + 1; n.set(p, k); out.set(e.id, `${p}${k}`) }
  return out
}
export function symbolOf(e: Entry, lang: Lang, legacy: Map<string, string>): string {
  const lg = legacy.get(e.id) ?? e.code
  return lang === 'vn' ? lg : lang === 'en' ? e.code : (lg === e.code ? e.code : `${e.code} / ${lg}`)
}
/** Chữ theo ngôn ngữ: vn / en (rơi về vn nếu chưa có en) / both = 2 dòng */
export function tx(vn: string | null | undefined, en: string | null | undefined, lang: Lang): string {
  const a = (vn ?? '').trim(), b = (en ?? '').trim()
  if (lang === 'vn') return a
  if (lang === 'en') return b || a
  return b && b !== a ? (a ? `${a}\n${b}` : b) : a
}

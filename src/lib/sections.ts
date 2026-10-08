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
  entries = entries.filter(e => e.status !== 'rejected')
  const gi = (c: string) => GROUPS.findIndex(g => g.code === c)
  const sorted = [...entries].sort((a, b) => gi(a.group_code) - gi(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  const n = new Map<string, number>(), out = new Map<string, string>()
  for (const e of sorted) { const p = legacyPrefix(e.group_code); const k = (n.get(p) ?? 0) + 1; n.set(p, k); out.set(e.id, `${p}${k}`) }
  return out
}
export function symbolOf(e: Entry, lang: Lang, legacy: Map<string, string>, en?: Map<string, string>): string {
  const lg = legacy.get(e.id) ?? e.code, ec = en?.get(e.id) ?? e.code
  return lang === 'vn' ? lg : lang === 'en' ? ec : (lg === ec ? ec : `${ec} / ${lg}`)
}
/** Ký hiệu dùng khi xuất: tính trên đúng danh sách được xuất, có thể đánh lại số liên tục (bỏ khoảng trống do mã bị loại) */
export function exportSymbols(list: Entry[], renumber: boolean) {
  const legacy = legacyCodes(list)
  const en = new Map<string, string>()
  if (renumber) {
    const gi = (c: string) => GROUPS.findIndex(g => g.code === c)
    const n = new Map<string, number>()
    for (const e of [...list].sort((a, b) => gi(a.group_code) - gi(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))) {
      const k = (n.get(e.group_code) ?? 0) + 1; n.set(e.group_code, k); en.set(e.id, `${e.group_code}-${String(k).padStart(2, '0')}`)
    }
  } else for (const e of list) en.set(e.id, e.code)
  return { legacy, en }
}

// ---- Kế hoạch xuất: gộp tất cả vào 1 sheet hay tách từng mục ra sheet riêng
export type SheetTarget = 'main' | 'own' | 'c1' | 'c2'
export type ExportOpts = {
  lang: Lang; includePending: boolean; renumber: boolean; roomSheet: boolean; quote: boolean
  assign: Record<string, SheetTarget>; names: { main: string; c1: string; c2: string }
}
export const defaultOpts = (): ExportOpts => ({ lang: 'both', includePending: false, renumber: true, roomSheet: true, quote: false, assign: {}, names: { main: 'DMVL', c1: 'Nội thất', c2: 'Thiết bị' } })
export const PRESETS: { key: string; label: string; make: () => Record<string, SheetTarget> }[] = [
  { key: 'one', label: 'Gộp tất cả vào 1 sheet', make: () => ({}) },
  { key: 'loose', label: 'Tách riêng đồ rời', make: () => ({ loose: 'own' }) },
  { key: 'furn', label: 'Tách nội thất (liền tường + rời) ra 1 sheet', make: () => ({ joinery: 'c1', loose: 'c1' }) },
  { key: 'bands', label: 'Hoàn thiện (A+B) | Nội thất & thiết bị (C) | Decor & art (D)', make: () => Object.fromEntries(SECTIONS.map(s => [s.key, s.band === 'D' ? 'c2' : s.band === 'C' ? 'c1' : 'main'])) as Record<string, SheetTarget> },
  { key: 'all', label: 'Mỗi mục vật liệu 1 sheet riêng', make: () => Object.fromEntries(SECTIONS.map(s => [s.key, 'own'])) as Record<string, SheetTarget> },
]
const safeName = (s: string) => s.replace(/[\\/*?:\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'
export function planSheets<T extends Entry>(groups: { section: Section; items: T[] }[], o: ExportOpts): { name: string; groups: { section: Section; items: T[] }[] }[] {
  const vn = o.lang !== 'en'
  const cap = (t: string) => t.toLowerCase().replace(/(^|[\s–-])\S/g, c => c.toUpperCase())
  const out: { name: string; groups: { section: Section; items: T[] }[] }[] = []
  const pick = (t: SheetTarget) => groups.filter(g => (o.assign[g.section.key] ?? 'main') === t)
  const push = (name: string, gs: typeof groups) => { if (gs.length) out.push({ name, groups: gs }) }
  push(o.names.main || 'DMVL', pick('main')); push(o.names.c1 || 'Sheet 2', pick('c1')); push(o.names.c2 || 'Sheet 3', pick('c2'))
  for (const g of pick('own')) out.push({ name: cap(vn ? g.section.vn : g.section.en), groups: [g] })
  const seen = new Set<string>()
  return out.map(x => { let n = safeName(x.name), i = 2; while (seen.has(n.toLowerCase())) n = safeName(x.name).slice(0, 28) + ' ' + i++; seen.add(n.toLowerCase()); return { ...x, name: n } })
}
/** Chữ theo ngôn ngữ: vn / en (rơi về vn nếu chưa có en) / both = 2 dòng */
export function tx(vn: string | null | undefined, en: string | null | undefined, lang: Lang): string {
  const a = (vn ?? '').trim(), b = (en ?? '').trim()
  if (lang === 'vn') return a
  if (lang === 'en') return b || a
  return b && b !== a ? (a ? `${a}\n${b}` : b) : a
}

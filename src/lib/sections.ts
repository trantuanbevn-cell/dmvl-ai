// Chuẩn trình bày danh mục theo mẫu công ty (đối chiếu 11 file DMVL: Capital SQ, Villa Đà Nẵng, Waldorf BOH, Intimex, Thủy Tạ…):
// nhóm theo vật liệu; bề mặt chính (sàn – tường – trần) lên đầu, rồi vật liệu/cấu kiện khác, nội thất & thiết bị, trang trí & artwork.
import { GROUPS, type Group } from './codes'
import type { Entry } from './types'

export type Lang = 'vn' | 'en' | 'both'
export type Section = { key: string; vn: string; en: string; band: string; groups: string[]; custom?: boolean }
export type CustomSection = { key: string; vn: string; en: string; band: string; group: string }
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

// Nhóm vật liệu do người dùng tạo thêm (lưu theo dự án: projects.custom_sections), xếp cuối nhóm lớn mà nó thuộc về
let CUSTOM: Section[] = []
let CACHE: Section[] | null = null
export const setCustomSections = (c: CustomSection[] | null | undefined) => { CUSTOM = (c ?? []).map(x => ({ key: x.key, vn: x.vn, en: x.en, band: x.band, groups: [x.group], custom: true })); CACHE = null }

/** Danh sách nhóm mã (tiền tố) = nhóm chuẩn + tiền tố do người dùng tự tạo cho nhóm vật liệu riêng của dự án */
export const customGroups = (): Group[] => {
  const seen = new Set(GROUPS.map(g => g.code)), out: Group[] = []
  for (const c of CUSTOM) { const code = c.groups[0]; if (seen.has(code)) continue; seen.add(code); out.push({ code, vn: c.vn.charAt(0) + c.vn.slice(1).toLowerCase(), en: c.en.charAt(0) + c.en.slice(1).toLowerCase(), legacy: code, csi: '', attrs_vn: '', attrs_en: '', std_vn: '', std_intl: '' }) }
  return out
}
export const allGroups = (): Group[] => [...GROUPS, ...customGroups()]
/** Tiền tố mới hợp lệ: 2–5 chữ cái in hoa, chưa trùng nhóm/ký hiệu nào có sẵn */
export const newPrefixError = (code: string, ownKey?: string): string => {
  if (!/^[A-Z]{2,5}$/.test(code)) return 'Tiền tố gồm 2–5 chữ cái in hoa (A–Z), vd: EPX'
  if (GROUPS.some(g => g.code === code) || PREFIXES.some(p => p.prefix === code)) return `“${code}” đã là tiền tố có sẵn – hãy chọn trong danh sách`
  if (CUSTOM.some(c => c.groups[0] === code && c.key !== ownKey)) return `“${code}” đang được nhóm khác dùng`
  return ''
}

// Bố cục QUẢN LÝ nhóm (lưu theo dự án: projects.section_layout): nhóm lớn tự tạo/gộp/tách, thứ tự nhóm lớn, mục nào thuộc nhóm lớn nào và thứ tự các mục.
// Chỉ đổi cách sắp xếp/trình bày – không đụng tới nội dung vật liệu.
export type SectionLayout = { bandOrder?: string[]; customBands?: { key: string; vn: string; en: string }[]; assign?: Record<string, string>; order?: string[]; merge?: Record<string, string> }
let LAYOUT: SectionLayout = {}
export const setSectionLayout = (l: SectionLayout | null | undefined) => { LAYOUT = l ?? {}; CACHE = null }
export const getSectionLayout = (): SectionLayout => LAYOUT
export const bandKeys = (): string[] => {
  const base = Object.keys(BANDS), custom = (LAYOUT.customBands ?? []).map(b => b.key)
  if (!LAYOUT.bandOrder) return [...base, ...custom]
  const out = LAYOUT.bandOrder.filter(k => base.includes(k) || custom.includes(k))
  return out.length ? out : [...base, ...custom]
}
export const bandInfo = (k: string): { vn: string; en: string } => BANDS[k] ?? LAYOUT.customBands?.find(b => b.key === k) ?? { vn: k, en: k }
const fullSections = (): Section[] => {
  if (CACHE) return CACHE
  const base = [...SECTIONS]
  for (const c of CUSTOM) { let at = -1; base.forEach((x, i) => { if (x.band === c.band) at = i }); base.splice(at + 1, 0, c) }
  const keys = bandKeys(), ord = new Map((LAYOUT.order ?? []).map((k, i) => [k, i]))
  const ok = (b?: string) => !!b && keys.includes(b)
  const list = base.map((x, i) => ({ s: { ...x, band: ok(LAYOUT.assign?.[x.key]) ? LAYOUT.assign![x.key] : ok(x.band) ? x.band : keys[0] }, i }))
  list.sort((a, b) => keys.indexOf(a.s.band) - keys.indexOf(b.s.band) || (ord.get(a.s.key) ?? 1e6 + a.i) - (ord.get(b.s.key) ?? 1e6 + b.i))
  return (CACHE = list.map(x => x.s))
}
/** Mục nhỏ đã GỘP vào mục khác (chỉ để trình bày/xuất file; mã và nội dung vật liệu không đổi) */
export const mergedInto = (key: string): string | undefined => LAYOUT.merge?.[key]
export const mergedMembers = (target: string): Section[] => fullSections().filter(x => LAYOUT.merge?.[x.key] === target)
let CACHE2: Section[] | null = null, CACHE2_SRC: Section[] | null = null
export const allSections = (): Section[] => { const f = fullSections(); if (CACHE2_SRC !== f) { CACHE2_SRC = f; CACHE2 = f.filter(x => !LAYOUT.merge?.[x.key]) } return CACHE2! }
const resolve = (k: string) => { let c = k, n = 0; while (LAYOUT.merge?.[c] && n++ < 5) c = LAYOUT.merge[c]; return c }
export function sectionOf(e: Pick<Entry, 'group_code' | 'category'> & { section_key?: string | null }): Section {
  const full = fullSections()
  let k: string | undefined
  if (e.section_key && full.some(x => x.key === e.section_key && x.custom)) k = e.section_key
  k ??= (e.group_code === 'WD' || e.group_code === 'LM') && e.category === 'floor' ? 'floor' : (SECTIONS.find(s => s.groups.includes(e.group_code)) ?? SECTIONS[SECTIONS.length - 1]).key
  const r = resolve(k)
  return allSections().find(x => x.key === r) ?? full.find(x => x.key === k)!
}
export const getNameOverrides = () => OVR
/** Gộp các mục nhỏ vào mục đích (target) */
export function mergeSections(keys: string[], target: string): SectionLayout {
  const merge = { ...(LAYOUT.merge ?? {}) }
  for (const k of keys) if (k !== target) { merge[k] = target; for (const o of Object.keys(merge)) if (merge[o] === k) merge[o] = target }
  return { ...LAYOUT, merge }
}
/** Tách các mục đã gộp vào target về lại như cũ */
export function unmergeSections(target: string): SectionLayout {
  const merge = { ...(LAYOUT.merge ?? {}) }; for (const o of Object.keys(merge)) if (merge[o] === target) delete merge[o]
  return { ...LAYOUT, merge }
}
// Tên hạng mục do người dùng đổi (lưu theo dự án: projects.section_names) – dùng chung cho bảng, xuất Excel và bản in
export type NameOverrides = Record<string, { vn?: string; en?: string }>
let OVR: NameOverrides = {}
export const setNameOverrides = (o: NameOverrides | null | undefined) => { OVR = o ?? {} }
const pick = (base: { vn: string; en: string }, o: { vn?: string; en?: string } | undefined, lang: Lang) => {
  const vn = o?.vn?.trim() || base.vn, en = o?.en?.trim() || base.en
  return lang === 'vn' ? vn : lang === 'en' ? en : `${vn} / ${en}`
}
export const sectionTitle = (s: Section, lang: Lang) => pick(s, OVR[s.key], lang)
export const sectionName = (s: Section, lang: 'vn' | 'en') => pick(s, OVR[s.key], lang)
/** Tên nhóm lớn; chữ cái đầu (A., B., C…) luôn tự đánh lại theo thứ tự hiện tại nên không bao giờ lệch khi tách/gộp/đổi chỗ */
export const bandTitle = (b: string, lang: Lang) => {
  const idx = Math.max(0, bandKeys().indexOf(b)), L = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx / 26) : '')
  const strip = (t: string) => t.replace(/^[A-Z]\d?\s*[.)]\s*/, '')
  const i = bandInfo(b), o = OVR['band:' + b]
  const vn = L + '. ' + strip(o?.vn?.trim() || i.vn), en = L + '. ' + strip(o?.en?.trim() || i.en)
  return lang === 'vn' ? vn : lang === 'en' ? en : `${vn} / ${en}`
}

// ---- Thao tác quản lý nhóm lớn (trả về bố cục mới; người gọi lưu vào dự án)
const rnd = () => Math.random().toString(36).slice(2, 6)
const seq = () => allSections().map(x => x.key)
const withOrder = (l: SectionLayout, order: string[]): SectionLayout => ({ ...l, order })
/** Chuyển một mục sang nhóm lớn khác; đặt trước mục beforeKey (nếu có) hoặc cuối nhóm lớn đó */
export function moveSection(key: string, toBand: string, beforeKey?: string): SectionLayout {
  const all = allSections(), rest = all.filter(x => x.key !== key)
  let at = rest.length
  if (beforeKey && rest.some(x => x.key === beforeKey)) at = rest.findIndex(x => x.key === beforeKey)
  else { const last = rest.map(x => x.band).lastIndexOf(toBand); at = last >= 0 ? last + 1 : (() => { const keys = bandKeys(), bi = keys.indexOf(toBand); const nxt = rest.findIndex(x => keys.indexOf(x.band) > bi); return nxt < 0 ? rest.length : nxt })() }
  const order = rest.map(x => x.key); order.splice(at, 0, key)
  return { ...withOrder({ ...LAYOUT, bandOrder: bandKeys() }, order), assign: { ...(LAYOUT.assign ?? {}), [key]: toBand } }
}
export function addBand(vn: string, en: string, afterBand?: string): { layout: SectionLayout; key: string } {
  const key = `b_${rnd()}`, keys = bandKeys(), at = afterBand ? keys.indexOf(afterBand) + 1 : keys.length
  const bandOrder = [...keys]; bandOrder.splice(at, 0, key)
  return { key, layout: { ...LAYOUT, order: LAYOUT.order ?? seq(), bandOrder, customBands: [...(LAYOUT.customBands ?? []), { key, vn: vn.toUpperCase(), en: (en || vn).toUpperCase() }] } }
}
export const bandSections = (b: string) => allSections().filter(x => x.band === b)
export function removeBand(b: string): SectionLayout {
  const keys = bandKeys().filter(k => k !== b)
  return { ...LAYOUT, order: LAYOUT.order ?? seq(), bandOrder: keys, customBands: (LAYOUT.customBands ?? []).filter(x => x.key !== b) }
}
/** Gộp nhóm lớn `from` vào `to` (các mục nối vào cuối `to`), rồi bỏ nhóm lớn `from` */
export function mergeBand(from: string, to: string): SectionLayout {
  const moved = bandSections(from).map(x => x.key); let l = { ...LAYOUT }
  const assign = { ...(l.assign ?? {}) }; for (const k of moved) assign[k] = to
  const rest = allSections().filter(x => !moved.includes(x.key)).map(x => x.key)
  const lastTo = allSections().filter(x => !moved.includes(x.key)).map(x => x.band).lastIndexOf(to)
  const order = [...rest]; order.splice(lastTo >= 0 ? lastTo + 1 : order.length, 0, ...moved)
  l = { ...l, assign, order, bandOrder: bandKeys() }
  const keys = bandKeys().filter(k => k !== from)
  return { ...l, bandOrder: keys, customBands: (l.customBands ?? []).filter(x => x.key !== from) }
}
/** Tách các mục đã chọn của nhóm lớn `from` thành một nhóm lớn mới đặt ngay sau nó */
export function splitBand(from: string, keysToMove: string[], vn: string, en: string): { layout: SectionLayout; key: string } {
  const a = addBand(vn, en, from), assign = { ...(a.layout.assign ?? {}) }
  for (const k of keysToMove) assign[k] = a.key
  const all = allSections(), moved = all.filter(x => keysToMove.includes(x.key)).map(x => x.key), rest = all.filter(x => !moved.includes(x.key)).map(x => x.key)
  return { key: a.key, layout: { ...a.layout, assign, order: [...rest, ...moved] } }
}
export function moveBand(b: string, dir: -1 | 1): SectionLayout {
  const keys = bandKeys(), i = keys.indexOf(b), j = i + dir
  if (i < 0 || j < 0 || j >= keys.length) return LAYOUT
  ;[keys[i], keys[j]] = [keys[j], keys[i]]
  return { ...LAYOUT, order: LAYOUT.order ?? seq(), bandOrder: keys }
}


/** Nhóm các mã theo mục chuẩn, đúng thứ tự công ty; mã sắp theo ký hiệu */
export function groupBySection<T extends Entry>(entries: T[]): { section: Section; items: T[] }[] {
  const out = allSections().map(section => ({ section, items: [] as T[] }))
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
/** Bảng tiền tố ký hiệu: MỘT họ vật liệu = MỘT tiền tố (viết tắt tiếng Anh của tên chung); loại con (gỗ tự nhiên, gỗ công nghiệp…) ghi ở tên hạng mục, không đổi tiền tố.
 *  Tham chiếu: danh mục viết tắt bản vẽ nội thất (CT, WD, LAM, CPT, MTL, GL, MIR, MWK, PLUMB…) và bảng vật liệu hoàn thiện VA 09 06 00 (WD, CPT, GWB, ACT…). Không có chuẩn quốc tế duy nhất. */
export type Prefix = { prefix: string; en: string; vn: string; includes_en: string; includes_vn: string; groups: string[] }
export const PREFIXES: Prefix[] = [
  { prefix: 'CT', en: 'Ceramic / Porcelain Tile', vn: 'Gạch ốp lát', includes_en: 'ceramic, porcelain, mosaic tile', includes_vn: 'gạch gốm, porcelain, mosaic', groups: ['CT'] },
  { prefix: 'ST', en: 'Stone', vn: 'Đá (tự nhiên, nhân tạo)', includes_en: 'natural stone (marble, granite…), engineered stone, quartz, terrazzo, solid surface', includes_vn: 'đá tự nhiên (marble, granite…), đá nhân tạo, quartz, terrazzo, solid surface', groups: ['ST', 'ES'] },
  { prefix: 'WD', en: 'Wood', vn: 'Gỗ (tự nhiên, công nghiệp)', includes_en: 'solid wood, veneer, engineered wood (MDF/MFC), melamine, laminate, acrylic panels', includes_vn: 'gỗ tự nhiên, veneer, gỗ công nghiệp (MDF/MFC), melamine, laminate, acrylic', groups: ['WD', 'LM'] },
  { prefix: 'LVT', en: 'Resilient Flooring', vn: 'Sàn nhựa', includes_en: 'luxury vinyl tile, vinyl sheet', includes_vn: 'sàn vinyl, sàn nhựa', groups: ['LVT'] },
  { prefix: 'CPT', en: 'Carpet', vn: 'Thảm', includes_en: 'broadloom, carpet tile', includes_vn: 'thảm cuộn, thảm tấm', groups: ['CPT'] },
  { prefix: 'PNT', en: 'Paint', vn: 'Sơn', includes_en: 'emulsion paint, special / epoxy coatings', includes_vn: 'sơn nước, sơn đặc biệt, epoxy', groups: ['PT', 'SP'] },
  { prefix: 'WC', en: 'Wallcovering', vn: 'Giấy / vải dán tường', includes_en: 'wallpaper, fabric wallcovering', includes_vn: 'giấy dán tường, vải dán tường', groups: ['WC'] },
  { prefix: 'WP', en: 'Wall Panelling', vn: 'Tấm ốp tường', includes_en: 'timber slats, acoustic and decorative panels', includes_vn: 'lam gỗ, tấm tiêu âm, tấm ốp trang trí', groups: ['WP'] },
  { prefix: 'GWB', en: 'Gypsum Board', vn: 'Thạch cao', includes_en: 'gypsum board ceiling and partition', includes_vn: 'trần, vách thạch cao', groups: ['GWB'] },
  { prefix: 'ACT', en: 'Acoustic Ceiling', vn: 'Trần tiêu âm / đặc biệt', includes_en: 'acoustic and specialty ceilings', includes_vn: 'trần tiêu âm, trần đặc biệt', groups: ['ACT'] },
  { prefix: 'SKT', en: 'Skirting / Base', vn: 'Len chân tường', includes_en: 'skirting, wall base, floor transition strip', includes_vn: 'len chân tường, nẹp chuyển sàn', groups: ['BS'] },
  { prefix: 'MTL', en: 'Metal', vn: 'Kim loại', includes_en: 'stainless steel, brass, aluminium, powder-coated steel', includes_vn: 'inox, đồng thau, nhôm, thép sơn tĩnh điện', groups: ['MT'] },
  { prefix: 'GL', en: 'Glass', vn: 'Kính', includes_en: 'clear, frosted, tempered, laminated glass', includes_vn: 'kính trong, mờ, cường lực, dán an toàn', groups: ['GL'] },
  { prefix: 'MIR', en: 'Mirror', vn: 'Gương', includes_en: 'mirror', includes_vn: 'gương', groups: ['MR'] },
  { prefix: 'FAB', en: 'Fabric', vn: 'Vải', includes_en: 'upholstery and curtain fabric', includes_vn: 'vải bọc, vải rèm', groups: ['FB'] },
  { prefix: 'LTH', en: 'Leather', vn: 'Da / giả da', includes_en: 'leather, faux leather', includes_vn: 'da thật, giả da', groups: ['LE'] },
  { prefix: 'DR', en: 'Door', vn: 'Cửa đi', includes_en: 'door leaf, frame', includes_vn: 'cánh cửa, khung cửa', groups: ['DR'] },
  { prefix: 'HW', en: 'Door Hardware', vn: 'Phụ kiện cửa', includes_en: 'handle, hinge, closer, lock, stop', includes_vn: 'tay nắm, bản lề, closer, khoá, chặn cửa', groups: ['HW'] },
  { prefix: 'MWK', en: 'Millwork', vn: 'Đồ liền tường', includes_en: 'built-in joinery, casework, cabinetry', includes_vn: 'tủ, kệ, quầy, vách trang trí liền tường', groups: ['JN'] },
  { prefix: 'FHW', en: 'Furniture Hardware', vn: 'Phụ kiện nội thất', includes_en: 'furniture and joinery hardware', includes_vn: 'phụ kiện đồ nội thất, ray, bản lề tủ', groups: ['FH'] },
  { prefix: 'FUR', en: 'Loose Furniture', vn: 'Đồ rời', includes_en: 'chairs, tables, sofas, loose furniture (FF&E)', includes_vn: 'ghế, bàn, sofa, đồ rời', groups: ['FF'] },
  { prefix: 'LGT', en: 'Lighting', vn: 'Thiết bị chiếu sáng', includes_en: 'luminaires, lamps', includes_vn: 'đèn, thiết bị chiếu sáng', groups: ['LT'] },
  { prefix: 'PLB', en: 'Plumbing Fixtures', vn: 'Thiết bị vệ sinh', includes_en: 'basins, WCs, taps, showers', includes_vn: 'lavabo, bồn cầu, vòi, sen tắm', groups: ['SF'] },
  { prefix: 'WRA', en: 'Washroom Accessories', vn: 'Phụ kiện phòng vệ sinh', includes_en: 'soap dispenser, paper holder, hand dryer', includes_vn: 'hộp xà phòng, giấy, máy sấy tay', groups: ['BA'] },
  { prefix: 'EQP', en: 'Equipment', vn: 'Thiết bị', includes_en: 'appliances, kitchen and special equipment', includes_vn: 'thiết bị điện tử, bếp, chuyên dụng', groups: ['EQ'] },
  { prefix: 'ART', en: 'Artwork', vn: 'Tranh', includes_en: 'paintings, murals, art pieces', includes_vn: 'tranh, mural, tác phẩm', groups: ['AW'] },
  { prefix: 'DEC', en: 'Decorative Accessories', vn: 'Đồ trang trí', includes_en: 'plants, cushions, decor items', includes_vn: 'cây, gối, phụ kiện decor', groups: ['DC'] },
  { prefix: 'WT', en: 'Window Treatment', vn: 'Rèm / màn', includes_en: 'curtains, blinds', includes_vn: 'rèm, màn', groups: ['WT'] },
  { prefix: 'SGN', en: 'Signage', vn: 'Biển báo', includes_en: 'room signs, wayfinding', includes_vn: 'biển tên phòng, chỉ dẫn', groups: ['SN'] },
  { prefix: 'MEP', en: 'MEP Interface', vn: 'Đầu chờ MEP', includes_en: 'exposed MEP items for coordination', includes_vn: 'đầu chờ MEP lộ ra không gian', groups: ['ME'] },
]
export const INTL: Record<string, string> = Object.fromEntries(PREFIXES.flatMap(p => p.groups.map(g => [g, p.prefix])))
export const intlPrefix = (group: string) => INTL[group] ?? group
const intlCode = (e: Entry) => { const m = /^[A-Z]+-(\d+)/.exec(e.code); return m ? `${intlPrefix(e.group_code)}-${m[1]}` : e.code }
/** Ký hiệu bản vẽ: luôn dùng chuẩn viết tắt tiếng Anh, cho cả bản tiếng Việt và tiếng Anh (tham số lang/legacy giữ lại cho tương thích) */
export function symbolOf(e: Entry, _lang?: Lang, _legacy?: Map<string, string>, en?: Map<string, string>): string {
  return en?.get(e.id) ?? intlCode(e)
}
/** Bản đồ ký hiệu cho cả danh sách (các nhóm cùng tiền tố – vd gỗ tự nhiên + melamine – dùng chung một dãy số, không trùng) */
export const symbolMap = (entries: Entry[]) => exportSymbols(entries.filter(e => e.status !== 'rejected'), true).en
/** Ký hiệu dùng khi xuất: tính trên đúng danh sách được xuất, có thể đánh lại số liên tục (bỏ khoảng trống do mã bị loại) */
export function exportSymbols(list: Entry[], renumber: boolean) {
  const legacy = legacyCodes(list)
  const en = new Map<string, string>()
  const gi = (c: string) => GROUPS.findIndex(g => g.code === c)
  const cnt = new Map<string, number>(), used = new Map<string, Set<number>>()
  for (const e of [...list].sort((a, b) => gi(a.group_code) - gi(b.group_code) || a.code.localeCompare(b.code, undefined, { numeric: true }))) {
    const pf = intlPrefix(e.group_code), u = used.get(pf) ?? new Set<number>(); used.set(pf, u)
    let k: number
    if (renumber) k = (cnt.get(pf) ?? 0) + 1
    else { k = Number(/(\d+)$/.exec(e.code)?.[1] ?? 0); if (!k || u.has(k)) k = Math.max(0, ...u) + 1 }
    cnt.set(pf, k); u.add(k)
    en.set(e.id, `${pf}-${String(k).padStart(2, '0')}`)
  }
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
  { key: 'bands', label: 'Hoàn thiện (A+B) | Nội thất & thiết bị (C) | Decor & art (D)', make: () => Object.fromEntries(allSections().map(s => [s.key, s.band === 'D' ? 'c2' : s.band === 'A' || s.band === 'B' ? 'main' : 'c1'])) as Record<string, SheetTarget> },
  { key: 'all', label: 'Mỗi mục vật liệu 1 sheet riêng', make: () => Object.fromEntries(allSections().map(s => [s.key, 'own'])) as Record<string, SheetTarget> },
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

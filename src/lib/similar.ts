// Tìm vật liệu đã có mã giống với vật liệu đang định thêm (chống 1 vật liệu có 2 mã). Phần mềm tự so, không dùng AI.
import type { Entry } from './types'

export const norm = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ')
const STOP = new Set(['va', 'co', 'cho', 'cua', 'voi', 'mau', 'loai', 'the', 'and', 'with', 'for', 'of', 'a', 'mm', 'cm', 'm2'])
const toks = (s: string) => new Set(norm(s).split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)))

export type Probe = { group: string; name: string; material?: string; color?: string | null; brand?: string; product_code?: string; desc?: string; part?: string; gc?: string }
export type Similar = { entry: Entry; score: number; dE: number | null; why: string[] }

// ---- Đặc trưng đọc từ chữ (màu nêu trong tên/vật liệu/thông số, loại vật liệu, mã màu/mã SP). Không dùng màu trích từ ảnh.
const L = '(?<![\\p{L}\\d])', R = '(?![\\p{L}\\d])'
const rx = (words: string[]) => new RegExp(L + '(?:' + words.join('|') + ')' + R, 'iu')
const COLORS: [string, RegExp][] = [
  ['red', rx(['đỏ', 'đỏ gạch', 'đỏ đậm', 'cam đất', 'cam', 'terracotta', 'burgundy', 'đỏ rượu', 'nâu đỏ', 'màu gạch', 'rust'])],
  ['brown', rx(['nâu', 'nâu đậm', 'cà phê', 'walnut', 'óc chó', 'chocolate', 'wenge'])],
  ['lightwood', rx(['sồi', 'oak', 'tần bì', 'ash', 'vân gỗ sáng', 'gỗ sáng'])],
  ['neutral', rx(['trắng', 'kem', 'be', 'ngà', 'trắng ngà', 'cream', 'ivory', 'white', 'off-white'])],
  ['grey', rx(['xám', 'ghi', 'ghi sáng', 'xám nhạt', 'xám đậm', 'grey', 'gray', 'bê tông', 'concrete'])],
  ['black', rx(['đen', 'black'])],
  ['green', rx(['xanh lá', 'xanh rêu', 'xanh olive', 'olive', 'sage', 'xanh cốm', 'green'])],
  ['blue', rx(['xanh dương', 'xanh navy', 'xanh biển', 'xanh da trời', 'navy', 'blue'])],
  ['yellow', rx(['vàng', 'vàng gold', 'gold', 'mù tạt', 'yellow'])],
  ['pink', rx(['hồng', 'tím', 'pink', 'purple'])],
]
const NEAR = new Set(['neutral|grey', 'neutral|lightwood', 'brown|lightwood', 'brown|red', 'black|grey', 'brown|yellow', 'lightwood|yellow', 'neutral|yellow'])
const near = (a: string, b: string) => a === b || NEAR.has([a, b].sort().join('|'))
const colorsOf = (t: string) => new Set(COLORS.filter(([, r]) => r.test(t)).map(([k]) => k))
const MATS: [string, RegExp][] = [
  ['engineered', rx(['laminate', 'melamine', 'mfc', 'mdf', 'hpl', 'cpl', 'gỗ công nghiệp', 'ván công nghiệp'])],
  ['veneer', rx(['veneer', 'gỗ tự nhiên', 'gỗ thịt', 'solid wood'])],
  ['paint', rx(['sơn', 'paint', 'epoxy'])],
  ['tile', rx(['gạch', 'tile', 'porcelain', 'ceramic'])],
  ['stone', rx(['đá', 'marble', 'granite', 'terrazzo', 'quartz', 'đá nhân tạo'])],
  ['carpet', rx(['thảm', 'carpet'])],
  ['vinyl', rx(['vinyl', 'lvt', 'spc', 'sàn nhựa'])],
  ['metal', rx(['inox', 'thép', 'nhôm', 'đồng', 'metal', 'stainless'])],
  ['glass', rx(['kính', 'gương', 'glass', 'mirror'])],
  ['fabric', rx(['vải', 'nỉ', 'bọc nệm', 'fabric', 'da thuộc', 'simili'])],
  ['gypsum', rx(['thạch cao', 'gypsum'])],
  ['acrylic', rx(['acrylic', 'mica', 'solid surface'])],
]
const matsOf = (t: string) => new Set(MATS.filter(([, r]) => r.test(t)).map(([k]) => k))
const overlap = <T,>(a: Set<T>, b: Set<T>) => [...a].some(x => b.has(x))
/** Mã màu / mã SP nêu trong chữ: 93YY 89/012, 20YY 53/124, GTGMTM, 3060M36140 … */
const codesOf = (t: string) => {
  const out = new Set<string>()
  for (const m of t.toUpperCase().matchAll(/(?<![A-Z0-9])(\d{2}[A-Z]{2}\s?\d{2}\/\d{3}|[A-Z]{2,}[-]?\d{2,}[A-Z0-9\-\/]*|\d{3,}[A-Z]+\d*[A-Z0-9]*)(?![A-Z0-9])/g)) out.add(m[1].replace(/\s/g, ''))
  return out
}
const refColor = (t: string) => { const m = /m[aã]̀?u\s+tham\s+kh[aả]o\s*:?\s*([^\n(;,]+)/i.exec(t) ?? /mã màu[^:\n]*:\s*([^\n(;,]+)/i.exec(t); return m ? norm(m[1]).replace(/\s+/g, ' ').trim() : '' }

/** Nhóm hoàn thiện: ở đây chất liệu + màu chính là danh tính vật liệu (đồ rời, đèn, thiết bị… thì tên món đồ mới quyết định) */
export const FIN = new Set(['WD', 'LM', 'CT', 'ST', 'ES', 'LVT', 'CPT', 'PT', 'SP', 'WC', 'WP', 'GWB', 'ACT', 'BS'])
type Feat = { core: string; gc: string; group: string; name: string; text: string; codes: string[]; brand: string; part: string }
const featOf = (x: { gc?: string; group: string; name: string; material?: string | null; desc?: string | null; product_code?: string | null; brand?: string | null; part?: string | null }): Feat =>
  ({ core: [x.name, x.material].filter(Boolean).join(' . '), gc: x.gc ?? x.group, group: x.group, name: x.name, text: [x.name, x.material, x.desc].filter(Boolean).join(' . '), codes: (x.product_code ?? '').split('\n').map(c => norm(c).replace(/\s/g, '')).filter(Boolean), brand: norm(x.brand).trim(), part: norm(x.part).trim() })

/** So hai vật liệu theo THUỘC TÍNH, không chỉ theo tên: tông màu, loại vật liệu, mã màu/mã SP. Khác mã màu/mã SP/khác màu rõ ràng ⇒ KHÔNG nghi trùng. */
function compare(a: Feat, b: Feat): { score: number; why: string[] } {
  const why: string[] = [], conflicts: string[] = []
  if (a.codes.some(c => b.codes.includes(c)) && (!a.brand || !b.brand || a.brand === b.brand)) return { score: 1, why: ['trùng mã sản phẩm'] }
  if (a.codes.length && b.codes.length && !a.codes.some(c => b.codes.includes(c))) conflicts.push('khác mã sản phẩm')
  const ca = codesOf(a.text), cb = codesOf(b.text)
  if (ca.size && cb.size && !overlap(ca, cb)) conflicts.push('khác mã màu / mã trong thông số')
  const ra = refColor(a.text), rb = refColor(b.text)
  if (ra && rb && ra !== rb && !ra.includes(rb) && !rb.includes(ra) && !conflicts.length) conflicts.push('khác màu tham khảo')
  const colA = colorsOf(a.text), colB = colorsOf(b.text)
  let colorStrong = false
  if (colA.size && colB.size) {
    if (overlap(colA, colB)) colorStrong = true
    else if (![...colA].some(x => [...colB].some(y => near(x, y)))) conflicts.push('khác màu sắc')
  }
  const ma = matsOf(a.text), mb = matsOf(b.text)
  let matSame = false
  if (ma.size && mb.size) { if (overlap(ma, mb)) matSame = true; else conflicts.push('khác loại vật liệu') }
  const ta = toks(a.core), tb = toks(b.core)
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++
  const jac = ta.size && tb.size ? inter / (ta.size + tb.size - inter) : 0
  const na = toks(a.name), nb = toks(b.name)
  let ni = 0; for (const t of na) if (nb.has(t)) ni++
  const nameSim = na.size && nb.size ? ni / Math.min(na.size, nb.size) : 0
  let s = Math.max(jac, nameSim * 0.8)
  if (a.group === b.group) s += 0.12; else s *= 0.6
  if (colorStrong && matSame && FIN.has(a.gc) && FIN.has(b.gc)) { s = Math.max(s, 0.55) + 0.2; why.push(`cùng loại vật liệu và cùng tông màu (${[...colA].filter(x => colB.has(x)).join(', ')})`) }
  else if (FIN.has(a.gc) && FIN.has(b.gc) && colorStrong) { s += 0.1; why.push('cùng tông màu') }
  if (nameSim >= 0.8 && a.group === b.group) why.push('tên gần giống')
  else if (jac >= 0.4) why.push('mô tả giống nhau')
  if (a.part && b.part && a.part !== b.part && s >= 0.5) why.push('khác bộ phận áp dụng – có thể cùng vật liệu dùng ở chỗ khác')
  if (conflicts.length) { s = Math.min(s, 0.35); why.unshift('⚠ ' + conflicts.join(', ')) }
  return { score: Math.min(s, 1), why }
}

export function findSimilar(entries: Entry[], p: Probe, limit = 5, groupOf?: (e: Entry) => string): Similar[] {
  if (!toks(`${p.name} ${p.material ?? ''} ${p.desc ?? ''}`).size && !p.product_code) return []
  const fa = featOf({ gc: p.gc, group: p.group, name: p.name, material: p.material, desc: p.desc, product_code: p.product_code, brand: p.brand, part: p.part })
  const out: Similar[] = []
  for (const e of entries) {
    if (e.status === 'rejected') continue
    const r = compare(fa, featOf({ gc: e.group_code, group: groupOf ? groupOf(e) : e.group_code, name: e.name_vn, material: e.material_vn, desc: e.desc_vn, product_code: e.product_code, brand: e.brand, part: e.part_vn }))
    if (r.score >= 0.4) out.push({ entry: e, score: r.score, dE: null, why: r.why })
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit)
}

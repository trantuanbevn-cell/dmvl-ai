// Dàn chữ song ngữ cho file xuất: mỗi ý một dòng tiếng Việt (in đậm) rồi ngay bên dưới một dòng tiếng Anh (in nghiêng) – không bao giờ chung một dòng.
import { tx, type Lang } from './sections'
import { STATUS_VN, STATUS_EN } from './types'
import { CATEGORIES } from './codes'
import type { Entry } from './types'

export type Seg = { t: string; k: 'vn' | 'en' | 'n' }
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)
/** Một ý: song ngữ → dòng VN rồi dòng EN; một ngôn ngữ → như cũ */
export function pair(vn: string | null | undefined, en: string | null | undefined, L: Lang): Seg[] {
  const a = (vn ?? '').trim(), b = (en ?? '').trim()
  if (L === 'vn') return lines(a).map(t => ({ t, k: 'n' as const }))
  if (L === 'en') return lines(b || a).map(t => ({ t, k: 'n' as const }))
  const out: Seg[] = lines(a).map(t => ({ t, k: 'vn' as const }))
  if (b && b !== a) out.push(...lines(b).map(t => ({ t, k: 'en' as const })))
  return out
}
const one = (t: string): Seg[] => (t ? [{ t, k: 'n' }] : [])
/** Chuỗi h(): “VN\nEN” khi song ngữ → hai dòng đúng loại */
export const splitBoth = (s: string, both: boolean): Seg[] => (both ? s.split('\n').map((t, i) => ({ t, k: i === 0 ? 'vn' as const : 'en' as const })) : one(s))

export type EntryCells = { cat: Seg[]; loc: Seg[]; spec: Seg[]; brand: Seg[]; note: Seg[] }
export function entryCells(e: Entry, L: Lang, occCats: string[], locs: { room: { name_vn: string; name_en: string | null } }[]): EntryCells {
  const flat = (s: string | null | undefined) => (s ?? '').replace(/\n/g, ' ')
  const cat = occCats.flatMap(k => { const c = CATEGORIES.find(z => z.key === k); return c ? pair(c.vn, c.en, L) : one(k) })
  const loc = locs.length ? locs.flatMap(l => pair(flat(l.room.name_vn), flat(l.room.name_en), L)) : pair('(chưa gán phòng)', '(no room assigned)', L)
  const lab = (a: string, b: string, vn: string | null | undefined, en: string | null | undefined) => pair(vn ? `${a}: ${vn}` : '', vn || en ? `${b}: ${en || vn}` : '', L)
  const spec = [...pair(e.name_vn, e.name_en, L), ...pair(e.desc_vn || e.material_vn, e.desc_en || e.material_en, L),
    ...(e.part_vn ? lab('Bộ phận', 'Part', e.part_vn, e.part_en) : []), ...(e.composition ? lab('Cấu tạo', 'Composition', e.composition, e.composition) : [])]
  const brand = [...one(e.brand ? (e.product_name ? `${e.brand} – ${e.product_name}` : e.brand) : ''), ...one(e.origin ?? '')]
  const note = [...pair(e.note_vn, e.note_en, L), ...(e.status !== 'approved' ? pair(`[${STATUS_VN[e.status]}]`, `[${STATUS_EN[e.status]}]`, L) : [])]
  return { cat, loc, spec, brand, note }
}
export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u.slice(0, 30) } }

/** Gán dòng vào ô Excel: song ngữ → richText (VN đậm, EN nghiêng) */
export function setLines(cell: any, ls: Seg[], size: number, color: string, both: boolean, bold = false) {
  if (!both) { cell.value = ls.map(l => l.t).join('\n'); cell.font = { name: 'Arial', size, bold, color: { argb: color } }; return }
  cell.value = { richText: ls.map((l, i) => ({ text: l.t + (i < ls.length - 1 ? '\n' : ''), font: { name: 'Arial', size, bold: bold || l.k === 'vn', italic: l.k === 'en', color: { argb: color } } })) }
}
/** Số dòng hiển thị của ô (có tính xuống dòng do hẹp) – để đặt chiều cao hàng đủ chỗ */
export const wrapCount = (ls: Seg[], width: number, size = 9) => ls.reduce((n, l) => n + Math.max(1, Math.ceil(l.t.length / (width * (size >= 10 ? 1.05 : 1.15) * (l.k === 'vn' ? 0.92 : 1)))), 0)
/** Chiều rộng cột vừa đủ để phần lớn dòng nằm gọn một dòng */
export function fitWidth(all: Seg[][], min: number, max: number) {
  const lens = all.flat().map(l => l.t.length).sort((a, b) => a - b)
  if (!lens.length) return min
  const p = lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.9))]
  return Math.max(min, Math.min(max, Math.ceil(p / 1.1) + 2))
}
export const ln = (vn: string, en: string, L: Lang) => pair(vn, en, L)
export { tx }

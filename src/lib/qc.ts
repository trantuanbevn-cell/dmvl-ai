// Tiện ích cho QC cuối: làm sạch dữ liệu để so khớp chính xác (không nhầm mã vật liệu nội bộ với mã sản phẩm thật).
import type { Entry } from './types'

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** Ô “Mã SP / Hãng” của đồ rời hay chứa mã vật liệu nội bộ (EWD-06, MTL-07…) để chỉ thành phần cấu tạo – không phải mã sản phẩm thật */
export function internalSet(entries: Entry[]) {
  const codes = new Set<string>(), pre = new Set<string>()
  for (const e of entries) { codes.add(norm(e.code)); pre.add(norm(e.group_code)); const p = e.code.split('-')[0]; if (p) pre.add(norm(p)) }
  return { codes, pre }
}
export const isInternalCode = (c: string, s: ReturnType<typeof internalSet>) => {
  const k = norm(c); if (!k) return false
  if (s.codes.has(k)) return true
  const m = k.match(/^([a-z]{1,6})-\d{1,3}[a-z]?$/)
  return !!m && s.pre.has(m[1])
}
/** Các mã sản phẩm THẬT của một dòng (bỏ mã vật liệu nội bộ) */
export const realCodes = (e: Entry, s: ReturnType<typeof internalSet>) => (e.product_code ?? '').split('\n').map(c => c.trim()).filter(c => c && !isInternalCode(c, s))
/** Bản sao danh mục với ô mã sản phẩm chỉ còn mã thật – dùng cho mọi phép so trùng/liên kết */
export function cleanEntries(entries: Entry[]): Entry[] {
  const s = internalSet(entries)
  return entries.map(e => ({ ...e, product_code: realCodes(e, s).join('\n') || null }))
}

/** Các con số trong một đoạn chữ, chuẩn hoá (1.200 = 1,200 = 1200; 0,5 = 0.5) */
export function numbersOf(t: string | null | undefined): string[] {
  const s = String(t ?? '').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1')
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => String(parseFloat(x.replace(',', '.'))))
}
export const sameNumbers = (a: string | null | undefined, b: string | null | undefined) => {
  const x = [...numbersOf(a)].sort().join(','), y = [...numbersOf(b)].sort().join(',')
  return x === y
}

const toks = (t: string | null | undefined) => new Set(String(t ?? '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1))
const jac = (a: Set<string>, b: Set<string>) => { if (!a.size && !b.size) return 1; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i) }
/** Hai mã chỉ là trùng khi tên VÀ vật liệu gần như giống hệt (khác “chống cháy/chống ẩm”, “mờ/trong suốt”… là hai món khác nhau) */
export const sameThing = (a: Entry, b: Entry) => jac(toks(a.name_vn), toks(b.name_vn)) >= 0.85 && jac(toks(a.material_vn), toks(b.material_vn)) >= 0.8 && jac(toks(a.part_vn), toks(b.part_vn)) >= 0.8

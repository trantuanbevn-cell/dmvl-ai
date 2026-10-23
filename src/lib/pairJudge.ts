// Phán định MỘT CẶP mã có phải cùng một vật liệu không – theo BẰNG CHỨNG, không theo "độ giống chữ".
// Nguyên tắc: chữ mô tả giống nhau KHÔNG phải bằng chứng (nhiều mã dùng cùng câu mô tả chung như "Thảm Nylon in theo thiết kế").
// Chỉ có 3 kết luận:
//   'same'      – có định danh chung (mã sản phẩm thật / mã vật liệu tham khảo) và không có điểm mâu thuẫn
//   'weak'      – chỉ giống chữ, KHÔNG có mã/số để xác nhận (mặc định không hiện; admin bật "hiện cả cặp ít chắc")
//   'different' – có mâu thuẫn (khác mã, khác kích thước/số liệu, khác màu, khác loại vật liệu, khác tên món, khác hãng…) hoặc không có bằng chứng
import type { Entry } from './types'
import { norm, colorsOf, matsOf, near, overlap } from './similar'
import { numbersOf } from './qc'

export type Mode = 'dup' | 'link'
export type Verdict = { v: 'same' | 'weak' | 'different'; why: string[]; conflicts: string[] }

const STD = new Set(['EN', 'ISO', 'TCVN', 'ASTM', 'BS', 'DIN', 'QCVN', 'IEC', 'UL', 'IP', 'IK', 'NFPA', 'AS', 'GB', 'JIS', 'ANSI', 'BIFMA', 'CE', 'FSC', 'MR', 'MDF', 'HDF', 'MFC', 'HPL', 'CPL', 'PVC', 'LED', 'SPC', 'LVT', 'ABS', 'PU', 'PP', 'PA', 'PE', 'PET', 'RAL', 'CRI', 'CCT', 'USB', 'HDMI', 'AC', 'DC', 'KG', 'CM', 'MM'])
const nospace = (s: string) => s.toUpperCase().replace(/[\s\-_/.]/g, '')

/** Mã vật liệu/màu tham khảo nêu trong chữ: "MS 402 PL", "93YY 89/012", "GTGMTM"… (bỏ tiêu chuẩn EN/ISO…, bỏ kích thước W630/H750) */
export function refCodes(t: string): Set<string> {
  const out = new Set<string>()
  const add = (c: string) => { const k = nospace(c); const pre = /^[A-Z]+/.exec(k)?.[0] ?? ''; if (k.length >= 4 && /\d/.test(k) && !STD.has(pre)) out.add(k) }
  for (const m of t.matchAll(/(?<![A-Za-z0-9])(\d{2}[A-Z]{2}\s?\d{2}\/\d{3})(?![A-Za-z0-9])/g)) add(m[1])
  for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Z]{2,4}\s?-?\s?\d{2,4}\s?[A-Z]{0,3}(?:\/\d{2,4})?)(?![A-Za-z0-9])/g)) add(m[1])
  return out
}
const realCodes = (e: Entry) => new Set((e.product_code ?? '').split('\n').map(nospace).filter(c => c.length >= 3))
const brandOf = (e: Entry) => norm(e.brand).replace(/\s+/g, ' ').trim()
/** Hãng khác nhau rõ ràng (cả hai đều có, không chứa nhau) */
const brandClash = (a: Entry, b: Entry) => { const x = brandOf(a), y = brandOf(b); return !!x && !!y && x !== y && !x.includes(y) && !y.includes(x) }
const toks = (s: string | null | undefined) => new Set(norm(s).split(/\s+/).filter(t => t.length > 1))
const jac = (x: Set<string>, y: Set<string>) => { if (!x.size && !y.size) return 1; let i = 0; for (const t of x) if (y.has(t)) i++; return i / (x.size + y.size - i) }
const fullText = (e: Entry) => [e.name_vn, e.material_vn, e.desc_vn].filter(Boolean).join(' . ')
const sameNums = (a: string, b: string) => { const x = [...numbersOf(a)].sort().join(','), y = [...numbersOf(b)].sort().join(','); return x === y }

/** `a`,`b` phải là bản đã bỏ mã vật liệu nội bộ khỏi ô mã SP (cleanEntries) */
export function judgePair(a: Entry, b: Entry, mode: Mode): Verdict {
  const why: string[] = [], conflicts: string[] = []
  const ta = fullText(a), tb = fullText(b)

  // 1) Định danh chung
  const ca = realCodes(a), cb = realCodes(b)
  const sharedCode = [...ca].find(c => cb.has(c))
  if (ca.size && cb.size && !sharedCode) conflicts.push('khác mã sản phẩm')
  if (sharedCode && brandClash(a, b)) conflicts.push('khác hãng')
  const ra = refCodes(ta), rb = refCodes(tb)
  const sharedRef = [...ra].find(c => rb.has(c))
  if (ra.size && rb.size && !sharedRef) conflicts.push('khác mã vật liệu/màu trong mô tả')

  // 2) Mâu thuẫn thuộc tính
  if (!sameNums(ta, tb)) conflicts.push('khác kích thước / số liệu')
  const colA = colorsOf(ta), colB = colorsOf(tb)
  if (colA.size && colB.size && !overlap(colA, colB) && ![...colA].some(x => [...colB].some(y => near(x, y)))) conflicts.push('khác màu')
  const ma = matsOf(ta), mb = matsOf(tb)
  if (ma.size && mb.size && !overlap(ma, mb)) conflicts.push('khác loại vật liệu')
  const nameJ = jac(toks(a.name_vn), toks(b.name_vn))
  if (nameJ < (mode === 'dup' ? 0.6 : 0.34)) conflicts.push('khác tên món')
  if (mode === 'dup') {
    const pa = norm(a.part_vn).trim(), pb = norm(b.part_vn).trim()
    if (pa && pb && pa !== pb) conflicts.push('khác bộ phận áp dụng')
    if (a.group_code !== b.group_code) conflicts.push('khác nhóm')
  }

  if (conflicts.length) return { v: 'different', why, conflicts }

  // 3) Bằng chứng dương
  if (sharedCode) { why.push(`cùng mã sản phẩm ${[...(a.product_code ?? '').split('\n')].find(c => nospace(c) === sharedCode)?.trim() ?? sharedCode}`); return { v: 'same', why, conflicts } }
  if (sharedRef) { why.push(`cùng mã vật liệu ${sharedRef}`); return { v: 'same', why, conflicts } }

  // 4) Không có định danh: chỉ coi là "ít chắc" khi chữ vật liệu + thông số giống HẾT và có nội dung đủ cụ thể
  if (mode === 'dup') {
    const ma2 = toks(`${a.material_vn ?? ''} ${a.desc_vn ?? ''}`), mb2 = toks(`${b.material_vn ?? ''} ${b.desc_vn ?? ''}`)
    if (ma2.size >= 3 && jac(ma2, mb2) === 1) { why.push('chỉ giống chữ mô tả – chưa có mã/số nào để xác nhận, cần xem ảnh'); return { v: 'weak', why, conflicts } }
  }
  return { v: 'different', why, conflicts: ['không có bằng chứng trùng'] }
}

/** Gom các cặp thành nhóm (liên thông) để xác nhận "khác nhau" một lần cho cả nhóm */
export function clusterOf(seed: string, pairs: { a: string; b: string }[]): string[] {
  const set = new Set([seed]); let grew = true
  while (grew) { grew = false; for (const p of pairs) { const ha = set.has(p.a), hb = set.has(p.b); if (ha !== hb) { set.add(ha ? p.b : p.a); grew = true } } }
  return [...set]
}

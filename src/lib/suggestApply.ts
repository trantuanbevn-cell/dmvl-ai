// Áp vật liệu chọn từ thư viện vào mã danh mục: chỉ ghi ĐÚNG kích thước đã chọn.
import type { Entry } from './types'
import type { Mat, Var } from '../pages/Library'
import { saveEntry } from './entryLink'

export type Pick = { m: Mat; v: Var | null }

/** Nhóm mã danh mục → loại vật liệu trong thư viện (null = hiện tất cả) */
export function kindOfGroup(code?: string | null): string | null {
  const c = (code ?? '').toUpperCase().replace(/[^A-Z]/g, '')
  if (c === 'CT') return 'tile'
  if (c === 'ST' || c === 'ES') return 'stone'
  if (c === 'LVT') return 'floor'
  if (c === 'PT' || c === 'SP') return 'paint'
  if (c === 'SF' || c === 'BA') return 'sanitary'
  if (c === 'BS') return 'moulding'
  if (['WD', 'EWD', 'WP', 'WPC'].includes(c)) return 'wood'
  return null
}

export const sizeText = (p: Pick) => [p.v?.size, p.v?.th ? `dày ${p.v.th} mm` : ''].filter(Boolean).join(', ')
const setLine = (desc: string | null, re: RegExp, line: string) => {
  const t = (desc ?? '').trim()
  if (!line) return t || null
  return re.test(t) ? t.replace(re, line) : (t ? t + '\n' : '') + line
}

/** mark=false: tự chọn mặc định (chưa phải người làm xác nhận) → chưa đánh dấu xanh trên phối cảnh */
export async function applyPicks(entry: Entry, picks: Pick[], mark = true) {
  if (!picks.length) return null
  const two = picks.length > 1
  const code = (p: Pick) => p.v?.code || p.m.product_code
  const patch: Record<string, unknown> = {
    brand: [...new Set(picks.map(p => p.m.brand))].join(' / '),
    product_code: picks.map(p => (two ? `${p.m.brand}: ${code(p)}` : code(p))).join('\n'),
    product_name: picks.map(p => [p.m.name, p.m.line].filter(Boolean).join(' – ')).join(' | '),
    product_url: picks[0].v?.url || picks[0].m.url || null,
    product_image_url: picks[0].v?.tex || picks[0].m.tex_url || picks[0].m.image_url || null,
    mat_view: null,
    lib_id: mark ? picks[0].m.id : null,
  }
  const o = picks[0].m.attrs.origin; if (o) patch.origin = o
  const vn = picks.map(p => (two ? p.m.brand + ': ' : '') + sizeText(p)).filter(s => s.replace(/^.*: /, '')).join('; ')
  if (vn) {
    patch.desc_vn = setLine(entry.desc_vn, /^Kích thước\s*:.*$/im, 'Kích thước: ' + vn)
    patch.desc_en = setLine(entry.desc_en, /^Size\s*:.*$/im, 'Size: ' + vn.replace(/dày/g, 'thickness'))
  }
  return saveEntry(entry, patch)
}

// Áp vật liệu chọn từ thư viện vào mã danh mục: chỉ ghi ĐÚNG kích thước đã chọn.
import type { Entry } from './types'
import { normSizes, type Mat, type Var } from '../pages/Library'
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
  // đổi sang loại vật liệu khác nhóm mã (vd gỗ → sơn): ký hiệu bản vẽ + thông số cũ không còn đúng → đánh dấu đỏ cho người làm sửa
  const ek = kindOfGroup(entry.group_code), mk = picks[0].m.kind
  patch.spec_stale = ek && mk && ek !== mk ? mk : null
  // ĐỔI LOẠI vật liệu (gỗ → sơn…): mọi chữ mô tả của vật liệu cũ đều sai → xoá, chỉ giữ cái mẫu thư viện có (tên, màu); không có thì để TRỐNG để người làm điền, không giữ chữ cũ gây nhầm
  const reset = !!(ek && mk && ek !== mk)
  if (reset) Object.assign(patch, {
    name_vn: [picks[0].m.name, picks[0].m.line].filter(Boolean).join(' – ') || picks[0].m.product_code, name_en: null,
    material_vn: null, material_en: null, desc_vn: null, desc_en: null, perf_vn: '', perf_en: '', standards: '', composition: null,
    color_hex: /^#[0-9a-f]{3,8}$/i.test(picks[0].m.attrs.color ?? '') ? picks[0].m.attrs.color : null, mat_extra: null,
  })
  const dVn = reset ? null : entry.desc_vn, dEn = reset ? null : entry.desc_en
  // xuất xứ: lấy của mẫu thư viện; thư viện chưa có thì bỏ giá trị cũ (do AI đoán theo vật liệu khác) để ô báo thiếu và người làm điền đúng
  patch.origin = picks[0].m.attrs.origin || null
  // kích thước: biến thể đã chọn, hoặc mẫu chỉ có đúng 1 khổ
  const only = picks.length === 1 && !picks[0].v?.size ? normSizes(picks[0].m.attrs.sizes) : []
  const sz = picks[0].v?.size || (only.length === 1 ? only[0] : '')
  if (sz) {   // sửa các chỗ cũ ghi khổ khác ("khổ 800x800mm") để mô tả không mâu thuẫn mẫu đã chọn
    const fix = (t: string | null) => t ? t.replace(/(\bkhổ\s*|\bsize\s*)\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?(?:\s*(?:mm|cm))?/gi, (_m, p) => p + sz) : t
    patch.desc_vn = fix(dVn); patch.desc_en = fix(dEn)
  }
  const vn = picks.map(p => (two ? p.m.brand + ': ' : '') + sizeText(p)).filter(s => s.replace(/^.*: /, '')).join('; ')
  if (vn) {
    patch.desc_vn = setLine((patch.desc_vn as string | null | undefined) ?? dVn, /^Kích thước\s*:.*$/im, 'Kích thước: ' + vn)
    patch.desc_en = setLine((patch.desc_en as string | null | undefined) ?? dEn, /^Size\s*:.*$/im, 'Size: ' + vn.replace(/dày/g, 'thickness'))
  }
  return saveEntry(entry, patch)
}

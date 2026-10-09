// Gợi ý mã thực tế MIỄN PHÍ: (1) thư viện mã công ty tự tích lũy, xếp hạng theo màu + từ khóa;
// (2) liên kết tìm nhanh trên web hãng để người dùng tự chọn và lưu lại.
import { supabase } from './supabase'
import type { Entry } from './types'

export type LibProduct = { id: string; group_code: string; brand: string; product_code: string; product_name: string | null; url: string | null; image_url: string | null; color_hex: string | null; tags: string | null }

const n = (s?: string | null) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
function hexToLab(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return null
  const v = parseInt(m[1], 16); let [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(c => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92 })
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  ;[x, y, z] = [x, y, z].map(t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116))
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
export function deltaE(a?: string | null, b?: string | null): number | null {
  const A = a ? hexToLab(a) : null, B = b ? hexToLab(b) : null
  if (!A || !B) return null
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

export async function librarySuggestions(e: Entry, limit = 5): Promise<(LibProduct & { score: number; dE: number | null })[]> {
  const { data } = await supabase.from('library_products').select('*').eq('group_code', e.group_code).limit(500)
  const words = new Set(n(`${e.name_vn} ${e.material_vn ?? ''}`).split(/[^a-z0-9]+/).filter(w => w.length > 2))
  return ((data ?? []) as LibProduct[]).map(p => {
    const dE: number | null = null
    const pw = n(`${p.product_name ?? ''} ${p.tags ?? ''}`).split(/[^a-z0-9]+/)
    const overlap = pw.filter(w => words.has(w)).length
    const score = (dE == null ? 30 : dE) - overlap * 5
    return { ...p, score, dE }
  }).sort((a, b) => a.score - b.score).slice(0, limit)
}

export async function saveToLibrary(e: Entry) {
  if (!e.brand || !e.product_code) throw new Error('Cần nhập Hãng và Mã sản phẩm trước')
  const { error } = await supabase.from('library_products').upsert({
    group_code: e.group_code, brand: e.brand, product_code: e.product_code, product_name: e.product_name, url: e.product_url,
    image_url: e.product_image_url, color_hex: e.color_hex, tags: [e.name_vn, e.material_vn].filter(Boolean).join(' | '), verified: true,
  }, { onConflict: 'brand,product_code' })
  if (error) throw error
}

// Liên kết tìm nhanh theo nhóm (site: chỉ dùng cho các website đã xác minh)
const SITES: Record<string, [string, string][]> = {
  LM: [['An Cường', 'site:ancuong.com']], WD: [['An Cường', 'site:ancuong.com']], WP: [['An Cường', 'site:ancuong.com']],
  PT: [['Dulux', 'site:dulux.vn'], ['Jotun', 'Jotun màu sơn'], ['Nippon', 'Nippon Paint màu']], SP: [['Jotun', 'Jotun epoxy'], ['Dulux', 'site:dulux.vn']],
  CT: [['Khatra', 'site:khatra.com.vn'], ['Luxcasa', 'site:gachluxcasa.vn'], ['Viglacera', 'Viglacera gạch'], ['Vietceramics', 'Vietceramics']],
  GWB: [['Vĩnh Tường', 'site:vinhtuong.com'], ['Knauf', 'Knauf Việt Nam']], ACT: [['Vĩnh Tường', 'site:vinhtuong.com'], ['Knauf', 'Knauf trần tiêu âm']],
  HW: [['Hafele', 'site:hafele.com.vn']], FH: [['Hafele', 'site:hafele.com.vn'], ['Blum', 'Blum phụ kiện']],
  SF: [['TOTO', 'TOTO Việt Nam'], ['Inax', 'INAX'], ['Kohler', 'Kohler Việt Nam'], ['Grohe', 'Grohe']], BA: [['TOTO', 'TOTO phụ kiện'], ['Hafele', 'site:hafele.com.vn']],
  LT: [['Philips', 'Philips đèn'], ['Panasonic', 'Panasonic đèn'], ['Rạng Đông', 'Rạng Đông đèn']],
}
export function searchLinks(e: Entry): { label: string; url: string }[] {
  const kw = [e.name_vn, e.material_vn].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 120)
  const list = SITES[e.group_code] ?? []
  const links = list.map(([label, q]) => ({ label, url: `https://www.google.com/search?q=${encodeURIComponent(`${q} ${kw}`)}` }))
  links.push({ label: 'Google Hình ảnh', url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(kw)}` })
  return links
}

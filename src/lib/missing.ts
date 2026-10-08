// Phát hiện ô còn thiếu thông tin trong danh mục – phần mềm tự kiểm, không dùng AI.
import type { Entry } from './types'
import type { Lang } from './sections'
import type { ProjectData } from './useProject'

export type Miss = { key: keyof Entry; label: string }
const has = (v: unknown) => v != null && String(v).trim() !== ''

/** Các ô BẮT BUỘC còn trống của một dòng (tính theo ngôn ngữ đang làm việc) */
export function missingOf(e: Entry, lang: Lang): Miss[] {
  const out: Miss[] = []
  const vn = lang !== 'en', en = lang !== 'vn'
  if (vn) {
    if (!has(e.name_vn)) out.push({ key: 'name_vn', label: 'Tên hạng mục' })
    if (!has(e.material_vn) && !has(e.desc_vn)) { out.push({ key: 'material_vn', label: 'Vật liệu' }); out.push({ key: 'desc_vn', label: 'Thông số' }) }
  }
  if (en) {
    if (!has(e.name_en)) out.push({ key: 'name_en', label: 'Item name' })
    if (!has(e.material_en) && !has(e.desc_en)) { out.push({ key: 'material_en', label: 'Material' }); out.push({ key: 'desc_en', label: 'Specification' }) }
  }
  if (!has(e.brand)) out.push({ key: 'brand', label: 'Hãng' })
  if (!has(e.product_code)) out.push({ key: 'product_code', label: 'Mã sản phẩm' })
  if (!has(e.origin)) out.push({ key: 'origin', label: 'Xuất xứ' })
  if (e.qty == null) out.push({ key: 'qty', label: 'Số lượng' })
  if (!has(e.unit)) out.push({ key: 'unit', label: 'ĐVT' })
  return out
}
export const missKeys = (e: Entry, lang: Lang) => new Set<string>(missingOf(e, lang).map(m => String(m.key)))
/** Tên các ô thiếu, gọn để hiện tooltip (gộp trùng nhãn) */
export const missText = (m: Miss[]) => [...new Set(m.map(x => x.label))].join(', ')

/** Số dòng thiếu thông tin trong 1 phòng (mã bị loại không tính) */
export function roomMissing(d: ProjectData, roomId: string, lang: Lang = 'vn'): { rows: number; cells: number } {
  const ids = new Set(d.occ.filter(o => o.room_id === roomId).map(o => o.entry_id))
  let rows = 0, cells = 0
  for (const e of d.entries) if (ids.has(e.id) && e.status !== 'rejected') { const m = missingOf(e, lang); if (m.length) { rows++; cells += m.length } }
  return { rows, cells }
}

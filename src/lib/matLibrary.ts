// Thư viện vật liệu chung của công ty: mọi mã tạo trong các dự án đều tự lưu lại để dự án sau đối chiếu / gợi ý.
import { supabase } from './supabase'
import { norm } from './similar'
import { findSimilar, type Similar } from './similar'
import type { Entry } from './types'

export type LibRow = Pick<Entry, 'group_code' | 'category' | 'name_vn' | 'name_en' | 'part_vn' | 'material_vn' | 'material_en' | 'color_hex' | 'desc_vn' | 'desc_en' | 'perf_vn' | 'perf_en' | 'standards' | 'brand' | 'product_code' | 'product_name' | 'product_url' | 'product_image_url' | 'origin'> & { id: string; lib_key: string; uses: number; from_project: string | null }
export const libKey = (e: Pick<Entry, 'group_code' | 'name_vn' | 'material_vn' | 'color_hex'>) => norm(`${e.group_code} ${e.name_vn} ${e.material_vn ?? ''} ${e.color_hex ?? ''}`).replace(/\s+/g, ' ').trim().slice(0, 200)

const FIELDS = ['group_code', 'category', 'name_vn', 'name_en', 'part_vn', 'material_vn', 'material_en', 'color_hex', 'desc_vn', 'desc_en', 'perf_vn', 'perf_en', 'standards', 'brand', 'product_code', 'product_name', 'product_url', 'product_image_url', 'origin'] as const
let cache: LibRow[] | null = null
export const resetLibCache = () => { cache = null }

export async function loadLibrary(force = false): Promise<LibRow[]> {
  if (cache && !force) return cache
  const { data, error } = await supabase.from('material_library').select('*').order('uses', { ascending: false }).limit(5000)
  cache = error ? [] : (data as LibRow[])
  return cache
}

/** Lưu các mã của dự án vào thư viện (mã mới thêm; mã đã xác nhận thì cập nhật bản mới nhất) */
export async function syncLibrary(projectId: string, entries: Entry[]) {
  try {
    const rows = entries.filter(e => e.status !== 'rejected' && e.source !== 'inferred' && e.name_vn).map(e => {
      const r: Record<string, unknown> = { lib_key: libKey(e), from_project: projectId, updated_at: new Date().toISOString() }
      for (const k of FIELDS) r[k] = e[k] ?? null
      return { r, approved: e.status === 'approved' }
    })
    const uniq = (xs: typeof rows) => [...new Map(xs.map(x => [x.r.lib_key as string, x.r])).values()]
    const appr = uniq(rows.filter(x => x.approved)), rest = uniq(rows.filter(x => !x.approved)).filter(r => !appr.some(a => a.lib_key === r.lib_key))
    if (appr.length) await supabase.from('material_library').upsert(appr, { onConflict: 'lib_key' })
    if (rest.length) await supabase.from('material_library').upsert(rest, { onConflict: 'lib_key', ignoreDuplicates: true })
    resetLibCache()
  } catch { /* thư viện chỉ là phần phụ trợ */ }
}

/** Mã trong thư viện giống với một mô tả (chưa kể những mã dự án đã có) */
export function searchLibrary(lib: LibRow[], projectEntries: Entry[], p: { group: string; name: string; material?: string; color?: string | null }, limit = 4): (Similar & { row: LibRow })[] {
  const have = new Set(projectEntries.map(libKey))
  const pseudo = lib.filter(r => !have.has(r.lib_key)).map(r => ({ ...(r as any), id: r.id, code: 'TV', status: 'approved', source: 'manual' }) as Entry)
  return findSimilar(pseudo, p, limit).map(s => ({ ...s, row: lib.find(r => r.id === s.entry.id)! }))
}

/** Bổ sung thông số còn trống của mã mới bằng thư viện khi gần như trùng (≥ 0.85) – không ghi đè thứ đã có */
export function libFill(lib: LibRow[], entry: Entry): Partial<Entry> | null {
  const [best] = searchLibrary(lib, [], { group: entry.group_code, name: entry.name_vn, material: entry.material_vn ?? '', color: entry.color_hex }, 1)
  if (!best || best.score < 0.85) return null
  const patch: Record<string, unknown> = {}
  for (const k of ['name_en', 'material_en', 'desc_vn', 'desc_en', 'perf_vn', 'perf_en', 'standards', 'brand', 'product_name', 'origin', 'product_url', 'product_image_url'] as const)
    if (!entry[k] && best.row[k]) patch[k] = best.row[k]
  return Object.keys(patch).length ? patch as Partial<Entry> : null
}

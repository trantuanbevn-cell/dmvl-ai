// Liên kết đồng bộ giữa các mã dùng CHUNG một vật liệu/màu thật (vd mã sơn xanh dùng cho tường và cho tranh):
// sửa mã sản phẩm / màu / hãng… ở một nơi thì mọi mã trong cùng nhóm liên kết (link_id) tự đổi theo.
import { supabase } from './supabase'
import type { Entry } from './types'

export const SYNC_KEYS = ['product_code', 'color_hex', 'brand', 'product_name', 'origin', 'product_url', 'product_image_url'] as const
export const SYNC_LABEL: Record<string, string> = { product_code: 'Mã sản phẩm', color_hex: 'Màu', brand: 'Hãng', product_name: 'Tên sản phẩm', origin: 'Xuất xứ', product_url: 'Link sản phẩm', product_image_url: 'Ảnh mẫu' }
type SyncPatch = Partial<Pick<Entry, typeof SYNC_KEYS[number]>>
const pickSync = (p: Record<string, unknown>) => { const o: Record<string, unknown> = {}; for (const k of SYNC_KEYS) if (k in p) o[k] = p[k]; return o }
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** Lưu một mục; nếu đổi trường đồng bộ và mục đang liên kết thì cập nhật cả các mục cùng nhóm */
export async function saveEntry(e: Pick<Entry, 'id' | 'link_id'>, patch: Record<string, unknown>) {
  const r = await supabase.from('entries').update(patch).eq('id', e.id)
  if (r.error) return r.error
  const sp = pickSync(patch)
  if (e.link_id && Object.keys(sp).length) { const r2 = await supabase.from('entries').update(sp).eq('link_id', e.link_id).neq('id', e.id); if (r2.error) return r2.error }
  return null
}

/** Giá trị đồng bộ của một nhóm: ưu tiên mục “gốc”, ô trống lấy từ mục khác */
export function mergedSync(src: Entry, others: Entry[]): SyncPatch {
  const out: Record<string, unknown> = {}
  for (const k of SYNC_KEYS) out[k] = src[k] || others.map(o => o[k]).find(Boolean) || null
  return out as SyncPatch
}

/** Liên kết hai mục (và toàn bộ nhóm của chúng); giá trị lấy theo mục `src` */
export async function linkEntries(src: Entry, other: Entry, all: Entry[]) {
  const id = src.link_id ?? other.link_id ?? crypto.randomUUID()
  const grp = all.filter(x => x.id === src.id || x.id === other.id || (src.link_id && x.link_id === src.link_id) || (other.link_id && x.link_id === other.link_id))
  const patch = { link_id: id, ...mergedSync(src, grp.filter(x => x.id !== src.id)) }
  const { error } = await supabase.from('entries').update(patch).in('id', grp.map(x => x.id))
  if (error) throw error
}
export async function unlinkEntry(e: Entry, all: Entry[]) {
  const { error } = await supabase.from('entries').update({ link_id: null }).eq('id', e.id)
  if (error) throw error
  const rest = all.filter(x => x.link_id === e.link_id && x.id !== e.id)
  if (rest.length === 1) await supabase.from('entries').update({ link_id: null }).eq('id', rest[0].id)
}
export const linkedWith = (e: Entry, all: Entry[]) => (e.link_id ? all.filter(x => x.link_id === e.link_id && x.id !== e.id && x.status !== 'rejected') : [])

/** Các nhóm liên kết đang bị lệch giá trị (sau khi ai đó sửa ngoài app, hoặc dữ liệu cũ) */
export function linkConflicts(all: Entry[]): { link_id: string; members: Entry[]; keys: string[] }[] {
  const g = new Map<string, Entry[]>()
  for (const e of all) if (e.link_id && e.status !== 'rejected') g.set(e.link_id, [...(g.get(e.link_id) ?? []), e])
  const out: { link_id: string; members: Entry[]; keys: string[] }[] = []
  for (const [link_id, members] of g) {
    const keys = SYNC_KEYS.filter(k => new Set(members.map(m => norm(m[k]))).size > 1)
    if (members.length > 1 && keys.length) out.push({ link_id, members, keys: [...keys] })
  }
  return out
}
export async function resyncGroup(src: Entry, members: Entry[]) {
  const { error } = await supabase.from('entries').update(mergedSync(src, members.filter(m => m.id !== src.id))).in('id', members.map(m => m.id))
  if (error) throw error
}

/** Gợi ý liên kết: cùng mã sản phẩm, hoặc cùng mã màu, mà chưa chung nhóm liên kết (không tính tranh/trùng nhóm AW) */
export function linkSuggestions(all: Entry[]): { a: Entry; b: Entry; why: string }[] {
  const live = all.filter(e => e.status !== 'rejected' && e.source !== 'inferred')
  const out: { a: Entry; b: Entry; why: string }[] = [], seen = new Set<string>()
  const add = (a: Entry, b: Entry, why: string) => {
    if (a.id === b.id || (a.link_id && a.link_id === b.link_id)) return
    const k = [a.id, b.id].sort().join('|'); if (seen.has(k)) return; seen.add(k); out.push({ a, b, why })
  }
  for (const [key, why] of [['product_code', 'cùng mã sản phẩm'], ['color_hex', 'cùng mã màu']] as const) {
    const m = new Map<string, Entry[]>()
    for (const e of live) { const v = norm(e[key]); if (v) m.set(v, [...(m.get(v) ?? []), e]) }
    for (const list of m.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i], list[j], why + ' ' + (list[i][key] ?? ''))
  }
  return out
}

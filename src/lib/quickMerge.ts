// Gộp nhanh vật liệu: chuyển TOÀN BỘ vị trí phòng + hình phối cảnh của mã nguồn sang mã đích (các bảng khác đọc cùng dữ liệu nên tự đồng bộ).
// Mặc định chỉ ẨN mã nguồn (status = rejected) và có bản ghi để hoàn tác; hard = xoá hẳn mã nguồn như chức năng "Gộp mã trùng".
import { supabase } from './supabase'
import { moveRoom, undoMove, type MoveRec } from './cropMove'
import { mergeEntries } from './merge'
import type { Entry, Occurrence } from './types'

export type MergePlan = { rooms: number; crops: number; blankOnly: number; fill: string[] }
export type MergeRec = MoveRec & { patches: { id: string; old: Record<string, unknown> }[] }

const FILL = ['name_en', 'part_vn', 'part_en', 'material_vn', 'material_en', 'color_hex', 'desc_vn', 'desc_en', 'brand', 'product_code', 'product_name', 'product_url', 'product_image_url', 'origin', 'note_vn', 'note_en'] as const
const LABEL: Record<string, string> = { brand: 'hãng', product_code: 'mã sản phẩm', product_url: 'link', product_image_url: 'ảnh mẫu', origin: 'xuất xứ', desc_vn: 'thông số', material_vn: 'vật liệu', color_hex: 'màu' }

/** Xem trước: bao nhiêu phòng / hình sẽ chuyển và ô trống nào của mã đích sẽ được điền */
export function planMerge(occ: Occurrence[], src: Entry, tgt: Entry): MergePlan {
  const os = occ.filter(o => o.entry_id === src.id)
  const fill = FILL.filter(k => (tgt[k] == null || tgt[k] === '') && src[k]).map(k => LABEL[k] ?? String(k))
  return { rooms: new Set(os.map(o => o.room_id).filter(Boolean)).size, crops: os.filter(o => o.bbox).length, blankOnly: os.filter(o => !o.bbox).length, fill }
}

export async function mergeQuick(occ: Occurrence[], all: Entry[], src: Entry, tgt: Entry, hard: boolean): Promise<MergeRec | null> {
  const rec: MergeRec = { label: `Đã gộp ${src.code} vào ${tgt.code}`, moved: [], removed: [], inserted: [], patches: [] }
  const os = occ.filter(o => o.entry_id === src.id)
  // 1. mỗi phòng: chuyển cả vị trí + hình khoanh (dòng "vị trí trống" trùng sẽ gọn lại)
  for (const rid of new Set(os.map(o => o.room_id).filter(Boolean) as string[])) {
    const r = await moveRoom(occ, src.id, rid, tgt, false)
    rec.moved.push(...r.moved); rec.removed.push(...r.removed); rec.inserted.push(...r.inserted)
  }
  // dòng không thuộc phòng nào (hiếm): đổi mã trực tiếp
  for (const o of os.filter(x => !x.room_id)) {
    const { error } = await supabase.from('occurrences').update({ entry_id: tgt.id }).eq('id', o.id)
    if (error) throw new Error(error.message); rec.moved.push({ id: o.id, entry_id: o.entry_id, category: o.category })
  }
  if (hard) { await mergeEntries(tgt, src, all); return { ...rec, label: rec.label + ' (đã xoá mã cũ)', patches: [] } }
  // 2. điền ô trống của mã đích từ mã nguồn (không ghi đè ô đã có)
  const patch: Record<string, unknown> = {}, old: Record<string, unknown> = {}
  for (const k of FILL) if ((tgt[k] == null || tgt[k] === '') && src[k]) { patch[k] = src[k]; old[k] = tgt[k] ?? null }
  if (tgt.product_url && src.product_url && tgt.product_url !== src.product_url) { const j = [...new Set([...tgt.product_url.split(/\s+/), ...src.product_url.split(/\s+/)].filter(Boolean))].join('\n'); if (j !== tgt.product_url) { patch.product_url = j; old.product_url = tgt.product_url } }
  if (Object.keys(patch).length) { const { error } = await supabase.from('entries').update(patch).eq('id', tgt.id); if (error) throw new Error(error.message); rec.patches.push({ id: tgt.id, old }) }
  // 3. các mã khác đang trỏ tới mã nguồn → trỏ sang mã đích
  for (const e of all) {
    if (e.id === src.id) continue
    const p: Record<string, unknown> = {}, o2: Record<string, unknown> = {}
    if (e.parent_id === src.id) { p.parent_id = e.id === tgt.id ? null : tgt.id; o2.parent_id = e.parent_id }
    if (e.composition?.includes(src.code)) { p.composition = e.composition.replace(new RegExp(`\\b${src.code}\\b`, 'g'), tgt.code); o2.composition = e.composition }
    if ((e.finish_refs ?? []).includes(src.id)) { p.finish_refs = [...new Set((e.finish_refs ?? []).map(x => (x === src.id ? tgt.id : x)))]; o2.finish_refs = e.finish_refs }
    if (Object.keys(p).length) { const { error } = await supabase.from('entries').update(p).eq('id', e.id); if (error) throw new Error(error.message); rec.patches.push({ id: e.id, old: o2 }) }
  }
  // 4. ẩn mã nguồn (không xoá) → mọi bảng/ký hiệu tự đánh lại
  const { error } = await supabase.from('entries').update({ status: 'rejected' }).eq('id', src.id)
  if (error) throw new Error(error.message)
  rec.patches.push({ id: src.id, old: { status: src.status } })
  return rec
}

export async function undoMerge(rec: MergeRec) {
  await undoMove(rec)
  for (const p of rec.patches) await supabase.from('entries').update(p.old).eq('id', p.id)
}

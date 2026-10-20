// Chuyển / gộp / tách vùng khoanh (crop) giữa các vật liệu. KHÔNG xoá mã vật liệu nào; chỉ đổi mã chứa vùng khoanh, có ghi lại để hoàn tác.
import { supabase } from './supabase'
import type { Entry, Occurrence } from './types'

export type MoveScope = 'one' | 'room' | 'all'
/** Bản ghi để hoàn tác: vùng đã đổi mã (trả về mã cũ), dòng "vị trí trống" đã gỡ (thêm lại), dòng đã thêm (xoá đi) */
export type MoveRec = { label: string; moved: { id: string; entry_id: string; category: string | null }[]; removed: Record<string, unknown>[]; inserted: string[] }

/** Các vùng bị tác động theo phạm vi: chỉ vùng này / mọi vùng của vật liệu trong phòng này / mọi vùng ở tất cả phòng */
export const cropsInScope = (occ: Occurrence[], o: Occurrence, scope: MoveScope) =>
  scope === 'one' ? [o] : occ.filter(x => x.entry_id === o.entry_id && x.bbox && (scope === 'all' || x.room_id === o.room_id))

export async function moveCrops(occ: Occurrence[], list: Occurrence[], target: Entry, scope: MoveScope): Promise<MoveRec> {
  const rec: MoveRec = { label: `Đã chuyển ${list.length} vùng sang ${target.code}`, moved: [], removed: [], inserted: [] }
  const cat = occ.find(x => x.entry_id === target.id && x.category)?.category ?? target.category ?? 'decor'
  const ids = new Set(list.map(x => x.id))
  for (const o of list) {
    if (o.entry_id === target.id) continue
    const { error } = await supabase.from('occurrences').update({ entry_id: target.id, category: cat, origin: 'manual' }).eq('id', o.id)
    if (error) throw new Error(error.message)
    rec.moved.push({ id: o.id, entry_id: o.entry_id, category: o.category })
  }
  const rooms = [...new Set(list.map(o => o.room_id).filter(Boolean) as string[])]
  for (const r of rooms) {
    // vật liệu đích đã có "vị trí trống" (chưa khoanh) ở phòng này → bỏ dòng trống vì giờ đã có vùng thật
    const { data: blanks } = await supabase.from('occurrences').select('*').eq('entry_id', target.id).eq('room_id', r).is('bbox', null).is('page_id', null)
    for (const b of blanks ?? []) { const { error } = await supabase.from('occurrences').delete().eq('id', b.id); if (!error) rec.removed.push(b) }
    // chỉ khi chuyển MỘT vùng: mã cũ hết vùng trong phòng này vẫn giữ vị trí phòng (như thao tác kéo ảnh)
    if (scope === 'one') for (const src of new Set(list.map(o => o.entry_id))) {
      const left = occ.some(x => !ids.has(x.id) && x.entry_id === src && x.room_id === r)
      if (!left) { const { data } = await supabase.from('occurrences').insert({ entry_id: src, room_id: r, origin: 'manual', category: list[0].category }).select('id'); if (data?.[0]) rec.inserted.push(data[0].id) }
    }
  }
  return rec
}

export async function undoMove(rec: MoveRec) {
  for (const m of rec.moved) await supabase.from('occurrences').update({ entry_id: m.entry_id, category: m.category }).eq('id', m.id)
  if (rec.inserted.length) await supabase.from('occurrences').delete().in('id', rec.inserted)
  if (rec.removed.length) await supabase.from('occurrences').insert(rec.removed)
}

/** Gỡ riêng vùng khoanh khỏi vật liệu (giữ vị trí phòng nếu là vùng cuối) – dùng khi crop trúng thứ không phải vật liệu nào */
export async function dropCrops(occ: Occurrence[], list: Occurrence[]) {
  for (const o of list) {
    const last = !occ.some(x => x.id !== o.id && x.entry_id === o.entry_id && x.room_id === o.room_id && !list.includes(x))
    if (last) await supabase.from('occurrences').update({ page_id: null, bbox: null, view: null }).eq('id', o.id)
    else await supabase.from('occurrences').delete().eq('id', o.id)
  }
}

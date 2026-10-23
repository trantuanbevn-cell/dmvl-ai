// Chuyển / gộp / tách vùng khoanh (crop) giữa các vật liệu. KHÔNG xoá mã vật liệu nào; chỉ đổi mã chứa vùng khoanh, có ghi lại để hoàn tác.
import { supabase } from './supabase'
import type { Entry, Occurrence } from './types'

export type MoveScope = 'one' | 'room' | 'all'
/** Bản ghi để hoàn tác: vùng đã đổi mã (trả về mã cũ), dòng "vị trí trống" đã gỡ (thêm lại), dòng đã thêm (xoá đi) */
export type MoveRec = { label: string; moved: { id: string; entry_id: string; category: string | null }[]; removed: Record<string, unknown>[]; inserted: string[]; /** dòng vị trí trống đã được điền vùng khoanh (hoàn tác = xoá lại vùng) */ filled?: string[] }

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
  if (rec.filled?.length) await supabase.from('occurrences').update({ bbox: null, page_id: null, view: null }).in('id', rec.filled)
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

/** Gán MỘT vùng khoanh mới (khoanh trên ảnh) cho vật liệu có sẵn – dùng vùng "vị trí trống" của phòng nếu có, không thì thêm dòng mới */
export async function addCrop(occ: Occurrence[], target: Entry, roomId: string, pageId: string, box: number[]): Promise<MoveRec> {
  const rec: MoveRec = { label: `Đã gán vùng mới cho ${target.code}`, moved: [], removed: [], inserted: [] }
  const cat = occ.find(x => x.entry_id === target.id && x.category)?.category ?? target.category ?? 'decor'
  const free = occ.find(x => x.entry_id === target.id && x.room_id === roomId && !x.bbox)
  if (free) {
    const { error } = await supabase.from('occurrences').update({ bbox: box, page_id: pageId, category: cat, origin: 'manual' }).eq('id', free.id)
    if (error) throw new Error(error.message); rec.filled = [free.id]
  } else {
    const { data, error } = await supabase.from('occurrences').insert({ entry_id: target.id, room_id: roomId, page_id: pageId, bbox: box, category: cat, origin: 'manual' }).select('id')
    if (error) throw new Error(error.message); if (data?.[0]) rec.inserted.push(data[0].id)
  }
  return rec
}

/** Kéo CẢ MỘT PHÒNG (vị trí + toàn bộ hình khoanh của mã nguồn trong phòng đó) sang vật liệu khác: mã nguồn bỏ phòng này, mã đích nhận phòng + hình.
 *  copy = true → mã nguồn vẫn giữ nguyên, mã đích được thêm bản sao. Có bản ghi để hoàn tác. Không xoá mã vật liệu nào. */
export async function moveRoom(occ: Occurrence[], srcId: string, roomId: string, target: Entry, copy = false): Promise<MoveRec> {
  const list = occ.filter(x => x.entry_id === srcId && x.room_id === roomId)
  const reals = list.filter(x => x.bbox), blanks = list.filter(x => !x.bbox)
  const rec: MoveRec = { label: `${copy ? 'Đã sao chép' : 'Đã chuyển'} phòng sang ${target.code}`, moved: [], removed: [], inserted: [] }
  const cat = occ.find(x => x.entry_id === target.id && x.category)?.category ?? target.category ?? list[0]?.category ?? 'decor'
  const targetHas = occ.some(x => x.entry_id === target.id && x.room_id === roomId)
  if (copy) {
    for (const o of reals) {
      const { data, error } = await supabase.from('occurrences').insert({ entry_id: target.id, room_id: roomId, page_id: o.page_id, bbox: o.bbox, view: o.view, qty: null, confidence: o.confidence, category: cat, origin: 'manual' }).select('id')
      if (error) throw new Error(error.message); if (data?.[0]) rec.inserted.push(data[0].id)
    }
    if (!reals.length && !targetHas) {
      const { data, error } = await supabase.from('occurrences').insert({ entry_id: target.id, room_id: roomId, origin: 'manual', category: cat }).select('id')
      if (error) throw new Error(error.message); if (data?.[0]) rec.inserted.push(data[0].id)
    }
    return rec
  }
  if (reals.length) {
    const r = await moveCrops(occ, reals, target, 'room')
    rec.moved.push(...r.moved); rec.removed.push(...r.removed)
  }
  for (const b of blanks) {
    if (targetHas || reals.length) { const { error } = await supabase.from('occurrences').delete().eq('id', b.id); if (!error) rec.removed.push(b as unknown as Record<string, unknown>) }
    else { const { error } = await supabase.from('occurrences').update({ entry_id: target.id, category: cat, origin: 'manual' }).eq('id', b.id); if (error) throw new Error(error.message); rec.moved.push({ id: b.id, entry_id: b.entry_id, category: b.category }) }
  }
  return rec
}

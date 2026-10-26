// Tách một vật liệu thành hai: các vị trí/hình phối cảnh được chọn chuyển sang MỘT MÃ MỚI (chép nội dung từ mã cũ), phần còn lại giữ ở mã cũ.
// Không xoá gì; có bản ghi để hoàn tác (mã mới bị ẩn, vị trí trả về mã cũ).
import { supabase } from './supabase'
import { addManualEntry, cloneExtra } from './pipeline'
import { moveCrops, moveRoom, undoMove, type MoveRec } from './cropMove'
import type { Entry, Occurrence, Project } from './types'

export type SplitRec = { newEntry: Entry; moves: MoveRec[] }

/** pick = các dòng occurrence (vị trí/hình) của `src` được chọn để chuyển sang mã mới */
export async function splitEntry(project: Project, occ: Occurrence[], src: Entry, pick: Occurrence[], name: string): Promise<SplitRec> {
  if (!pick.length) throw new Error('Chưa chọn ảnh/phòng nào để tách')
  const category = occ.find(o => o.entry_id === src.id && o.category)?.category ?? src.category ?? 'decor'
  const ne = await addManualEntry(project, null, src.group_code, name.trim() || src.name_vn, category, cloneExtra(src))
  // chép thêm các ô chung (mã vật liệu thành phần, cấu tạo, mục) – không chép link/ảnh mẫu vì ghế khác nhau thường khác sản phẩm
  const patch: Record<string, unknown> = { product_code: src.product_code, composition: src.composition, section_key: src.section_key ?? null, note_vn: src.note_vn, note_en: src.note_en }
  await supabase.from('entries').update(patch).eq('id', ne.id)
  const rec: SplitRec = { newEntry: ne, moves: [] }
  try {
    const rooms = [...new Set(pick.map(o => o.room_id ?? ''))]
    for (const rid of rooms) {
      const mine = pick.filter(o => (o.room_id ?? '') === rid)
      if (!rid) { rec.moves.push(await moveCrops(occ, mine.filter(o => o.bbox), ne, 'room')); continue }
      const all = occ.filter(o => o.entry_id === src.id && o.room_id === rid)
      rec.moves.push(mine.length >= all.length ? await moveRoom(occ, src.id, rid, ne, false) : await moveCrops(occ, mine.filter(o => o.bbox), ne, 'room'))
    }
  } catch (e) { await undoSplit(rec); throw e }
  return rec
}
export async function undoSplit(rec: SplitRec) {
  for (const m of [...rec.moves].reverse()) await undoMove(m)
  await supabase.from('entries').update({ status: 'rejected' }).eq('id', rec.newEntry.id)
}

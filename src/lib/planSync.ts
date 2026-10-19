// Đưa phòng đã vẽ/đặt tên trên mặt bằng (Soạn & dựng 3D) sang LẬP DANH MỤC: tên VN/EN, diện tích, tầng.
// Chỉ BỔ SUNG: phòng đã có thì chỉ cập nhật diện tích + điền các ô còn trống; không đổi tên, không xoá, không đụng vật liệu.
import { supabase } from './supabase'
import { createRoom } from './roomMatrix'
import type { ProjectData } from './useProject'
import type { Room } from './types'

export type SyncItem = { name: string; en?: string; area: number }
export type SyncRow = SyncItem & { match?: Room; note: string }
const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function planSyncRows(d: ProjectData, floor: string, items: SyncItem[]): SyncRow[] {
  const used = new Set<string>()
  return items.map(it => {
    const n = norm(it.name), e = norm(it.en)
    const cand = d.rooms.filter(r => !used.has(r.id) && (norm(r.name_vn) === n || (e && norm(r.name_en) === e) || (n && norm(r.name_en) === n)))
    const m = cand.find(r => (r as Room & { floor?: string }).floor === floor) ?? cand[0]
    if (m) used.add(m.id)
    return { ...it, match: m, note: m ? `Khớp ${m.code} – cập nhật diện tích` : 'Thêm phòng mới' }
  })
}

export async function applyPlanSync(d: ProjectData, floor: string, rows: SyncRow[]): Promise<{ added: number; updated: number }> {
  let added = 0, updated = 0
  for (const r of rows) {
    const area = +r.area.toFixed(2)
    const counts = (m?: Room) => [...(m?.concept_counts ?? []).filter(c => !/^di[eệ]n t[ií]ch$/i.test(c.label)), { label: 'Diện tích', qty: area, unit: 'm²' }]
    if (r.match) {
      const patch: Record<string, unknown> = { concept_counts: counts(r.match) }
      if (!r.match.name_en && r.en) patch.name_en = r.en
      if (!(r.match as Room & { floor?: string }).floor && floor) patch.floor = floor
      const { error } = await supabase.from('rooms').update(patch).eq('id', r.match.id); if (error) throw new Error(error.message)
      updated++
    } else {
      const room = await createRoom(d, { name_vn: r.name, name_en: r.en ?? '', room_type: 'other', floor })
      const { error } = await supabase.from('rooms').update({ concept_counts: counts() }).eq('id', room.id); if (error) throw new Error(error.message)
      added++
    }
  }
  return { added, updated }
}

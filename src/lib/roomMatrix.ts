// Tổng hợp phòng: ma trận Phòng × Hạng mục (giống bảng "Theo phòng" khi xuất Excel) + các thao tác ghi thẳng vào dữ liệu gốc
// (occurrences / rooms) nên tab "Theo phòng", "Theo vật liệu", xuất file… tự cập nhật theo.
import { supabase } from './supabase'
import { CATEGORIES } from './codes'
import { roomPages } from './roomPages'
import type { ProjectData } from './useProject'
import type { Entry, Occurrence, Room } from './types'

/** Hạng mục thường PHẢI có theo loại phòng (ô trống sẽ báo thiếu); phòng có thể đánh dấu "không cần" từng ô */
const BASE = ['floor', 'wall', 'ceiling', 'door', 'lighting']
export const REQUIRED: Record<string, string[]> = {
  office: [...BASE, 'loose'], meeting: [...BASE, 'loose'], dining: [...BASE, 'loose'], pantry: [...BASE, 'loose'], lounge_training: [...BASE, 'loose'],
  locker_wc: [...BASE, 'sanitary'], corridor: BASE, storage: ['floor', 'ceiling', 'door', 'lighting'], clinic: [...BASE, 'loose'], other: BASE,
}
export const requiredOf = (r: Room) => (REQUIRED[r.room_type] ?? BASE).filter(k => !(r.matrix_na ?? []).includes(k))

export type RoomState = 'render' | 'norender' | 'none'
export type Row = { room: Room; state: RoomState; renders: number; cells: Map<string, Entry[]>; need: string[]; missing: string[]; total: number }

const catOf = (o: Occurrence, e: Entry) => o.category ?? e.category ?? ''
export function buildMatrix(d: ProjectData): Row[] {
  const byId = new Map(d.entries.filter(e => e.status !== 'rejected').map(e => [e.id, e]))
  const occByRoom = new Map<string, Occurrence[]>()
  for (const o of d.occ) if (o.room_id) occByRoom.set(o.room_id, [...(occByRoom.get(o.room_id) ?? []), o])
  return d.rooms.map(room => {
    const cells = new Map<string, Entry[]>()
    for (const o of occByRoom.get(room.id) ?? []) {
      const e = byId.get(o.entry_id); if (!e) continue
      const k = catOf(o, e); const arr = cells.get(k) ?? []
      if (!arr.some(x => x.id === e.id)) { arr.push(e); cells.set(k, arr) }
    }
    const renders = roomPages(d.pages, room.id).filter(p => p.kind === 'render').length
    const state: RoomState = room.matrix_flag === 'none' ? 'none' : renders ? 'render' : 'norender'
    const need = requiredOf(room), missing = need.filter(k => !(cells.get(k)?.length))
    return { room, state, renders, cells, need, missing, total: [...cells.values()].reduce((s, a) => s + a.length, 0) }
  })
}

const nextCode = (rooms: Room[]) => 'R' + String(Math.max(0, ...rooms.map(r => parseInt(r.code.replace(/\D/g, '') || '0', 10))) + 1).padStart(2, '0')

/** Sao chép vật liệu giữa phòng: chỉ thêm VỊ TRÍ (mã dùng chung) – không sao chép ảnh phối cảnh của phòng gốc. Trả số vị trí đã thêm */
export async function copyCells(d: ProjectData, fromId: string, toId: string, cats: string[]): Promise<number> {
  const rows = buildMatrix(d); const from = rows.find(r => r.room.id === fromId), to = rows.find(r => r.room.id === toId)
  if (!from || !to) return 0
  const add: Record<string, unknown>[] = []
  for (const c of cats) for (const e of from.cells.get(c) ?? []) {
    if (!(to.cells.get(c) ?? []).some(x => x.id === e.id)) add.push({ entry_id: e.id, room_id: toId, category: c, origin: 'manual' })
  }
  if (add.length) { const { error } = await supabase.from('occurrences').insert(add); if (error) throw new Error(error.message) }
  return add.length
}
export async function addToCell(roomId: string, e: Entry, cat: string) {
  const { error } = await supabase.from('occurrences').insert({ entry_id: e.id, room_id: roomId, category: cat, origin: 'manual' }); if (error) throw new Error(error.message)
}
/** Bỏ mã khỏi ô (xoá các vị trí của mã trong phòng thuộc hạng mục này). Trả số ảnh phối cảnh bị bỏ kèm */
export const shotsIn = (d: ProjectData, roomId: string, e: Entry, cat: string) => d.occ.filter(o => o.room_id === roomId && o.entry_id === e.id && catOf(o, e) === cat && (o.page_id || o.view)).length
export async function removeFromCell(d: ProjectData, roomId: string, e: Entry, cat: string) {
  const ids = d.occ.filter(o => o.room_id === roomId && o.entry_id === e.id && catOf(o, e) === cat).map(o => o.id)
  if (!ids.length) return
  const { error } = await supabase.from('occurrences').delete().in('id', ids); if (error) throw new Error(error.message)
}
export async function createRoom(d: ProjectData, v: { name_vn: string; name_en: string; room_type: string }, copyFrom?: string): Promise<Room> {
  if (!d.project) throw new Error('Chưa tải dự án')
  const sort = Math.max(0, ...d.rooms.map(r => r.sort ?? 0)) + 1
  const { data, error } = await supabase.from('rooms').insert({ project_id: d.project.id, code: nextCode(d.rooms), name_vn: v.name_vn, name_en: v.name_en || null, room_type: v.room_type, sort }).select().single()
  if (error) throw new Error(error.message)
  const room = data as Room
  if (copyFrom) await copyCells({ ...d, rooms: [...d.rooms, room] }, copyFrom, room.id, CATEGORIES.map(c => c.key))
  return room
}
export const updateRoom = async (id: string, patch: Partial<Room>) => { const { error } = await supabase.from('rooms').update(patch).eq('id', id); if (error) throw new Error(error.message) }

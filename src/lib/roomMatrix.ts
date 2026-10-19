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

/** Tầng (theo bộ mặt bằng khách sạn): thấp ở trên, cao dần xuống dưới */
export const FLOORS: { key: string; vn: string }[] = [
  { key: 'B2', vn: 'Tầng hầm B2' }, { key: 'B1', vn: 'Tầng hầm B1' }, { key: 'T1', vn: 'Tầng 1' }, { key: 'TL', vn: 'Tầng lửng' }, { key: 'T2', vn: 'Tầng 2' }, { key: 'T3', vn: 'Tầng 3' },
  { key: 'T4-7', vn: 'Tầng 4–7' }, { key: 'T8', vn: 'Tầng 8' }, { key: 'T9-17', vn: 'Tầng 9–17' }, { key: 'ALL', vn: 'Dùng chung / điển hình nhiều tầng' },
]
/** Thứ tự tầng: tên trong danh sách mẫu theo thứ tự mẫu; tên tự gõ ("Tầng 5", "B1", "5") xếp theo số (hầm trước, thấp → cao); không đọc được số thì xuống cuối */
export const floorRank = (f?: string | null) => {
  if (!f) return 10000
  const i = FLOORS.findIndex(x => x.key === f); if (i >= 0) return i
  const s = f.trim().toLowerCase(), b = s.match(/^(?:b|hầm|ham|tầng hầm|tang ham)\s*(\d+)/), n = s.match(/(\d+)/)
  if (b) return 100 - Number(b[1])
  if (/lửng|lung/.test(s)) return 100.5
  if (n) return 100 + Number(n[1])
  return 5000
}
export const floorLabel = (f?: string | null) => !f ? 'Chưa gán tầng' : (FLOORS.find(x => x.key === f)?.vn ?? f)
/** Các tên tầng đang dùng trong dự án + tên mẫu, để gợi ý khi gõ */
export const floorOptions = (used: (string | null | undefined)[]) => {
  const seen = new Set<string>(), out: { key: string; label: string }[] = []
  for (const k of [...used.filter(Boolean) as string[]].sort((a, b) => floorRank(a) - floorRank(b))) if (!seen.has(k)) { seen.add(k); out.push({ key: k, label: floorLabel(k) }) }
  return out
}

export type RoomState = 'render' | 'norender' | 'none'
export type Row = { room: Room; state: RoomState; renders: number; cells: Map<string, Entry[]>; need: string[]; missing: string[]; total: number }

const catOf = (o: Occurrence, e: Entry) => o.category ?? e.category ?? ''
export function buildMatrix(d: ProjectData): Row[] {
  const byId = new Map(d.entries.filter(e => e.status !== 'rejected').map(e => [e.id, e]))
  const occByRoom = new Map<string, Occurrence[]>()
  for (const o of d.occ) if (o.room_id) occByRoom.set(o.room_id, [...(occByRoom.get(o.room_id) ?? []), o])
  const ord = (r: Room) => r.matrix_sort ?? 1e6 + (r.sort ?? 0)   // thứ tự riêng của bảng này; phòng mới chưa xếp thì xuống cuối theo thứ tự gốc
  return [...d.rooms].sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || ord(a) - ord(b)).map(room => {
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

/** Nhóm mã là "đồ/thiết bị" (mã lớn); vật liệu cấu tạo bên trong (EWD, MTL, FAB…) được ghi ở cột KÍ HIỆU VL của mã lớn */
const ITEM_GROUPS = new Set(['FF', 'JN', 'EQ', 'LT', 'SF', 'BA', 'AW', 'DC', 'WT', 'SN', 'FH'])
const SYM_RE = /[A-Za-z]{2,5}-\d{1,3}/g
/** Trong MỘT ô (phòng × hạng mục): mã con = (a) có parent_id trỏ tới mã lớn cùng ô, hoặc (b) là vật liệu mà mã lớn (đồ/thiết bị) cùng ô ghi trong "Kí hiệu VL".
 *  Bảng chỉ hiện mã lớn; mã con xem khi mở ô / mở mã lớn. CHỈ ảnh hưởng hiển thị – dữ liệu và việc tính thiếu/đủ không đổi. */
export function cellTree(es: Entry[], sym: (e: Entry) => string): { top: Entry[]; kids: Map<string, Entry[]> } {
  const kids = new Map<string, Entry[]>(), hidden = new Set<string>()
  const refs = new Map<string, Set<string>>()
  for (const p of es) if (ITEM_GROUPS.has(p.group_code)) refs.set(p.id, new Set((p.product_code ?? '').match(SYM_RE)?.map(x => x.toUpperCase()) ?? []))
  const add = (pid: string, e: Entry) => { hidden.add(e.id); kids.set(pid, [...(kids.get(pid) ?? []), e]) }
  for (const e of es) {
    const par = e.parent_id ? es.find(x => x.id === e.parent_id) : undefined
    if (par) { add(par.id, e); continue }
    if (ITEM_GROUPS.has(e.group_code)) continue
    const keys = [sym(e), e.code].map(x => x.toUpperCase())
    const owner = es.find(p => p.id !== e.id && keys.some(k => refs.get(p.id)?.has(k)))
    if (owner) add(owner.id, e)
  }
  return { top: es.filter(e => !hidden.has(e.id)), kids }
}

const nextCode = (rooms: Room[]) => 'R' + String(Math.max(0, ...rooms.map(r => parseInt(r.code.replace(/\D/g, '') || '0', 10))) + 1).padStart(2, '0')

/** Đánh lại số R01, R02… theo đúng thứ tự hiển thị (tầng thấp → cao, rồi thứ tự trong tầng) và ghi cùng thứ tự vào rooms.sort / matrix_sort
 *  để mọi tab đều thấy cùng một thứ tự. CHỈ đổi chữ mã + thứ tự – không đụng dữ liệu vật liệu/ảnh của phòng (gắn theo id, không theo mã). */
export async function renumberRooms(projectId: string): Promise<number> {
  const { data, error } = await supabase.from('rooms').select('id,code,sort,matrix_sort,floor').eq('project_id', projectId)
  if (error) throw new Error(error.message)
  const rs = (data ?? []) as Pick<Room, 'id' | 'code' | 'sort' | 'matrix_sort' | 'floor'>[]
  const ord = (r: (typeof rs)[number]) => r.matrix_sort ?? 1e6 + (r.sort ?? 0)
  const num = (c: string) => parseInt(c.replace(/\D/g, '') || '0', 10)
  rs.sort((a, b) => floorRank(a.floor) - floorRank(b.floor) || ord(a) - ord(b) || num(a.code) - num(b.code))
  const todo = rs.map((r, i) => ({ r, i, code: 'R' + String(i + 1).padStart(2, '0') })).filter(({ r, i, code }) => r.code !== code || r.sort !== i || r.matrix_sort !== i)
  const res = await Promise.all(todo.map(({ r, i, code }) => supabase.from('rooms').update({ code, sort: i, matrix_sort: i }).eq('id', r.id)))
  const bad = res.find(x => x.error); if (bad?.error) throw new Error(bad.error.message)
  return todo.length
}

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
/** Chuyển mã sang hạng mục (cột) khác TRONG CÙNG PHÒNG: chỉ đổi hạng mục của các vị trí của mã trong phòng này (giữ ảnh khoanh, không ảnh hưởng phòng khác / thông tin mã) */
export async function moveToCategory(d: ProjectData, roomId: string, e: Entry, from: string, to: string) {
  const ids = d.occ.filter(o => o.room_id === roomId && o.entry_id === e.id && catOf(o, e) === from).map(o => o.id)
  if (!ids.length) return 0
  const { error } = await supabase.from('occurrences').update({ category: to }).in('id', ids); if (error) throw new Error(error.message)
  return ids.length
}
/** Chuyển mã (kèm ảnh khoanh) của ô này sang phòng khác */
export async function moveToRoom(d: ProjectData, fromRoom: string, toRoom: string, e: Entry, cat: string) {
  const ids = d.occ.filter(o => o.room_id === fromRoom && o.entry_id === e.id && catOf(o, e) === cat).map(o => o.id)
  if (!ids.length) return
  const { error } = await supabase.from('occurrences').update({ room_id: toRoom }).in('id', ids); if (error) throw new Error(error.message)
}
export async function createRoom(d: ProjectData, v: { name_vn: string; name_en: string; room_type: string; floor?: string }, copyFrom?: string): Promise<Room> {
  if (!d.project) throw new Error('Chưa tải dự án')
  const sort = Math.max(0, ...d.rooms.map(r => r.sort ?? 0)) + 1
  const { data, error } = await supabase.from('rooms').insert({ project_id: d.project.id, code: nextCode(d.rooms), name_vn: v.name_vn, name_en: v.name_en || null, room_type: v.room_type, floor: v.floor || null, sort }).select().single()
  if (error) throw new Error(error.message)
  let room = data as Room
  await renumberRooms(d.project.id)
  room = { ...room, code: (await supabase.from('rooms').select('code').eq('id', room.id).single()).data?.code ?? room.code }
  if (copyFrom) await copyCells({ ...d, rooms: [...d.rooms, room] }, copyFrom, room.id, CATEGORIES.map(c => c.key))
  return room
}
export const updateRoom = async (id: string, patch: Partial<Room>) => {
  const { data, error } = await supabase.from('rooms').update(patch).eq('id', id).select('project_id').single(); if (error) throw new Error(error.message)
  if ('floor' in patch && data) await renumberRooms(data.project_id)   // đổi tầng → phòng chuyển nhóm → đánh lại số
}

/** Đổi thứ tự phòng CHỈ trong bảng Tổng hợp phòng (cột matrix_sort) – không đụng rooms.sort của các bảng khác */
export async function moveRoomRow(rows: Row[], id: string, toIndex: number) {
  const ids = rows.map(r => r.room.id), from = ids.indexOf(id); if (from < 0) return
  const fl = rows[from].room.floor ?? null, tgt = rows[Math.max(0, Math.min(rows.length - 1, toIndex))]
  if ((tgt.room.floor ?? null) !== fl) throw new Error('Phòng thuộc tầng khác – muốn chuyển tầng thì bấm ✎ và đổi “Tầng”.')
  ids.splice(from, 1); ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id)
  const changed = ids.map((rid, i) => ({ rid, i })).filter(({ rid, i }) => rows.find(r => r.room.id === rid)!.room.matrix_sort !== i)
  const res = await Promise.all(changed.map(({ rid, i }) => supabase.from('rooms').update({ matrix_sort: i }).eq('id', rid)))
  const bad = res.find(r => r.error); if (bad?.error) throw new Error(bad.error.message)
  await renumberRooms(rows[0].room.project_id)
}
/** Xoá phòng (kéo theo các vị trí vật liệu / ảnh khoanh của phòng; trang concept chỉ bị bỏ gán phòng). Hoàn tác được bằng nút ↶ */
export async function deleteRoom(id: string) {
  const { data: r } = await supabase.from('rooms').select('project_id').eq('id', id).single()
  const { error } = await supabase.from('rooms').delete().eq('id', id); if (error) throw new Error(error.message)
  if (r) await renumberRooms(r.project_id)   // xoá/thêm → số R tự dồn lại liên tục, từ bé đến lớn
}

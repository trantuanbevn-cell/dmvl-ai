import type { Room, Page, Occurrence } from './types'

export type Loc = { room: Room; pages: number[]; n: number; qty: number | null }

/** Vị trí đầy đủ của một mã: mọi phòng có xuất hiện, kèm số trang concept và số lần/ SL ghi nhận trong phòng */
export function locationsOf(entryId: string, occ: Occurrence[], rooms: Room[], pages: Page[]): Loc[] {
  const roomById = new Map(rooms.map(r => [r.id, r]))
  const pageById = new Map(pages.map(p => [p.id, p]))
  const map = new Map<string, Loc>()
  for (const o of occ) {
    if (o.entry_id !== entryId || !o.room_id) continue
    const room = roomById.get(o.room_id); if (!room) continue
    const l = map.get(room.id) ?? { room, pages: [], n: 0, qty: null }
    l.n++
    const pg = o.page_id ? pageById.get(o.page_id) : undefined
    if (pg && !l.pages.includes(pg.page_no)) l.pages.push(pg.page_no)
    if (o.qty != null) l.qty = (l.qty ?? 0) + o.qty
    map.set(room.id, l)
  }
  return [...map.values()].sort((a, b) => a.room.code.localeCompare(b.room.code, undefined, { numeric: true })).map(l => ({ ...l, pages: l.pages.sort((a, b) => a - b) }))
}

/** Dòng chữ cho xuất Excel/PDF: "R01 – Văn phòng chung (tr.5, 6)" */
export function locationLines(locs: Loc[], vn: boolean): string[] {
  return locs.map(l => `${l.room.code} – ${vn ? l.room.name_vn : l.room.name_en || l.room.name_vn}${l.pages.length ? ` (${vn ? 'tr.' : 'p.'}${l.pages.join(', ')})` : ''}`)
}

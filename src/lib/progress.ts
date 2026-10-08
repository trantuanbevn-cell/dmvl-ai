import { roomPages, roomRect, rectBg } from './roomPages'
import type { ProjectData } from './useProject'
import type { Room, Page } from './types'

export type RoomState = 'none' | 'todo' | 'done'
export type RoomStat = {
  room: Room; pages: Page[]; hero?: Page; total: number; approved: number; pending: number; review: number; inferred: number; qtyWarn: number
  state: RoomState; analyzed: boolean; entryIds: string[]
}

export function heroStyle(d: ProjectData, p: Page | undefined, roomId: string, ar = 16 / 9): React.CSSProperties | undefined {
  const url = heroUrl(d, p); if (!url || !p) return undefined
  const r = roomRect(p, roomId)
  return r ? rectBg(url, p, r, ar) : { backgroundImage: `url("${url}")` }
}
export function heroUrl(d: ProjectData, p?: Page): string | undefined { return p ? d.urls[p.thumb_path ?? p.image_path] : undefined }

/** Tiến độ từng phòng: số mã, đã xác nhận, chờ duyệt… (mã bị loại không tính) */
export function roomStats(d: ProjectData): Map<string, RoomStat> {
  const entryById = new Map(d.entries.map(e => [e.id, e]))
  const out = new Map<string, RoomStat>()
  for (const room of d.rooms) {
    const pages = roomPages(d.pages, room.id)
    const renders = pages.filter(p => p.kind === 'render')
    const hero = renders[0] ?? pages.find(p => p.kind === 'plan') ?? pages[0]
    const ids = [...new Set(d.occ.filter(o => o.room_id === room.id).map(o => o.entry_id))]
    const es = ids.map(id => entryById.get(id)).filter(e => e && e.status !== 'rejected') as NonNullable<ReturnType<typeof entryById.get>>[]
    const approved = es.filter(e => e.status === 'approved').length
    out.set(room.id, {
      room, pages, hero, total: es.length, approved,
      pending: es.filter(e => e.status === 'pending').length, review: es.filter(e => e.status === 'review').length,
      inferred: es.filter(e => e.source === 'inferred' && e.status !== 'approved').length,
      qtyWarn: es.filter(e => e.qty_flag !== 'ok').length,
      state: !es.length ? 'none' : approved === es.length ? 'done' : 'todo',
      analyzed: room.analysis_status === 'done' || es.length > 0, entryIds: es.map(e => e.id),
    })
  }
  return out
}

export function projectStats(d: ProjectData) {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const approved = live.filter(e => e.status === 'approved').length
  return {
    total: live.length, approved, pending: live.filter(e => e.status === 'pending').length, review: live.filter(e => e.status === 'review').length,
    pct: live.length ? Math.round((approved / live.length) * 100) : 0,
    qtyWarn: live.filter(e => e.qty_flag !== 'ok').length, noBrand: live.filter(e => !e.product_code && e.group_code !== 'ME').length,
  }
}

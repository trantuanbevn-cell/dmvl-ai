// Gộp / đặt tên không gian trên mặt bằng gốc. Phép gộp lưu theo TÂM các phòng kín gốc nên vẫn đúng khi bản vẽ được tính lại.
import type { FloorGeom, FloorRoom, ZoneMerge } from './types'

export const roomPolys = (r: FloorRoom): number[][][] => r.polys ?? [r.poly]
const inPoly = (poly: number[][], x: number, y: number) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c
  return c
}
/** điểm (toạ độ chuẩn hoá 0..1) có nằm trong không gian (kể cả không gian gộp từ nhiều phòng) */
export const inRoom = (r: FloorRoom, x: number, y: number) => roomPolys(r).some(p => inPoly(p, x, y))

export function applyMerges(raw: FloorRoom[], merges: ZoneMerge[]): FloorRoom[] {
  const used = new Set<number>(), out: FloorRoom[] = []
  merges.forEach((m, mi) => {
    const mem: FloorRoom[] = []
    for (const [x, y] of m.members) {
      let best: FloorRoom | null = null, bd = 0.03
      for (const r of raw) { if (used.has(r.id)) continue; const d = Math.hypot(r.cx - x, r.cy - y); if (d < bd) { bd = d; best = r } }
      if (best) { mem.push(best); used.add(best.id) }
    }
    if (!mem.length) return
    const area = mem.reduce((s, r) => s + r.area_m2, 0)
    const names = [m.name, ...(m.name_en ? [m.name_en] : [])]
    const big = mem.reduce((a, b) => (b.area_m2 > a.area_m2 ? b : a))
    out.push({
      id: 1000 + mi, area_m2: +area.toFixed(2), poly: big.poly, polys: mem.map(r => r.poly),
      cx: mem.reduce((s, r) => s + r.cx * r.area_m2, 0) / area, cy: mem.reduce((s, r) => s + r.cy * r.area_m2, 0) / area,
      names, user: true, merged: mem.map(r => r.id), label_area: mem.length === 1 ? mem[0].label_area : undefined,
    })
  })
  for (const r of raw) if (!used.has(r.id)) out.push(r)
  return out.sort((a, b) => a.id - b.id)
}

/** Ghi lại phép gộp: bỏ các phép gộp cũ có chung phòng rồi thêm phép mới */
export function addMerge(g: FloorGeom, m: ZoneMerge): FloorGeom {
  const raw = g.raw_rooms ?? g.rooms
  const key = (p: [number, number]) => raw.find(r => Math.hypot(r.cx - p[0], r.cy - p[1]) < 0.03)?.id
  const mine = new Set(m.members.map(key).filter((x): x is number => x != null))
  const keep = (g.merges ?? []).filter(o => !o.members.some(p => { const k = key(p); return k != null && mine.has(k) }))
  const merges = [...keep, m]
  return { ...g, raw_rooms: raw, merges, rooms: applyMerges(raw, merges) }
}
export function removeMerge(g: FloorGeom, roomId: number): FloorGeom {
  const raw = g.raw_rooms ?? g.rooms
  const room = g.rooms.find(r => r.id === roomId); if (!room?.user) return g
  const ids = new Set(room.merged ?? [])
  const merges = (g.merges ?? []).filter(m => !m.members.some(p => { const r = raw.find(x => Math.hypot(x.cx - p[0], x.cy - p[1]) < 0.03); return r && ids.has(r.id) }))
  return { ...g, raw_rooms: raw, merges, rooms: applyMerges(raw, merges) }
}
export const centroidOf = (g: FloorGeom, ids: number[]): [number, number][] => ids.map(id => g.rooms.find(r => r.id === id)).filter((r): r is FloorRoom => !!r).flatMap(r => (r.merged ? r.merged.map(i => (g.raw_rooms ?? g.rooms).find(x => x.id === i)).filter((x): x is FloorRoom => !!x).map(x => [x.cx, x.cy] as [number, number]) : [[r.cx, r.cy] as [number, number]]))

// Gộp / đặt tên không gian trên mặt bằng gốc. Phép gộp lưu theo TÂM các phòng kín gốc nên vẫn đúng khi bản vẽ được tính lại.
import type { FloorGeom, FloorRoom, ZoneCut, ZoneMerge } from './types'

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

// ---- Chia phòng bằng đường cắt ----
const polyArea = (p: number[][]) => Math.abs(p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0)) / 2
const polyCentroid = (p: number[][]): [number, number] => {
  let a = 0, x = 0, y = 0
  for (let i = 0; i < p.length; i++) { const q = p[i], n = p[(i + 1) % p.length], c = q[0] * n[1] - n[0] * q[1]; a += c; x += (q[0] + n[0]) * c; y += (q[1] + n[1]) * c }
  return Math.abs(a) < 1e-12 ? [p[0][0], p[0][1]] : [x / (3 * a), y / (3 * a)]
}
/** Cắt đa giác bằng đường thẳng qua a,b (kéo dài hết phòng). Trả về 2 đa giác, hoặc null nếu đường không cắt ngang phòng */
export function splitPolygon(poly: number[][], a: [number, number], b: [number, number]): [number[][], number[][]] | null {
  const n = poly.length, dx = b[0] - a[0], dy = b[1] - a[1]
  const hits: { t: number; i: number; pt: number[] }[] = []
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n], ex = q[0] - p[0], ey = q[1] - p[1], den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-14) continue
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den
    if (u >= 0 && u < 1) hits.push({ t, i, pt: [a[0] + t * dx, a[1] + t * dy] })
  }
  hits.sort((m, k) => m.t - k.t)
  let pair: [typeof hits[number], typeof hits[number]] | null = null
  for (let k = 0; k + 1 < hits.length; k++) {
    const mt = (hits[k].t + hits[k + 1].t) / 2
    if (!inPoly(poly, a[0] + mt * dx, a[1] + mt * dy)) continue
    if (hits[k].t <= 0.5 && hits[k + 1].t >= 0.5) { pair = [hits[k], hits[k + 1]]; break }
    pair ??= [hits[k], hits[k + 1]]
  }
  if (!pair) return null
  let [h1, h2] = pair; if (h1.i > h2.i) [h1, h2] = [h2, h1]
  if (h1.i === h2.i) return null
  const A = [h1.pt, ...poly.slice(h1.i + 1, h2.i + 1), h2.pt], B = [h2.pt, ...poly.slice(h2.i + 1), ...poly.slice(0, h1.i + 1), h1.pt]
  return polyArea(A) < 1e-7 || polyArea(B) < 1e-7 ? null : [A, B]
}
/** Áp lần lượt các đường cắt lên các phòng kín gốc (phòng bị cắt thành 2 phòng mới, diện tích chia theo tỉ lệ hình học) */
export function applyCuts(base: FloorRoom[], cuts: ZoneCut[]): FloorRoom[] {
  let rooms = base.map(r => ({ ...r }))
  for (const c of cuts) {
    const mid: [number, number] = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2]
    const room = rooms.find(r => r.poly && inPoly(r.poly, mid[0], mid[1])) ?? rooms.find(r => r.poly && inPoly(r.poly, c.a[0], c.a[1]))
    if (!room) continue
    const sp = splitPolygon(room.poly, c.a, c.b); if (!sp) continue
    const tot = polyArea(sp[0]) + polyArea(sp[1]), maxId = rooms.reduce((m, r) => Math.max(m, r.id), 0)
    const mk = (poly: number[][], id: number): FloorRoom => { const [cx, cy] = polyCentroid(poly); return { id, area_m2: +(room.area_m2 * polyArea(poly) / tot).toFixed(2), poly, cx, cy, names: [] } }
    rooms = rooms.filter(r => r !== room).concat([mk(sp[0], maxId + 1), mk(sp[1], maxId + 2)])
  }
  return rooms.sort((a, b) => a.id - b.id)
}
/** Thêm đường cắt vào bản vẽ (giữ phòng gốc để có thể bỏ cắt) */
export function addCut(g: FloorGeom, cut: ZoneCut): FloorGeom | null {
  const base = g.uncut_rooms ?? g.raw_rooms ?? g.rooms, cuts = [...(g.cuts ?? []), cut]
  const raw = applyCuts(base, cuts)
  if (raw.length === (g.raw_rooms ?? g.rooms).length) return null
  return rebuild({ ...g, uncut_rooms: base, cuts }, raw)
}
export function removeCut(g: FloorGeom, i: number): FloorGeom {
  const base = g.uncut_rooms ?? g.raw_rooms ?? g.rooms, cuts = (g.cuts ?? []).filter((_, k) => k !== i)
  return rebuild({ ...g, uncut_rooms: base, cuts }, applyCuts(base, cuts))
}
/** Đổi bộ phòng gốc: bỏ các phép gộp không còn khớp phòng nào, tính lại phòng đã gộp */
function rebuild(g: FloorGeom, raw: FloorRoom[]): FloorGeom {
  const ok = (p: [number, number]) => raw.some(r => Math.hypot(r.cx - p[0], r.cy - p[1]) < 0.03)
  const merges = (g.merges ?? []).filter(m => m.members.every(ok))
  return { ...g, raw_rooms: raw, merges, rooms: applyMerges(raw, merges) }
}

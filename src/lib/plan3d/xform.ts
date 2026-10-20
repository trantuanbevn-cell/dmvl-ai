/** Biến đổi (dời / xoay / co giãn / sao chép) cho đối tượng đang chọn + dựng hình cung, tròn, chữ nhật */
import { kindOf, polyArea, uid, type Model, type Pt, type Wall } from './model'

export type SelRef = { t: 'wall' | 'door' | 'room' | 'dim' | 'furn' | 'axis'; id: string }
export type Xf = { p: (q: Pt) => Pt; dAng: number; k: number }
export type Shape = 'line' | 'arc' | 'circle' | 'rect'

export const mkMove = (dx: number, dy: number): Xf => ({ p: q => [q[0] + dx, q[1] + dy], dAng: 0, k: 1 })
export const mkRot = (c: Pt, a: number): Xf => { const co = Math.cos(a), si = Math.sin(a); return { p: q => [c[0] + (q[0] - c[0]) * co - (q[1] - c[1]) * si, c[1] + (q[0] - c[0]) * si + (q[1] - c[1]) * co], dAng: a, k: 1 } }
export const mkScale = (c: Pt, k: number): Xf => ({ p: q => [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k], dAng: 0, k })

const bboxC = (ps: Pt[]): Pt => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const q of ps) { a = Math.min(a, q[0]); c = Math.max(c, q[0]); b = Math.min(b, q[1]); d = Math.max(d, q[1]) } return [(a + c) / 2, (b + d) / 2] }

export function selCenter(M: Model, s: SelRef): Pt | null {
  if (s.t === 'wall') { const w = M.walls.find(x => x.id === s.id); if (!w) return null; return w.shape.type === 'poly' ? bboxC(w.shape.rings.flat()) : [(w.shape.a[0] + w.shape.b[0]) / 2, (w.shape.a[1] + w.shape.b[1]) / 2] }
  if (s.t === 'door') { const d = M.doors.find(x => x.id === s.id); return d ? [d.x, d.y] : null }
  if (s.t === 'furn') { const f = (M.furn ?? []).find(x => x.id === s.id); return f ? [f.x, f.y] : null }
  if (s.t === 'room') { const r = (M.rooms ?? []).find(x => x.id === s.id); return r ? bboxC(r.poly) : null }
  if (s.t === 'axis') { const a = (M.axes ?? []).find(x => x.id === s.id); return a ? (a.dir === 'v' ? [a.pos, 0] : [0, a.pos]) : null }
  const d = (M.dims ?? []).find(x => x.id === s.id); return d ? [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2] : null
}

/** Áp biến đổi lên đối tượng; copy = true thì tạo bản sao (giữ bản gốc) và trả về mã bản sao */
export function applyXf(M: Model, s: SelRef, xf: Xf, copy: boolean): { M: Model; sel: SelRef } {
  const nid = (p: string) => (copy ? uid(p) : s.id)
  if (s.t === 'wall') {
    const w = M.walls.find(x => x.id === s.id); if (!w) return { M, sel: s }
    const n: Wall = { ...w, id: nid('w'), auto: copy ? false : w.auto, shape: w.shape.type === 'poly' ? { type: 'poly', rings: w.shape.rings.map(r => r.map(xf.p)) } : { ...w.shape, a: xf.p(w.shape.a), b: xf.p(w.shape.b), t: w.shape.t * xf.k, bulge: w.shape.bulge ? w.shape.bulge * xf.k : undefined } }
    return { M: { ...M, walls: copy ? [...M.walls, n] : M.walls.map(x => (x.id === s.id ? n : x)) }, sel: { t: 'wall', id: n.id } }
  }
  if (s.t === 'door') {
    const d = M.doors.find(x => x.id === s.id); if (!d) return { M, sel: s }
    const q = xf.p([d.x, d.y]), n = { ...d, id: nid('d'), x: q[0], y: q[1], ang: d.ang + xf.dAng, w: d.w * xf.k, auto: copy ? false : d.auto }
    return { M: { ...M, doors: copy ? [...M.doors, n] : M.doors.map(x => (x.id === s.id ? n : x)) }, sel: { t: 'door', id: n.id } }
  }
  if (s.t === 'furn') {
    const f = (M.furn ?? []).find(x => x.id === s.id); if (!f) return { M, sel: s }
    const q = xf.p([f.x, f.y]), n = { ...f, id: nid('f'), x: q[0], y: q[1], ang: f.ang + xf.dAng, w: f.w * xf.k, d: f.d * xf.k, auto: copy ? false : f.auto }
    return { M: { ...M, furn: copy ? [...(M.furn ?? []), n] : (M.furn ?? []).map(x => (x.id === s.id ? n : x)) }, sel: { t: 'furn', id: n.id } }
  }
  if (s.t === 'room') {
    const r = (M.rooms ?? []).find(x => x.id === s.id); if (!r) return { M, sel: s }
    const n = { ...r, id: nid('r'), name: copy ? r.name + ' (bản sao)' : r.name, poly: r.poly.map(xf.p), area: xf.k === 1 ? r.area : undefined }
    return { M: { ...M, rooms: copy ? [...(M.rooms ?? []), n] : (M.rooms ?? []).map(x => (x.id === s.id ? n : x)) }, sel: { t: 'room', id: n.id } }
  }
  if (s.t === 'axis') {
    const a = (M.axes ?? []).find(x => x.id === s.id); if (!a) return { M, sel: s }
    const n = { ...a, id: nid('x'), auto: false, name: copy ? a.name + "'" : a.name, pos: a.dir === 'v' ? xf.p([a.pos, 0])[0] : xf.p([0, a.pos])[1] }
    return { M: { ...M, axes: copy ? [...(M.axes ?? []), n] : (M.axes ?? []).map(x => (x.id === s.id ? n : x)) }, sel: { t: 'axis', id: n.id } }
  }
  const d = (M.dims ?? []).find(x => x.id === s.id); if (!d) return { M, sel: s }
  const n = { ...d, id: nid('m'), a: xf.p(d.a), b: xf.p(d.b), off: d.off * xf.k }
  return { M: { ...M, dims: copy ? [...(M.dims ?? []), n] : (M.dims ?? []).map(x => (x.id === s.id ? n : x)) }, sel: { t: 'dim', id: n.id } }
}

/** Độ võng (bulge) của cung đi qua 3 điểm a → p → b (cùng quy ước với centerline: đo theo pháp tuyến trái của a→b) */
export function arcBulge(a: Pt, b: Pt, p: Pt): number | null {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], px = p[0], py = p[1]
  const D = 2 * (ax * (by - py) + bx * (py - ay) + px * (ay - by)); if (Math.abs(D) < 1e-9) return null
  const ux = ((ax * ax + ay * ay) * (by - py) + (bx * bx + by * by) * (py - ay) + (px * px + py * py) * (ay - by)) / D
  const uy = ((ax * ax + ay * ay) * (px - bx) + (bx * bx + by * by) * (ax - px) + (px * px + py * py) * (bx - ax)) / D
  const R = Math.hypot(ax - ux, ay - uy), c = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / c, ny = (bx - ax) / c, mx = (ax + bx) / 2, my = (ay + by) / 2
  const sd = (px - mx) * nx + (py - my) * ny, s = sd >= 0 ? 1 : -1
  return (ux - mx) * nx + (uy - my) * ny + s * R
}

/** Các đoạn tường dựng từ hình cung / tròn / chữ nhật (P: 3 điểm cho cung; 2 điểm cho tròn = tâm + điểm trên đường tròn, chữ nhật = 2 góc đối diện) */
export function buildShape(shape: Shape, P: Pt[], kind: string, panel?: number): Wall[] | null {
  const kd = kindOf(kind), mk = (a: Pt, b: Pt, bulge?: number): Wall => ({ id: uid('w'), role: 'wall', kind, panel: kd.glass ? (panel ?? kd.panel) : undefined, shape: { type: 'seg', a, b, t: kd.t, bulge } })
  if (shape === 'arc') { if (P.length < 3) return null; const bu = arcBulge(P[0], P[1], P[2]); if (bu === null || Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]) < 0.1) return null; return [mk(P[0], P[1], Math.abs(bu) < 0.03 ? undefined : bu)] }
  if (P.length < 2) return null
  if (shape === 'circle') { const R = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]); if (R < 0.15) return null; const a: Pt = [P[0][0] - R, P[0][1]], b: Pt = [P[0][0] + R, P[0][1]]; return [mk(a, b, R), mk(b, a, R)] }
  if (shape === 'rect') { const [x0, y0] = P[0], [x1, y1] = P[1]; if (Math.abs(x1 - x0) < 0.1 || Math.abs(y1 - y0) < 0.1) return null; const c: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; return c.map((q, i) => mk(q, c[(i + 1) % 4])) }
  return null
}

/** Đa giác sàn từ hình chữ nhật / tròn */
export function shapePoly(shape: Shape, P: Pt[]): Pt[] | null {
  if (P.length < 2) return null
  if (shape === 'rect') { const [x0, y0] = P[0], [x1, y1] = P[1]; if (Math.abs(x1 - x0) < 0.1 || Math.abs(y1 - y0) < 0.1) return null; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }
  if (shape === 'circle') { const R = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]); if (R < 0.15) return null; return Array.from({ length: 64 }, (_, i) => [P[0][0] + R * Math.cos(i / 64 * 2 * Math.PI), P[0][1] + R * Math.sin(i / 64 * 2 * Math.PI)] as Pt) }
  return null
}
export const polyAreaOf = polyArea

// ───────── Chống xung đột ─────────
import polygonClipping from 'polygon-clipping'
import { footprint, type Axis, type Furn, type Room } from './model'

const ringA = (r: Pt[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a) / 2 }
const bboxOf = (rs: Pt[][]) => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const r of rs) for (const q of r) { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1] } return [a, b, c, d] }
/** Diện tích phần chung của hai vùng (m²) */
export function interArea(A: Pt[][], B: Pt[][]): number {
  const a = bboxOf(A), b = bboxOf(B); if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) return 0
  try { const r = polygonClipping.intersection(A as never, B as never); let s = 0; for (const poly of r) { s += ringA(poly[0]); for (let i = 1; i < poly.length; i++) s -= ringA(poly[i]) } return s } catch { return 0 }
}
/** Sàn mới có đè lên sàn khác không (chỉ chạm biên thì được) → tên phòng bị đè hoặc null */
export function roomOverlap(M: Model, poly: Pt[], excludeId?: string): Room | null {
  for (const r of M.rooms ?? []) { if (r.id === excludeId || r.poly.length < 3) continue; if (interArea([poly], [r.poly]) > 0.02) return r }
  return null
}
const fpCache = new WeakMap<Wall, { rings: Pt[][]; bb: number[] }>()
const wallFp = (w: Wall) => { let c = fpCache.get(w); if (!c) { const rings = footprint(w); c = { rings, bb: bboxOf(rings) }; fpCache.set(w, c) } return c }
export const furnRect = (f: Furn): Pt[] => { const c = Math.cos(f.ang), s = Math.sin(f.ang); return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map(([a, b]) => [f.x + c * a * f.w / 2 - s * b * f.d / 2, f.y + s * a * f.w / 2 + c * b * f.d / 2] as Pt) }
const NO_COLLIDE = new Set(['lift', 'stair', 'spiral', 'stage', 'group', 'rug'])
/** Nội thất có đâm vào tường/cột không (chạm mép thì được) */
export function furnHitsWall(M: Model, f: Furn): Wall | null {
  if (NO_COLLIDE.has(f.kind)) return null
  const R = furnRect(f), bb = bboxOf([R])
  for (const w of M.walls) { const c = wallFp(w); if (c.bb[2] < bb[0] || bb[2] < c.bb[0] || c.bb[3] < bb[1] || bb[3] < c.bb[1]) continue; if (interArea([R], c.rings) > 0.004) return w }
  return null
}

// ───────── Hệ trục cột ─────────
const letter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))
/** Nhận hệ trục từ tâm các cột: những cột thẳng hàng (sai lệch ≤ 120 mm) tạo thành một trục */
export function detectAxes(M: Model): Axis[] {
  const cs: Pt[] = []
  for (const w of M.walls) { if (w.role !== 'col') continue; if (w.shape.type === 'poly') { const bb = bboxOf(w.shape.rings); cs.push([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]) } else cs.push([(w.shape.a[0] + w.shape.b[0]) / 2, (w.shape.a[1] + w.shape.b[1]) / 2]) }
  const cluster = (vals: number[]) => { const s = [...vals].sort((a, b) => a - b), out: { pos: number; n: number }[] = []; let cur: number[] = []
    for (const v of s) { if (cur.length && v - cur[cur.length - 1] > 0.12) { out.push({ pos: cur.reduce((a, b) => a + b, 0) / cur.length, n: cur.length }); cur = [] } cur.push(v) }
    if (cur.length) out.push({ pos: cur.reduce((a, b) => a + b, 0) / cur.length, n: cur.length }); return out.filter(c => c.n >= 2) }
  const xs = cluster(cs.map(c => c[0])), ys = cluster(cs.map(c => c[1]))
  if (xs.length > 40 || ys.length > 40) return []
  return [...xs.map((c, i): Axis => ({ id: uid('x'), dir: 'v', pos: Math.round(c.pos * 1000) / 1000, name: String(i + 1), auto: true })), ...ys.map((c, i): Axis => ({ id: uid('x'), dir: 'h', pos: Math.round(c.pos * 1000) / 1000, name: letter(i), auto: true }))]
}

// ───────── Tự khớp giao điểm khi vẽ tường mới ─────────
import { centerline } from './model'
/** Kéo dài / cắt bớt hai đầu của đoạn tường mới a→b cho vừa khít vào tường cũ (tim tường thêm tay, mép tường DXF).
 *  Chỉ xét giao điểm cách đầu mút ≤ ext (m). Trả về tường cũ bị chạm ở mỗi đầu để kế thừa vật liệu / cao độ. */
export function joinEnds(M: Model, a: Pt, b: Pt, ext = 0.4): { a: Pt; b: Pt; wa?: Wall; wb?: Wall } {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) return { a, b }
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L
  let ba: { d: number; s: number; w: Wall } | null = null, bb: { d: number; s: number; w: Wall } | null = null
  const x0 = Math.min(a[0], b[0]) - ext - 0.5, x1 = Math.max(a[0], b[0]) + ext + 0.5, y0 = Math.min(a[1], b[1]) - ext - 0.5, y1 = Math.max(a[1], b[1]) + ext + 0.5
  for (const w of M.walls) {
    const rings: Pt[][] = w.shape.type === 'poly' ? w.shape.rings.map(r => [...r, r[0]]) : [centerline(w)]
    const bx = bboxOf(rings); if (bx[2] < x0 || bx[0] > x1 || bx[3] < y0 || bx[1] > y1) continue
    for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
      const p = r[i], q = r[i + 1], ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey); if (el < 1e-6) continue
      const den = ux * ey - uy * ex; if (Math.abs(den) / el < 0.17) continue
      const s = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, k = ((p[0] - a[0]) * uy - (p[1] - a[1]) * ux) / den
      if (k < -0.03 || k > 1.03) continue
      if (s >= L / 2) { const d = Math.abs(s - L); if (d <= ext && (!bb || d < bb.d)) bb = { d, s, w } }
      else { const d = Math.abs(s); if (d <= ext && (!ba || d < ba.d)) ba = { d, s, w } }
    }
  }
  const na: Pt = ba ? [a[0] + ux * ba.s, a[1] + uy * ba.s] : a, nb: Pt = bb ? [a[0] + ux * bb.s, a[1] + uy * bb.s] : b
  if (Math.hypot(nb[0] - na[0], nb[1] - na[1]) < 0.05) return { a, b }
  return { a: na, b: nb, wa: ba?.w, wb: bb?.w }
}

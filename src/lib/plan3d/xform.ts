/** Biến đổi (dời / xoay / co giãn / sao chép) cho đối tượng đang chọn + dựng hình cung, tròn, chữ nhật */
import { kindOf, polyArea, uid, type Model, type Pt, type Wall } from './model'

export type SelRef = { t: 'wall' | 'door' | 'room' | 'dim' | 'furn'; id: string }
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

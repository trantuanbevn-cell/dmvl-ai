// Đếm ĐỒ RỜI (bàn, ghế, thiết bị…) trong bản vẽ vector: gom nét của các layer nội thất/thiết bị thành từng vật,
// gom các vật GIỐNG HỆT NHAU (bất kể xoay/lật) thành một nhóm, đếm số lượng theo từng không gian. Không dùng AI.
import type { VecPage } from './vector'
import { isAnnoLayer } from './dims'

export const FURN_RE = /furn|noi ?that|nội ?thất|equip|k-general|k-hood|interior|fixture|sanitary|thiet ?bi|do ?roi/i
export type FurnGroup = { id: number; layer: string; w: number; d: number; n: number; len: number; segs: number } // w,d: kích thước thật (m), len: tổng chiều dài nét (m)
export type Furn = { groups: FurnGroup[]; at: number[][] /* [nhóm, x, y] chuẩn hoá 0..1 */; names: Record<number, string> }

type Comp = { layer: string; len: number; segs: number; cx: number; cy: number; a: number; b: number }

export function detectFurniture(v: VecPage, mPerPt: number): Furn {
  const cls = new Set<number>()
  v.classes.forEach((c, i) => { if (FURN_RE.test(c.layer) && !isAnnoLayer(c.layer) && !/wall|tuong|door|cua/i.test(c.layer)) cls.add(i) })
  // đoạn thẳng: nét + cạnh của vùng tô
  const S: number[] = [], L: number[] = []
  for (let i = 0; i < v.nSeg; i++) if (cls.has(v.cls[i])) { S.push(v.segs[i * 4], v.segs[i * 4 + 1], v.segs[i * 4 + 2], v.segs[i * 4 + 3]); L.push(v.cls[i]) }
  for (const f of v.fills) if (cls.has(f.cls)) for (let i = 0; i + 3 < f.pts.length; i += 2) { S.push(f.pts[i], f.pts[i + 1], f.pts[i + 2], f.pts[i + 3]); L.push(f.cls) }
  const n = L.length
  const par = new Int32Array(n).map((_, i) => i), find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i] } return i }
  const tol = 0.1, cell = new Map<string, number>() // hai đầu nét cách nhau < 0.1 pt coi như nối
  const key = (x: number, y: number) => Math.round(x / tol) + ',' + Math.round(y / tol)
  for (let i = 0; i < n; i++) for (const o of [0, 2]) {
    const x = S[i * 4 + o], y = S[i * 4 + o + 1]
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const j = cell.get(Math.round(x / tol) + dx + ',' + (Math.round(y / tol) + dy)); if (j !== undefined && find(j) !== find(i)) par[find(j)] = find(i) }
    cell.set(key(x, y), i)
  }
  const by = new Map<number, number[]>()
  for (let i = 0; i < n; i++) { const r = find(i); let a = by.get(r); if (!a) by.set(r, a = []); a.push(i) }
  const comps: Comp[] = []
  for (const idx of by.values()) {
    let len = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, w = 0
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (const i of idx) {
      const ax = S[i * 4], ay = S[i * 4 + 1], bx = S[i * 4 + 2], by2 = S[i * 4 + 3], l = Math.hypot(bx - ax, by2 - ay); len += l
      const mx = (ax + bx) / 2, my = (ay + by2) / 2, ww = l + 1e-6; w += ww; sx += mx * ww; sy += my * ww
      x0 = Math.min(x0, ax, bx); x1 = Math.max(x1, ax, bx); y0 = Math.min(y0, ay, by2); y1 = Math.max(y1, ay, by2)
    }
    const cx = sx / w, cy = sy / w
    for (const i of idx) { const mx = (S[i * 4] + S[i * 4 + 2]) / 2 - cx, my = (S[i * 4 + 1] + S[i * 4 + 3]) / 2 - cy, ww = Math.hypot(S[i * 4 + 2] - S[i * 4], S[i * 4 + 3] - S[i * 4 + 1]) + 1e-6; sxx += mx * mx * ww; syy += my * my * ww; sxy += mx * my * ww }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), s = Math.sin(th)
    let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9   // khung chữ nhật theo trục chính (không phụ thuộc hướng xoay)
    for (const i of idx) for (const o of [0, 2]) { const px = S[i * 4 + o] - cx, py = S[i * 4 + o + 1] - cy, u = px * c + py * s, ww = -px * s + py * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, ww); w1 = Math.max(w1, ww) }
    const A = (u1 - u0) * mPerPt, B = (w1 - w0) * mPerPt
    const big = Math.max(A, B), small = Math.min(A, B)
    if (big < 0.15 || big > 5 || len * mPerPt < 0.5 || (x1 - x0) * (y1 - y0) < 1e-6) continue
    comps.push({ layer: v.classes[L[idx[0]]].layer, len: len * mPerPt, segs: idx.length, cx, cy, a: big, b: small })
  }
  // gom nhóm các vật giống nhau
  type G = FurnGroup & { sa: number; sb: number; sl: number; ss: number }
  const groups: G[] = [], at: number[][] = []
  comps.sort((p, r) => r.len - p.len)
  for (const c of comps) {
    let g = groups.find(x => x.layer === c.layer && Math.abs(x.sl / x.n / c.len - 1) < 0.04 && Math.abs(x.ss / x.n - c.segs) <= Math.max(2, 0.06 * c.segs) && Math.abs(x.sa / x.n - c.a) < 0.03 + 0.04 * c.a && Math.abs(x.sb / x.n - c.b) < 0.03 + 0.04 * c.b)
    if (!g) { g = { id: groups.length, layer: c.layer, w: 0, d: 0, n: 0, len: 0, segs: 0, sa: 0, sb: 0, sl: 0, ss: 0 }; groups.push(g) }
    g.n++; g.sa += c.a; g.sb += c.b; g.sl += c.len; g.ss += c.segs
    at.push([g.id, c.cx / v.w, c.cy / v.h])
  }
  const out: FurnGroup[] = groups.map(g => ({ id: g.id, layer: g.layer, w: +(g.sa / g.n).toFixed(2), d: +(g.sb / g.n).toFixed(2), n: g.n, len: +(g.sl / g.n).toFixed(2), segs: Math.round(g.ss / g.n) }))
  return { groups: out, at: at.slice(0, 8000).map(a => [a[0], +a[1].toFixed(5), +a[2].toFixed(5)]), names: {} }
}

/** Đồ rời trong một không gian (đa giác chuẩn hoá): đếm theo nhóm */
export function furnInRoom(f: Furn, inside: (x: number, y: number) => boolean): { group: FurnGroup; n: number }[] {
  const cnt = new Map<number, number>()
  for (const [g, x, y] of f.at) if (inside(x, y)) cnt.set(g, (cnt.get(g) ?? 0) + 1)
  return [...cnt].map(([id, n]) => ({ group: f.groups[id], n })).sort((a, b) => b.n - a.n || b.group.w * b.group.d - a.group.w * a.group.d)
}

/** Chữ (tên thiết bị/đồ ghi trong bản vẽ) trong một không gian: gom theo nội dung */
export function textsInRoom(v: Pick<VecPage, 'texts' | 'w' | 'h'>, inside: (x: number, y: number) => boolean): { t: string; n: number }[] {
  const m = new Map<string, number>()
  for (const t of v.texts) {
    const s = t.t.trim(); if (s.length < 3 || /^[\d.,\s\-+×x*/m²]+$/i.test(s)) continue
    if (inside(t.x / v.w, (t.y - t.h * 0.3) / v.h)) m.set(s, (m.get(s) ?? 0) + 1)
  }
  return [...m].map(([t, n]) => ({ t, n })).sort((a, b) => b.n - a.n)
}

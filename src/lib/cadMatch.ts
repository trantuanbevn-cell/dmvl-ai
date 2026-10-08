// Đối chiếu mặt bằng trong file concept (ảnh) với mặt bằng gốc vector: tìm phép đồng dạng concept(px) → bản vẽ gốc(pt).
// Dựa vào các nhãn "TÊN / S=..M²" của concept (vị trí + diện tích) và các phòng kín của bản vẽ gốc (tâm + diện tích thật + tên chữ).
import type { FloorGeom } from './types'
import type { Transform, Pt } from './plan'
import { applyT } from './plan'
import { norm } from './classify'
import { roomPolys } from './cadZones'

export type ConceptLabel = { label: string; area: number; x: number; y: number }
export type CadMatch = { T: Transform; lambda: number; inliers: number; pairs: { li: number; roomId: number }[]; names: number }

const toks = (s: string) => norm(s).split(' ').filter(w => w.length > 2)
const nameScore = (a: string, bs: string[]) => { const A = new Set(toks(a)); if (!A.size) return 0; let best = 0; for (const b of bs) { const B = toks(b); if (!B.length) continue; let k = 0; for (const w of B) if (A.has(w)) k++; best = Math.max(best, k / Math.max(A.size, B.length)) } return best }

export function inPoly(poly: number[][], x: number, y: number) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c
  return c
}

/** kPxPerM2: ước lượng px²/m² của mặt bằng concept (từ bước tách vùng) – dùng để loại các giả thuyết sai tỉ lệ */
export function matchConceptToCad(labels: ConceptLabel[], g: FloorGeom, kPxPerM2: number): CadMatch | null {
  if (labels.length < 2 || g.rooms.length < 2) return null
  const R = g.rooms.map(r => ({ ...r, X: r.cx * g.w, Y: r.cy * g.h, polys: roomPolys(r).map(pl => pl.map(p => [p[0] * g.w, p[1] * g.h])) }))
  const expLam = kPxPerM2 > 0 ? 1 / Math.sqrt(kPxPerM2) / g.m_per_pt : 0 // pt trên mỗi px
  type Pr = { i: number; j: number; w: number }
  const prs: Pr[] = []
  labels.forEach((l, i) => R.forEach((r, j) => {
    const ratio = l.area / r.area_m2, ns = nameScore(l.label, r.names)
    if ((ratio > 0.75 && ratio < 1.3) || ns >= 0.6) prs.push({ i, j, w: ns >= 0.6 ? 2 : 1 })
  }))
  if (prs.length < 2) return null
  const mk = (a: Pt, b: Pt, c: Pt, d: Pt): Transform | null => {
    const sx = b.x - a.x, sy = b.y - a.y, dx = d.x - c.x, dy = d.y - c.y, den = sx * sx + sy * sy
    if (den < 400) return null
    const A = (sx * dx + sy * dy) / den, B = (sx * dy - sy * dx) / den
    return { a: A, b: B, tx: c.x - (A * a.x - B * a.y), ty: c.y - (B * a.x + A * a.y) }
  }
  let best: { T: Transform; score: number; pairs: { li: number; roomId: number }[]; names: number } | null = null
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const tries = Math.min(4000, prs.length * prs.length * 2)
  for (let t = 0; t < tries; t++) {
    const p = prs[Math.floor(rnd() * prs.length)], q = prs[Math.floor(rnd() * prs.length)]
    if (p.i === q.i || p.j === q.j) continue
    const T = mk(labels[p.i], labels[q.i], { x: R[p.j].X, y: R[p.j].Y }, { x: R[q.j].X, y: R[q.j].Y }); if (!T) continue
    const lam = Math.hypot(T.a, T.b)
    if (expLam && (lam < expLam * 0.6 || lam > expLam * 1.6)) continue
    const used = new Set<number>(), pairs: { li: number; roomId: number }[] = []; let names = 0
    labels.forEach((l, i) => {
      const c = applyT(T, l)
      const r = R.find(rr => !used.has(rr.id) && rr.polys.some(pl => inPoly(pl, c.x, c.y))); if (!r) return
      const ratio = l.area / r.area_m2; if (ratio < 0.45 || ratio > 2.2) return
      used.add(r.id); pairs.push({ li: i, roomId: r.id }); if (nameScore(l.label, r.names) >= 0.6) names++
    })
    const score = pairs.length + names * 0.5
    if (!best || score > best.score) best = { T, score, pairs, names }
  }
  if (!best || best.pairs.length < 2 || (best.pairs.length < 3 && labels.length > 3)) return null
  return { T: best.T, lambda: Math.hypot(best.T.a, best.T.b), inliers: best.pairs.length, pairs: best.pairs, names: best.names }
}

// Nhận diện thang máy / thang bộ / thang xoắn từ NÉT VẼ (không cần layer hay tên khối đúng):
//  - thang bộ: một chùm ≥5 nét song song, bằng nhau, cách đều 0.2–0.4 m (các bậc)
//  - thang xoắn tròn: ≥8 nét toả ra từ một tâm chung, cùng bán kính 0.5–2 m (các bậc hình quạt)
//  - thang máy: hộp 1.2–3.5 m có hai đường chéo cắt nhau tại tâm (ký hiệu chữ X của thang máy)
import type { VecPage } from '../vector'
import type { Furn } from './model'
import { uid } from './model'
import { furnTypeOf } from './furn'

type S = { x0: number; y0: number; x1: number; y1: number; L: number; a: number }
export function detectVertical(v: VecPage, m: number): Furn[] {
  const out: Furn[] = [], n = v.nSeg ?? v.segs.length / 4, segs: S[] = []
  for (let i = 0; i < n; i++) {
    const x0 = v.segs[i * 4] * m, y0 = v.segs[i * 4 + 1] * m, x1 = v.segs[i * 4 + 2] * m, y1 = v.segs[i * 4 + 3] * m, L = Math.hypot(x1 - x0, y1 - y0)
    if (L < 0.35 || L > 4.5) continue
    segs.push({ x0, y0, x1, y1, L, a: ((Math.atan2(y1 - y0, x1 - x0) % Math.PI) + Math.PI) % Math.PI })
  }
  const mk = (kind: string, cx: number, cy: number, w: number, d: number, ang: number, name?: string): Furn => ({ id: uid('f'), kind, name, x: cx, y: cy, w, d, ang, h: furnTypeOf(kind).h, auto: true })
  const taken = (cx: number, cy: number, r: number) => out.some(f => Math.hypot(f.x - cx, f.y - cy) < r)

  // ---- thang máy: cặp đường chéo cắt nhau tại trung điểm chung, bằng nhau, hộp gần vuông
  const diag = segs.filter(s => s.L >= 1.6 && s.L <= 5 && Math.abs(((s.a * 180 / Math.PI) % 90) - 45) < 22)
  const cell = 0.3, gm = new Map<string, S[]>()
  for (const s of diag) { const k = Math.round((s.x0 + s.x1) / 2 / cell) + ',' + Math.round((s.y0 + s.y1) / 2 / cell); (gm.get(k) ?? gm.set(k, []).get(k)!).push(s) }
  for (const s of diag) {
    const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2, cx = Math.round(mx / cell), cy = Math.round(my / cell)
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const t of gm.get(i + ',' + j) ?? []) {
      if (t === s) continue
      if (Math.abs(t.L - s.L) > 0.12 || Math.abs((t.x0 + t.x1) / 2 - mx) > 0.12 || Math.abs((t.y0 + t.y1) / 2 - my) > 0.12) continue
      const da = Math.abs(t.a - s.a); if (Math.min(da, Math.PI - da) < 0.35) continue   // phải cắt chéo nhau
      if (taken(mx, my, 0.5)) continue
      const xs = [s.x0, s.x1, t.x0, t.x1], ys = [s.y0, s.y1, t.y0, t.y1], w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys)
      if (w < 1.1 || d < 1.1 || w > 3.6 || d > 3.6) continue
      out.push(mk('lift', mx, my, w, d, 0, 'Thang máy'))
    }
  }

  // ---- thang xoắn: nét toả tia từ tâm chung
  const rad = segs.filter(s => s.L >= 0.45 && s.L <= 2.2), g2 = new Map<string, { s: S; end: 0 | 1 }[]>(), c2 = 0.12
  for (const s of rad) for (const e of [0, 1] as const) { const x = e ? s.x1 : s.x0, y = e ? s.y1 : s.y0; const k = Math.round(x / c2) + ',' + Math.round(y / c2); (g2.get(k) ?? g2.set(k, []).get(k)!).push({ s, end: e }) }
  const seenC = new Set<string>()
  for (const [k, arr] of g2) {
    const [ix, iy] = k.split(',').map(Number); let all: { s: S; end: 0 | 1 }[] = []
    for (let i = ix - 1; i <= ix + 1; i++) for (let j = iy - 1; j <= iy + 1; j++) all = all.concat(g2.get(i + ',' + j) ?? [])
    if (all.length < 8 || seenC.has(k)) continue
    const cx = ix * c2, cy = iy * c2, rs = all.map(o => o.s.L), r = rs.sort((a, b) => a - b)[Math.floor(rs.length / 2)]
    const good = all.filter(o => Math.abs(o.s.L - r) < r * 0.18 + 0.05)
    // các tia phải phủ nhiều hướng (không phải một chùm song song)
    const dirs = new Set(good.map(o => { const dx = (o.end ? o.s.x1 : o.s.x0) === o.s.x0 ? o.s.x1 - o.s.x0 : o.s.x0 - o.s.x1, dy = (o.end ? o.s.y1 : o.s.y0) === o.s.y0 ? o.s.y1 - o.s.y0 : o.s.y0 - o.s.y1; return Math.round(Math.atan2(dy, dx) / (Math.PI / 8)) }))
    if (good.length < 8 || dirs.size < 6 || taken(cx, cy, r)) continue
    seenC.add(k); out.push(mk('spiral', cx, cy, 2 * r, 2 * r, 0, 'Thang xoắn'))
  }

  // ---- thang bộ: chùm nét song song cách đều
  const byAng = new Map<number, S[]>()
  for (const s of segs) { if (s.L < 0.7 || s.L > 3.2) continue; const k = Math.round(s.a * 180 / Math.PI / 2); (byAng.get(k) ?? byAng.set(k, []).get(k)!).push(s) }
  const used = new Set<S>()
  for (const [k, list0] of byAng) {
    const list = [...list0, ...(byAng.get(k + 1) ?? []), ...(byAng.get(k - 1) ?? [])]
    if (list.length < 5) continue
    const a = list0.reduce((p, s) => p + s.a, 0) / list0.length, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux   // u: dọc nét bậc, n: chiều chạy
    const rows = list0.map(s => ({ s, o: ((s.x0 + s.x1) / 2) * nx + ((s.y0 + s.y1) / 2) * ny, u: ((s.x0 + s.x1) / 2) * ux + ((s.y0 + s.y1) / 2) * uy })).sort((p, q) => p.o - q.o)
    let i = 0
    while (i < rows.length) {
      let j = i; const run = [rows[i]]
      while (j + 1 < rows.length) { const g = rows[j + 1].o - rows[j].o; if (g < 0.01) { j++; continue } if (g < 0.2 || g > 0.4 || Math.abs(rows[j + 1].u - rows[i].u) > 0.3 || Math.abs(rows[j + 1].s.L - rows[i].s.L) > Math.max(0.15, rows[i].s.L * 0.12)) break; run.push(rows[j + 1]); j++ }
      if (run.length >= 5 && run.length <= 24 && !run.some(r => used.has(r.s))) {
        const gaps = run.slice(1).map((r, q) => r.o - run[q].o).filter(g => g > 0.01).sort((p, q) => p - q), med = gaps[Math.floor(gaps.length / 2)]
        if (gaps.every(g => Math.abs(g - med) < med * 0.2)) {
          const o0 = run[0].o, o1 = run[run.length - 1].o, uc = run.reduce((p, r) => p + r.u, 0) / run.length, L = run.reduce((p, r) => p + r.s.L, 0) / run.length, oc = (o0 + o1) / 2, w = o1 - o0 + med
          const cx = ux * uc + nx * oc, cy = uy * uc + ny * oc
          if (!taken(cx, cy, 0.8)) { out.push(mk('stair', cx, cy, w, L, Math.atan2(ny, nx), 'Thang bộ')); run.forEach(r => used.add(r.s)) }
        }
      }
      i = Math.max(j + 1, i + 1)
    }
  }
  return out
}

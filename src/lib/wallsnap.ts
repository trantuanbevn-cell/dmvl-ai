// "Bắt điểm" vào tường thật: cho một cạnh của đường viền (điểm giữa m, hướng d, dài len – đơn vị px), tìm các nét tường VECTOR song song, nằm sát cạnh đó
// và phủ ít nhất ~nửa chiều dài; nếu có thì trả về đường thẳng đúng của tường (cạnh đường viền sẽ trùng mép tường chứ không lệch theo điểm ảnh).
import type { Pt } from './shape'

export type WallSnap = (m: Pt, d: Pt, len: number) => { m: Pt; d: Pt } | null

export function makeWallSnap(S: ArrayLike<number>, tol: number, cell = 32): WallSnap {
  const n = S.length / 4, grid = new Map<number, number[]>()
  let gw = 1
  for (let i = 0; i < n; i++) gw = Math.max(gw, Math.ceil(Math.max(S[i * 4], S[i * 4 + 2]) / cell) + 2)
  for (let i = 0; i < n; i++) {
    const ax = S[i * 4], ay = S[i * 4 + 1], bx = S[i * 4 + 2], by = S[i * 4 + 3]; if (Math.hypot(bx - ax, by - ay) < 0.5) continue
    const ia = Math.floor((Math.min(ax, bx) - tol) / cell), ib = Math.floor((Math.max(ax, bx) + tol) / cell), ja = Math.floor((Math.min(ay, by) - tol) / cell), jb = Math.floor((Math.max(ay, by) + tol) / cell)
    for (let j = Math.max(0, ja); j <= jb; j++) for (let k = Math.max(0, ia); k <= ib; k++) { const key = j * gw + k; let g = grid.get(key); if (!g) grid.set(key, g = []); g.push(i) }
  }
  return (m, d, len) => {
    const nx = -d[1], ny = d[0], hl = len / 2
    const ex = [m[0] - d[0] * hl, m[0] + d[0] * hl], ey = [m[1] - d[1] * hl, m[1] + d[1] * hl]
    const ia = Math.floor((Math.min(ex[0], ex[1]) - tol) / cell), ib = Math.floor((Math.max(ex[0], ex[1]) + tol) / cell), ja = Math.floor((Math.min(ey[0], ey[1]) - tol) / cell), jb = Math.floor((Math.max(ey[0], ey[1]) + tol) / cell)
    const seen = new Set<number>(), C: { off: number; ov: number; dx: number; dy: number }[] = []
    for (let j = Math.max(0, ja); j <= jb; j++) for (let k = Math.max(0, ia); k <= ib; k++) for (const s of grid.get(j * gw + k) ?? []) {
      if (seen.has(s)) continue; seen.add(s)
      const ax = S[s * 4], ay = S[s * 4 + 1], bx = S[s * 4 + 2], by = S[s * 4 + 3], l = Math.hypot(bx - ax, by - ay)
      let ux = (bx - ax) / l, uy = (by - ay) / l
      if (Math.abs(d[0] * uy - d[1] * ux) > 0.09) continue          // lệch hướng quá ~5°
      if (ux * d[0] + uy * d[1] < 0) { ux = -ux; uy = -uy }
      const off = ((ax + bx) / 2 - m[0]) * nx + ((ay + by) / 2 - m[1]) * ny; if (Math.abs(off) > tol) continue
      const t0 = (ax - m[0]) * d[0] + (ay - m[1]) * d[1], t1 = (bx - m[0]) * d[0] + (by - m[1]) * d[1]
      const ov = Math.min(Math.max(t0, t1), hl) - Math.max(Math.min(t0, t1), -hl); if (ov <= 0.3) continue
      C.push({ off, ov, dx: ux, dy: uy })
    }
    if (!C.length) return null
    C.sort((p, q) => p.off - q.off)
    let best = -1, bs = 0, bo = 0, bdx = 0, bdy = 0
    for (let i = 0; i < C.length; i++) {
      let w = 0, so = 0, sx = 0, sy = 0
      for (let j = i; j < C.length && C[j].off - C[i].off <= 0.7; j++) { w += C[j].ov; so += C[j].off * C[j].ov; sx += C[j].dx * C[j].ov; sy += C[j].dy * C[j].ov }
      const o = so / w, score = w * (1 - 0.3 * Math.abs(o) / tol)
      if (score > bs) { bs = score; best = i; bo = o; bdx = sx; bdy = sy }
    }
    if (best < 0) return null
    // phần được phủ (cộng dồn cả các đoạn tường nối tiếp) phải đủ lớn
    let cov = 0; for (const c of C) if (Math.abs(c.off - bo) <= 0.7) cov += c.ov
    if (cov < 0.45 * len) return null
    const l = Math.hypot(bdx, bdy) || 1
    return { m: [m[0] + nx * bo, m[1] + ny * bo], d: [bdx / l, bdy / l] }
  }
}

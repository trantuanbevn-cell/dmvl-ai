// Nhận diện thang máy / thang bộ / thang xoắn từ NÉT VẼ (không cần layer hay tên khối đúng – các bản vẽ thường để chúng ở layer chung):
//  - thang bộ: các nét song song cách đều (bậc) cùng một đoạn dọc → mỗi vế thang một khối, cao theo số bậc
//  - thang xoắn tròn: các nét toả tia từ lõi (cắt nhau tại một tâm), cùng bán kính
//  - thang máy: hộp có các hộp lồng bên trong (giếng – cabin – đối trọng) hoặc hai đường chéo chữ X
import type { VecPage } from '../vector'
import type { Furn } from './model'
import { uid } from './model'
import { furnTypeOf } from './furn'

type S = { x0: number; y0: number; x1: number; y1: number; L: number; a: number; ly: string }
const SKIP = /loose|furn|dim|text|tag/i, SKIP_LIFT = /loose|furn|dim|text|tag|door|cua|kinh|glass/i
export function detectVertical(v: VecPage, m: number): Furn[] {
  const out: Furn[] = [], n = v.nSeg ?? v.segs.length / 4, segs: S[] = []
  for (let i = 0; i < n; i++) {
    const x0 = v.segs[i * 4] * m, y0 = v.segs[i * 4 + 1] * m, x1 = v.segs[i * 4 + 2] * m, y1 = v.segs[i * 4 + 3] * m, L = Math.hypot(x1 - x0, y1 - y0)
    if (L < 0.12 || L > 12) continue
    segs.push({ x0, y0, x1, y1, L, a: ((Math.atan2(y1 - y0, x1 - x0) % Math.PI) + Math.PI) % Math.PI, ly: (v.classes[v.cls[i]]?.layer ?? '').replace(/^.*\$/, '') })
  }
  const mk = (kind: string, cx: number, cy: number, w: number, d: number, ang: number, name?: string, h?: number): Furn => ({ id: uid('f'), kind, name, x: cx, y: cy, w, d, ang, h: h ?? furnTypeOf(kind).h, auto: true })
  const taken = (kind: string, cx: number, cy: number, r: number) => out.some(f => f.kind === kind && Math.hypot(f.x - cx, f.y - cy) < r)
  const base = segs.filter(s => !SKIP.test(s.ly)), baseLift = segs.filter(s => !SKIP_LIFT.test(s.ly)), baseAll = segs.filter(s => !/dim|text|tag/i.test(s.ly))

  // ---- thang máy 1: hộp lồng hộp (axis-aligned)
  const H: { y: number; a: number; b: number }[] = [], V: { x: number; a: number; b: number }[] = []
  for (const s of baseLift) { if (s.L < 0.3) continue
    const dx = Math.abs(s.x1 - s.x0), dy = Math.abs(s.y1 - s.y0)
    if (dy < 0.008) H.push({ y: (s.y0 + s.y1) / 2, a: Math.min(s.x0, s.x1), b: Math.max(s.x0, s.x1) })
    else if (dx < 0.008) V.push({ x: (s.x0 + s.x1) / 2, a: Math.min(s.y0, s.y1), b: Math.max(s.y0, s.y1) }) }
  const merge = <T extends { a: number; b: number }>(arr: T[], key: (t: T) => number): T[] => { arr.sort((p, q) => Math.round(key(p) * 200) - Math.round(key(q) * 200) || p.a - q.a); const o: T[] = []; for (const t of arr) { const l = o[o.length - 1]; if (l && Math.abs(key(l) - key(t)) < 0.006 && t.a <= l.b + 0.02) l.b = Math.max(l.b, t.b); else o.push({ ...t }) } return o }
  const Hs = merge(H, t => (t as any).y), Vs = merge(V, t => (t as any).x)
  type R = { x0: number; y0: number; x1: number; y1: number }
  const rects: R[] = []
  const vAt = new Map<number, typeof Vs>(); for (const t of Vs) { const k = Math.round(t.x * 20); (vAt.get(k) ?? vAt.set(k, []).get(k)!).push(t) }
  const hasV = (x: number, ya: number, yb: number) => { for (let k = Math.round(x * 20) - 1; k <= Math.round(x * 20) + 1; k++) for (const t of vAt.get(k) ?? []) if (Math.abs(t.x - x) < 0.015 && t.a <= ya + 0.03 && t.b >= yb - 0.03) return true; return false }
  const byY = Hs.slice().sort((p, q) => p.y - q.y)
  for (let i = 0; i < byY.length; i++) for (let j = i + 1; j < byY.length; j++) {
    const p = byY[i], q = byY[j], dy = q.y - p.y; if (dy > 3.4) break; if (dy < 0.5) continue
    const a = Math.max(p.a, q.a), b = Math.min(p.b, q.b)
    if (b - a < 0.5 || b - a > 3.4) {
      // hai cạnh dài hơn nhau: thử các cạnh đứng làm mốc
      continue }
    if (hasV(a, p.y, q.y) && hasV(b, p.y, q.y)) rects.push({ x0: a, y0: p.y, x1: b, y1: q.y }) }
  const uniq = rects.filter((r, i) => !rects.some((o, j) => j < i && Math.abs(o.x0 - r.x0) < 0.02 && Math.abs(o.x1 - r.x1) < 0.02 && Math.abs(o.y0 - r.y0) < 0.02 && Math.abs(o.y1 - r.y1) < 0.02))
  ;(globalThis as any).__rects = uniq
  for (const R of uniq) {
    const w = R.x1 - R.x0, d = R.y1 - R.y0; if (w < 1.1 || d < 1.1 || w > 3.4 || d > 3.4) continue
    if (Math.max(w, d) / Math.min(w, d) > 1.4 || Math.min(w, d) < 1.5) continue
    const inner = uniq.filter(o => o !== R && o.x0 - R.x0 > 0.03 && R.x1 - o.x1 > 0.03 && o.y0 - R.y0 > 0.03 && R.y1 - o.y1 > 0.03 && o.x0 - R.x0 < 0.7 && R.x1 - o.x1 < 0.7 && o.y0 - R.y0 < 0.7 && R.y1 - o.y1 < 0.7)
    if (inner.length < 1) continue
    // lấy hộp ngoài cùng (giếng): bỏ nếu đã có hộp lớn hơn chứa hộp này cũng thoả điều kiện
    const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2; if (taken('lift', cx, cy, 0.6)) continue
    const bigger = uniq.some(o => o !== R && o.x0 <= R.x0 + 0.01 && o.x1 >= R.x1 - 0.01 && o.y0 <= R.y0 + 0.01 && o.y1 >= R.y1 - 0.01 && (o.x1 - o.x0) <= 3.4 && (o.y1 - o.y0) <= 3.4 && (o.x1 - o.x0) * (o.y1 - o.y0) > w * d * 1.01 && Math.max(o.x1 - o.x0, o.y1 - o.y0) / Math.min(o.x1 - o.x0, o.y1 - o.y0) < 1.4)
    if (bigger) continue
    out.push(mk('lift', cx, cy, w, d, 0, 'Thang máy')) }

  // ---- thang máy 2: ký hiệu chữ X (hai đường chéo bằng nhau, cắt nhau ở giữa)
  const diag = segs.filter(s => s.L >= 1.6 && s.L <= 5 && Math.abs(((s.a * 180 / Math.PI) % 90) - 45) < 22 && !/loose|noi.?that/i.test(s.ly))
  const cell = 0.3, gm = new Map<string, S[]>()
  for (const s of diag) { const k = Math.round((s.x0 + s.x1) / 2 / cell) + ',' + Math.round((s.y0 + s.y1) / 2 / cell); (gm.get(k) ?? gm.set(k, []).get(k)!).push(s) }
  for (const s of diag) {
    const mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2, cx = Math.round(mx / cell), cy = Math.round(my / cell)
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const t of gm.get(i + ',' + j) ?? []) {
      if (t === s || Math.abs(t.L - s.L) > 0.12 || Math.abs((t.x0 + t.x1) / 2 - mx) > 0.12 || Math.abs((t.y0 + t.y1) / 2 - my) > 0.12) continue
      const da = Math.abs(t.a - s.a); if (Math.min(da, Math.PI - da) < 0.35 || taken('lift', mx, my, 0.8)) continue
      const xs = [s.x0, s.x1, t.x0, t.x1], ys = [s.y0, s.y1, t.y0, t.y1], w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys)
      if (w < 1.1 || d < 1.1 || w > 3.6 || d > 3.6) continue
      out.push(mk('lift', mx, my, w, d, 0, 'Thang máy')) } }

  // ---- thang xoắn: nhiều nét toả tia, đường kéo dài của chúng cắt nhau ở một tâm
  const rad = baseAll.filter(s => s.L >= 0.35 && s.L <= 2.6), g2 = new Map<string, number>(), c2 = 0.1
  const votes: { x: number; y: number; ids: Set<S> }[] = []
  const sp = new Map<string, S[]>(), c3 = 1.0
  for (const s of rad) for (const [x, y] of [[(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2]]) { const k = Math.floor(x / c3) + ',' + Math.floor(y / c3); (sp.get(k) ?? sp.set(k, []).get(k)!).push(s) }
  const done = new Set<S>()
  for (const s of rad) { if (done.has(s)) continue
    const cx = Math.floor((s.x0 + s.x1) / 2 / c3), cy = Math.floor((s.y0 + s.y1) / 2 / c3), nb: S[] = []
    for (let i = cx - 2; i <= cx + 2; i++) for (let j = cy - 2; j <= cy + 2; j++) nb.push(...(sp.get(i + ',' + j) ?? []))
    if (nb.length < 8) continue
    const hist = new Map<string, { x: number; y: number; set: Set<S> }>()
    // giao điểm của đường thẳng chứa s với các nét khác nghiêng ≥12° → bỏ phiếu theo ô 0.1 m
    for (const t of nb) { if (t === s) continue; const da = Math.abs(t.a - s.a); if (Math.min(da, Math.PI - da) < 0.2) continue
      const d1x = s.x1 - s.x0, d1y = s.y1 - s.y0, d2x = t.x1 - t.x0, d2y = t.y1 - t.y0, den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue
      const u = ((t.x0 - s.x0) * d2y - (t.y0 - s.y0) * d2x) / den, px = s.x0 + u * d1x, py = s.y0 + u * d1y
      if (Math.hypot(px - (s.x0 + s.x1) / 2, py - (s.y0 + s.y1) / 2) > 2.2) continue
      const k = Math.round(px / c2) + ',' + Math.round(py / c2); const h = hist.get(k) ?? hist.set(k, { x: px, y: py, set: new Set() }).get(k)!; h.set.add(t); h.set.add(s) }
    let best: { x: number; y: number; set: Set<S> } | null = null; for (const h of hist.values()) if (!best || h.set.size > best.set.size) best = h
    if (!best || best.set.size < 8) continue
    const cx0 = best.x, cy0 = best.y
    // các tia phải có một đầu cách tâm ~ cùng khoảng và phủ nhiều hướng
    const ring = [...best.set].filter(t => { const d0 = Math.hypot(t.x0 - cx0, t.y0 - cy0), d1 = Math.hypot(t.x1 - cx0, t.y1 - cy0); return Math.min(d0, d1) < 1.2 })
    const dirs = new Set(ring.map(t => Math.round(t.a / (Math.PI / 12))))
    const R = Math.max(...ring.map(t => Math.max(Math.hypot(t.x0 - cx0, t.y0 - cy0), Math.hypot(t.x1 - cx0, t.y1 - cy0))))
    for (const t of best.set) done.add(t)
    // phải có vòng tròn đồng tâm (các đoạn nhỏ của cung tròn nằm ở cùng bán kính, vuông góc tia) phủ ≥ 55% chu vi
    let cov = 0; for (const t of baseAll) { if (t.L > 1.2) continue; const mx = (t.x0 + t.x1) / 2, my = (t.y0 + t.y1) / 2, r = Math.hypot(mx - cx0, my - cy0); if (Math.abs(r - R) > 0.1) continue; const tx = t.x1 - t.x0, ty = t.y1 - t.y0, dot = Math.abs(tx * (mx - cx0) + ty * (my - cy0)) / (t.L * r || 1); if (dot < 0.3) cov += t.L }
    if (cov < Math.PI * 2 * R * 0.6) continue
    if (ring.length < 8 || dirs.size < 6 || R < 0.8 || R > 2.6 || taken('spiral', cx0, cy0, R)) continue
    out.push(mk('spiral', cx0, cy0, 2 * R, 2 * R, 0, 'Thang xoắn')) }
  void g2; void votes

  // ---- thang bộ: các nét bậc song song cách đều, cùng đoạn dọc (khoảng 0.2–0.4 m); mỗi vế thang một khối
  const stairs = baseAll.filter(s => s.L >= 0.7 && s.L <= 9)
  const byAng = new Map<number, S[]>()
  for (const s of stairs) { const k = Math.round(s.a * 180 / Math.PI) % 180; (byAng.get(k) ?? byAng.set(k, []).get(k)!).push(s) }
  const used = new Set<S>()
  for (const [k, l0] of byAng) {
    const list = [...l0, ...(byAng.get((k + 1) % 180) ?? [])]; if (list.length < 5) continue
    const a = l0.reduce((p, s) => p + s.a, 0) / l0.length, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux
    const rows = list.map(s => { const p0 = s.x0 * ux + s.y0 * uy, p1 = s.x1 * ux + s.y1 * uy; return { s, o: ((s.x0 + s.x1) / 2) * nx + ((s.y0 + s.y1) / 2) * ny, u0: Math.min(p0, p1), u1: Math.max(p0, p1) } })
    // gom theo cùng đoạn dọc [u0,u1] (sai số 0.12 m)
    rows.sort((p, q) => p.u0 - q.u0); const buckets: typeof rows[] = []
    for (const r of rows) { const b = buckets.find(bk => Math.abs(bk[0].u0 - r.u0) < 0.12 && Math.abs(bk[0].u1 - r.u1) < 0.12); if (b) b.push(r); else buckets.push([r]) }
    for (const bk of buckets) { if (bk.length < 5) continue
      bk.sort((p, q) => p.o - q.o); const uniqR = bk.filter((r, i) => !i || r.o - bk[i - 1].o > 0.04)
      let i = 0
      while (i < uniqR.length) {
        const run = [uniqR[i]]; let j = i
        while (j + 1 < uniqR.length) { const g = uniqR[j + 1].o - uniqR[j].o; const pitch = run.length > 1 ? (run[run.length - 1].o - run[0].o) / (run.length - 1) : 0
          if (g < 0.18 || g > 0.45 || (pitch && Math.abs(g - pitch) > Math.max(0.05, pitch * 0.2))) break; run.push(uniqR[j + 1]); j++ }
        if (run.length >= 5 && run.length <= 30 && !run.some(r => used.has(r.s))) {
          const pitch = (run[run.length - 1].o - run[0].o) / (run.length - 1), o0 = run[0].o, o1 = run[run.length - 1].o, uc = (run[0].u0 + run[0].u1) / 2, L = run[0].u1 - run[0].u0, oc = (o0 + o1) / 2, w = o1 - o0 + pitch
          const cx = ux * uc + nx * oc, cy = uy * uc + ny * oc
          if (!out.some(f => f.kind === 'stair' && Math.hypot(f.x - cx, f.y - cy) < 0.4)) { out.push(mk('stair', cx, cy, w, L, Math.atan2(ny, nx), 'Thang bộ', Math.min(3.3, (run.length + 1) * 0.17))); run.forEach(r => used.add(r.s)) } }
        i = Math.max(j + 1, i + 1) } } }
  return out
}

/** Vách ngăn mỏng (WC…): hai nét song song cách 2–8 cm, dài ≥0.4 m, có bịt đầu, vẽ dạng hộp rỗng (không tô hatch) → tường mỏng */
export function detectThinPartitions(v: VecPage, m: number, covered: (x: number, y: number) => boolean): { a: [number, number]; b: [number, number]; t: number }[] {
  const n = v.nSeg ?? v.segs.length / 4, H: { c: number; a: number; b: number }[] = [], V: { c: number; a: number; b: number }[] = []
  for (let i = 0; i < n; i++) {
    const ly = (v.classes[v.cls[i]]?.layer ?? '').replace(/^.*\$/, ''); if (/loose|furn|dim|text|tag|cua|door|noi.?that/i.test(ly)) continue
    const x0 = v.segs[i * 4] * m, y0 = v.segs[i * 4 + 1] * m, x1 = v.segs[i * 4 + 2] * m, y1 = v.segs[i * 4 + 3] * m
    if (Math.abs(y1 - y0) < 0.004 && Math.abs(x1 - x0) >= 0.03) H.push({ c: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1) })
    else if (Math.abs(x1 - x0) < 0.004 && Math.abs(y1 - y0) >= 0.03) V.push({ c: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1) })
  }
  const mg = (arr: typeof H) => { arr.sort((p, q) => Math.round(p.c * 250) - Math.round(q.c * 250) || p.a - q.a); const o: typeof H = []; for (const t of arr) { const l = o[o.length - 1]; if (l && Math.abs(l.c - t.c) < 0.004 && t.a <= l.b + 0.02) l.b = Math.max(l.b, t.b); else o.push({ ...t }) } return o }
  const Hs = mg(H), Vs = mg(V), out: { a: [number, number]; b: [number, number]; t: number }[] = []
  const run = (A: typeof H, Bcap: typeof H, vertical: boolean) => {
    const s = A.slice().sort((p, q) => p.c - q.c)
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const t = s[j].c - s[i].c; if (t > 0.085) break; if (t < 0.018) continue
      const a = Math.max(s[i].a, s[j].a), b = Math.min(s[i].b, s[j].b), L = b - a; if (L < 0.4 || L > 4) continue
      // bịt đầu: có nét vuông góc nối hai cạnh ở ít nhất một đầu
      const cap = (pos: number) => Bcap.some(c => Math.abs(c.c - pos) < 0.02 && c.a <= s[i].c + 0.02 && c.b >= s[j].c - 0.02)
      if (!cap(a) && !cap(b)) continue
      const c = (s[i].c + s[j].c) / 2, mid = (a + b) / 2; if (covered(vertical ? c : mid, vertical ? mid : c)) continue
      out.push(vertical ? { a: [c, a], b: [c, b], t } : { a: [a, c], b: [b, c], t })
    }
  }
  run(Vs, Hs, true); run(Hs, Vs, false)
  return out
}

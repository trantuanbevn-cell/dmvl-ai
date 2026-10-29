// ĐỌC MẶT BẰNG BẰNG MẮT – không cần layer, không cần block (đúng như người đọc bản in giấy).
// Dựa trên quy cách thể hiện bản vẽ kiến trúc (TCVN/ISO, giáo trình vẽ kỹ thuật):
//  • Mặt bằng = mặt cắt ngang ở cao ~1–1,5 m. Bộ phận BỊ CẮT (tường, cột, vách) vẽ NÉT ĐẬM và/hoặc TÔ ĐẶC / HATCH;
//    thứ nhìn thấy bên dưới (đồ đạc, mặt bàn, bậc thang) vẽ nét mảnh. → bề dày nét in là bằng chứng mạnh.
//  • Tường: dải mảnh dày 5–60 cm (2 nét song song hoặc vùng tô), chạy liên tục, nối nhau thành MẠNG khép quanh không gian,
//    bị ngắt ở chỗ cửa. Đồ đạc tuy cũng có nét song song nhưng đứng LẺ LOI, không nối thành mạng → bỏ.
//  • Cột: ô đặc/khung nhỏ 15–120 cm, hay xếp thẳng hàng theo lưới trục, sát tường.
//  • Vách kính: 2 nét rất sát nhau (≤ 12 cm), dài, nối giữa tường/cột/vách kính khác (không tô).
//  • Thang bộ: dãy nét bậc song song cách đều 22–35 cm. BẬC ĐẦU xác định theo thứ tự ưu tiên:
//      chữ "LÊN/UP" (đứng ở chân thang) › mũi tên đường đi (đầu mũi tên = phía trên, chấm/tròn = chân)
//      › đường cắt chéo (mặt cắt ở ~1,2–1,5 m nên đoạn từ bậc đầu tới đường cắt dài hơn: bậc đầu ở đầu XA đường cắt)
//      › chiếu nghỉ (vế có đường cắt là vế 1; vế 2 bắt đầu từ chiếu nghỉ).
import type { VecPage } from '../vector'
import type { Furn, Pt, Wall } from './model'

let seq = 0
const uid = (p: string) => p + Date.now().toString(36) + 's' + (seq++).toString(36)
const area = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const perim = (l: Pt[]) => l.reduce((n, a, k) => n + Math.hypot(l[(k + 1) % l.length][0] - a[0], l[(k + 1) % l.length][1] - a[1]), 0)
const inside = (p: Pt, l: Pt[]) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > p[1]) !== (l[j][1] > p[1]) && p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c; return c }
type Obb = { cx: number; cy: number; w: number; d: number; rot: number }
function obb(l: Pt[]): Obb {
  const n = l.length, angs = new Set<number>([0])
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (Math.hypot(l[j][0] - l[i][0], l[j][1] - l[i][1]) < 1e-6) continue; let a = Math.atan2(l[j][1] - l[i][1], l[j][0] - l[i][0]); a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); angs.add(Math.round(a * 1e3) / 1e3); if (angs.size > 16) break }
  let best: Obb = { cx: 0, cy: 0, w: 0, d: 0, rot: 0 }, ba = 1e18
  for (const a of angs) { const c = Math.cos(a), s = Math.sin(a); let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18
    for (const p of l) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v) }
    const ar = (x1 - x0) * (y1 - y0); if (ar < ba) { ba = ar; const mu = (x0 + x1) / 2, mv = (y0 + y1) / 2; best = { cx: mu * c - mv * s, cy: mu * s + mv * c, w: x1 - x0, d: y1 - y0, rot: a } } }
  return best
}
type Box = { x0: number; y0: number; x1: number; y1: number }
const bboxOf = (ls: Pt[][]): Box => { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const l of ls) for (const p of l) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) } return { x0, y0, x1, y1 } }
const segDist = (a: Pt, b: Pt, c: Pt, d: Pt) => { // khoảng cách nhỏ nhất giữa hai đoạn
  const ps = (p: Pt, q: Pt, r: Pt) => { const dx = r[0] - q[0], dy = r[1] - q[1], L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L2)); return Math.hypot(p[0] - q[0] - t * dx, p[1] - q[1] - t * dy) }
  return Math.min(ps(a, c, d), ps(b, c, d), ps(c, a, b), ps(d, a, b))
}

type Seg = { a: Pt; b: Pt; L: number; ang: number; pen: number }
type Cand = { kind: 'wall' | 'col'; src: 'reg' | 'ring' | 'pair'; strong: boolean; rings: Pt[][]; len: number; t: number; box: Box; edges: [Pt, Pt][]; seg?: { a: Pt; b: Pt; t: number } }

/** Nét in đậm = bộ phận bị cắt. Ngưỡng tương đối theo chính bản vẽ (văn phòng khác nhau dùng bảng nét khác nhau). */
function penStats(segs: Seg[]) {
  const by = new Map<number, number>(); let tot = 0
  for (const s of segs) { const k = Math.round(s.pen * 100) / 100; by.set(k, (by.get(k) ?? 0) + s.L); tot += s.L }
  const ks = [...by.keys()].sort((a, b) => a - b)
  // nét nền = nét mảnh nhất có mặt đáng kể (≥ 5% tổng chiều dài); nét đậm = dày ≥ 1,5 lần nét nền (và ≥ 0,2 mm), đủ dài (≥ 20 m hoặc 1%)
  const med = ks.find(k => by.get(k)! >= tot * 0.05) ?? ks[0] ?? 0
  const heavy = ks.filter(k => k >= Math.max(0.2, med * 1.5) && (by.get(k)! >= Math.min(tot * 0.01, 20)))
  return { heavyMin: heavy.length ? Math.min(...heavy) : Infinity, med }
}

export type Sense = { walls: Wall[]; glass: Wall[]; log: string[] }
/** m = mét / pt. Trả về tường + cột + vách kính đọc thuần theo hình. */
export function senseWalls(v: VecPage, m: number): Sense {
  const log: string[] = []
  const segs: Seg[] = []
  for (let i = 0; i < v.nSeg; i++) {
    const a: Pt = [v.segs[i * 4] * m, v.segs[i * 4 + 1] * m], b: Pt = [v.segs[i * 4 + 2] * m, v.segs[i * 4 + 3] * m], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(L >= 0.02)) continue   // bỏ cả nét lỗi (NaN)
    const c = v.classes[v.cls[i]]; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI
    segs.push({ a, b, L, ang, pen: c ? c.lw * (25.4 / 72) * 2 : 0.1 })
  }
  const { heavyMin } = penStats(segs), heavy = (p: number) => p >= heavyMin * 0.85
  log.push(isFinite(heavyMin) ? `Nét đậm (bộ phận bị cắt) từ ${heavyMin.toFixed(2)} mm` : 'Bản vẽ một độ dày nét – chỉ dựa vào hình dạng')
  const cands: Cand[] = []
  const edgesOf = (rs: Pt[][]) => rs.flatMap(r => r.map((p, i) => [p, r[(i + 1) % r.length]] as [Pt, Pt]))
  // ---- 1) vùng tô / hatch và đường khép kín: cột hoặc dải tường ----
  const shapeCand = (rs: Pt[][], src: 'reg' | 'ring', strong: boolean) => {
    const outer = rs[0]; if (outer.length < 3) return
    const A = Math.abs(area(outer)), Ae = A - rs.slice(1).reduce((n, h) => n + Math.abs(area(h)), 0), P = rs.reduce((n, r) => n + perim(r), 0); if (Ae <= 1e-4) return
    const o = obb(outer), mn = Math.min(o.w, o.d), mx = Math.max(o.w, o.d), t = (2 * Ae) / P
    if (rs.length === 1 && mn >= 0.15 && mx <= 1.2 && A / Math.max(1e-9, o.w * o.d) >= 0.65 && mx / mn <= 3) { cands.push({ kind: 'col', src, strong, rings: rs, len: mx, t: mn, box: bboxOf(rs), edges: edgesOf(rs) }); return }
    if (t >= 0.05 && t <= 0.6 && P / 2 >= 0.6 && Ae >= 0.04) cands.push({ kind: 'wall', src, strong, rings: rs, len: P / 2, t, box: bboxOf(rs), edges: edgesOf(rs) })
  }
  // vùng tô: bản thân màu tô không cho biết đó là tường hay đồ (ghế, sofa cũng tô đặc) → coi là bằng chứng YẾU;
  // chỉ thành tường khi nối vào mạng có nét đậm (nét cắt). Bản vẽ không phân biệt nét đậm/mảnh: dựa vào độ dài mạng.
  const hasHeavy = isFinite(heavyMin)
  for (const r of v.regions ?? []) { const rs = r.loops.map(l => l.map(p => [p[0] * m, p[1] * m] as Pt)); shapeCand(rs, 'reg', !hasHeavy && !r.blk) }
  for (const r of v.rings ?? []) shapeCand([r.pts.map(p => [p[0] * m, p[1] * m] as Pt)], 'ring', heavy(r.pen) && !r.blk)
  // ---- 2) hai nét song song cách 7–45 cm, không có nét song song thứ ba nằm giữa = một dải tường ----
  const thinPairs: { a: Pt; b: Pt; t: number; pen: number }[] = []
  {
    const longS = segs.filter(s => s.L >= 0.4).sort((p, q) => p.ang - q.ang)
    const buckets = new Map<number, Seg[]>(); for (const s of longS) { const k = Math.round(s.ang * 180 / Math.PI) % 180; (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(s) }
    for (const [k, l0] of buckets) {
      const list = [...l0, ...(buckets.get((k + 1) % 180) ?? [])]; if (list.length < 2) continue
      const ang = l0[0].ang, c = Math.cos(ang), sn = Math.sin(ang)
      const pr = list.map(s => { const u0 = s.a[0] * c + s.a[1] * sn, u1 = s.b[0] * c + s.b[1] * sn; return { s, o: (-s.a[0] * sn + s.a[1] * c + -s.b[0] * sn + s.b[1] * c) / 2, u0: Math.min(u0, u1), u1: Math.max(u0, u1) } }).sort((p, q) => p.o - q.o)
      const own = new Set(l0)
      for (let i = 0; i < pr.length; i++) {
        const P1 = pr[i]; if (!own.has(P1.s)) continue
        for (let j = i + 1; j < pr.length; j++) {
          const P2 = pr[j], d = P2.o - P1.o; if (d > 0.45) break; if (d < 0.008) continue
          const u0 = Math.max(P1.u0, P2.u0), u1 = Math.min(P1.u1, P2.u1), ov = u1 - u0; if (ov < 0.3 || ov < 0.5 * Math.min(P1.u1 - P1.u0, P2.u1 - P2.u0)) continue
          // không có nét song song nào nằm giữa (bậc thang, mép bàn… có nhiều nét cách đều nhau)
          let between = false; for (let q = i + 1; q < j; q++) { const P3 = pr[q]; if (P3.o - P1.o > 0.004 && P2.o - P3.o > 0.004 && Math.min(u1, P3.u1) - Math.max(u0, P3.u0) > 0.3 * ov) { between = true; break } }
          if (between) continue
          const om = (P1.o + P2.o) / 2, A: Pt = [u0 * c - om * sn, u0 * sn + om * c], B: Pt = [u1 * c - om * sn, u1 * sn + om * c], pen = Math.min(P1.s.pen, P2.s.pen)
          if (d < 0.07) { if (d <= 0.12) thinPairs.push({ a: A, b: B, t: d, pen }); continue }
          const n: Pt = [-sn * d / 2, c * d / 2], ring: Pt[] = [[A[0] + n[0], A[1] + n[1]], [B[0] + n[0], B[1] + n[1]], [B[0] - n[0], B[1] - n[1]], [A[0] - n[0], A[1] - n[1]]]
          cands.push({ kind: 'wall', src: 'pair', strong: heavy(pen), rings: [ring], len: ov, t: d, box: bboxOf([ring]), edges: edgesOf([ring]), seg: { a: A, b: B, t: d } })
          break
        }
      }
    }
  }
  // ---- 3) gộp ứng viên chạm nhau thành MẠNG (union-find, lưới không gian) ----
  const N = cands.length, par = Array.from({ length: N }, (_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])))
  const G = 1.0, grid = new Map<string, number[]>(), TOL = 0.06
  cands.forEach((c, i) => { for (let gx = Math.floor((c.box.x0 - TOL) / G); gx <= Math.floor((c.box.x1 + TOL) / G); gx++) for (let gy = Math.floor((c.box.y0 - TOL) / G); gy <= Math.floor((c.box.y1 + TOL) / G); gy++) { const k = gx + ',' + gy; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i) } })
  const touch = (p: Cand, q: Cand) => { if (p.box.x0 > q.box.x1 + TOL || q.box.x0 > p.box.x1 + TOL || p.box.y0 > q.box.y1 + TOL || q.box.y0 > p.box.y1 + TOL) return false
    if (inside(p.rings[0][0], q.rings[0]) || inside(q.rings[0][0], p.rings[0])) return true
    for (const e of p.edges) for (const f of q.edges) if (segDist(e[0], e[1], f[0], f[1]) <= TOL) return true; return false }
  // nối: bản vẽ có nét đậm → chỉ nét đậm (nét cắt) nối với nhau thành mạng; ứng viên yếu (vùng tô, nét mảnh) chỉ được nhận
  // khi CHẠM TRỰC TIẾP một ứng viên mạnh – không cho "lan" qua chuỗi đồ đạc (ghế, bậc, sofa) chạm nhau
  const adj = new Map<number, Set<number>>(), seen = new Set<string>()
  for (const ids of grid.values()) for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const i = Math.min(ids[a], ids[b]), j = Math.max(ids[a], ids[b]), key = i + ',' + j; if (seen.has(key)) continue; seen.add(key)
    const ci = cands[i], cj = cands[j]; if (isFinite(heavyMin) && !ci.strong && !cj.strong) continue
    if (!touch(ci, cj)) continue; (adj.get(i) ?? adj.set(i, new Set()).get(i)!).add(j); (adj.get(j) ?? adj.set(j, new Set()).get(j)!).add(i)
    if (!isFinite(heavyMin) || (ci.strong && cj.strong)) par[find(i)] = find(j) }
  const comp = new Map<number, { len: number; strong: number; n: number }>()
  cands.forEach((c, i) => { const r = find(i), s = comp.get(r) ?? { len: 0, strong: 0, n: 0 }; s.len += c.kind === 'wall' ? c.len : 0; s.strong += c.strong ? 1 : 0; s.n++; comp.set(r, s) })
  const keepComp = (r: number) => { const s = comp.get(r)!; return hasHeavy ? s.strong > 0 && s.len >= 2 : s.len >= 8 }
  // ứng viên yếu được nhận khi: (a) nằm chồng lên nét đậm (vùng tô bên trong khung tường nét đậm), hoặc
  // (b) nối TIẾP thẳng hàng một tường đậm, cùng bề dày. Mẩu đâm vuông góc từ tường ra (bậc, đồ kê sát tường) → bỏ.
  const angOf = (c: Cand) => { const o = obb(c.rings[0]); return o.w >= o.d ? o.rot : o.rot + Math.PI / 2 }
  const keepCand = (i: number) => { const c = cands[i]; if (!hasHeavy || c.strong) return keepComp(find(i))
    const S = [...(adj.get(i) ?? [])].filter(j => cands[j].strong && keepComp(find(j))); if (!S.length) return false
    const pts = c.rings[0].flatMap((p, k, r) => [p, [(p[0] + r[(k + 1) % r.length][0]) / 2, (p[1] + r[(k + 1) % r.length][1]) / 2] as Pt])
    const near = pts.filter(p => S.some(j => cands[j].edges.some(e => segDist(p, p, e[0], e[1]) <= 0.08))).length
    if (near >= pts.length * 0.6) return true
    const a = angOf(c), oc = obb(c.rings[0]); return S.some(j => { const q = cands[j]; if (q.kind !== 'wall') return false; const aq = angOf(q), da = Math.abs(Math.sin(a - aq)); if (!(da < 0.09 && q.t / c.t > 0.7 && q.t / c.t < 1.4)) return false
      const oq = obb(q.rings[0]), off = Math.abs(-(oc.cx - oq.cx) * Math.sin(aq) + (oc.cy - oq.cy) * Math.cos(aq)); return off < q.t / 2 + 0.05 }) }   // cùng một trục (nối tiếp), không phải đứng song song cạnh nhau
  // ---- 4) chọn, bỏ trùng (vùng tô đi kèm đường viền của chính nó) ----
  const order = (c: Cand) => (c.src === 'reg' ? 0 : c.src === 'ring' ? 1 : 2) + (c.strong ? 0 : 3)
  const kept: Cand[] = []
  const covered = (c: Cand) => { const p: Pt = c.seg ? [(c.seg.a[0] + c.seg.b[0]) / 2, (c.seg.a[1] + c.seg.b[1]) / 2] : (() => { const o = obb(c.rings[0]); return [o.cx, o.cy] as Pt })()
    return kept.some(k => p[0] >= k.box.x0 - 0.02 && p[0] <= k.box.x1 + 0.02 && p[1] >= k.box.y0 - 0.02 && p[1] <= k.box.y1 + 0.02 && (k.rings.reduce((n, r) => n + (inside(p, r) ? 1 : 0), 0) % 2 === 1 || (k.seg && segDist(p, p, k.seg.a, k.seg.b) < k.seg.t / 2 + 0.02))) }
  const walls0 = cands.map((c, i) => ({ c, i })).filter(x => x.c.kind === 'wall' && keepCand(x.i)).sort((p, q) => order(p.c) - order(q.c))
  for (const { c } of walls0) if (!covered(c)) kept.push(c)
  // cột: đặc/nét đậm, sát tường hoặc thẳng hàng với ≥ 2 cột khác (lưới trục)
  // cột: có nét đậm bao quanh (hoặc vùng tô nằm trong một khung nét đậm); bản vẽ đơn nét → phải sát tường VÀ thẳng hàng lưới
  const heavyCols = cands.filter(c => c.kind === 'col' && c.strong)
  const cols = hasHeavy ? cands.filter(c => c.kind === 'col' && (c.strong || heavyCols.some(h => { const o = obb(c.rings[0]); return inside([o.cx, o.cy], h.rings[0]) }))) : cands.filter(c => c.kind === 'col')
  const colKeep = cols.filter(c => { const o = obb(c.rings[0]), near = kept.some(k => k.edges.some(e => c.edges.some(f => segDist(e[0], e[1], f[0], f[1]) < 0.3)))
    const al = cols.filter(q => q !== c && (() => { const p = obb(q.rings[0]); return Math.abs(p.cx - o.cx) < 0.05 || Math.abs(p.cy - o.cy) < 0.05 })()).length
    return hasHeavy ? near || al >= 2 : near && al >= 2 })
  // ô tô đặc hình chữ nhật (không tròn như ghế) xếp thẳng hàng theo lưới, cách nhau ≥ 2,5 m → cột, kể cả khi nét mảnh
  const allCol = cands.filter(c => c.kind === 'col'), ctr = (c: Cand) => { const o = obb(c.rings[0]); return { x: o.cx, y: o.cy, fill: Math.abs(area(c.rings[0])) / Math.max(1e-9, o.w * o.d) } }
  // lưới trục: cột nằm ở giao của một hàng dọc VÀ một hàng ngang (mỗi hướng có ≥ 2 cột khác cách ≥ 2,5 m), không xoay lệch
  // (ghế rạp xếp theo cung tròn, xoay lệch → không thoả)
  for (const c of allCol) { if (colKeep.includes(c)) continue; const p = ctr(c), o = obb(c.rings[0]); if (p.fill < 0.9) continue
    const rot = ((o.rot % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); if (Math.min(rot, Math.PI / 2 - rot) > 0.05) continue
    const sameX = allCol.filter(q => q !== c && (() => { const r = ctr(q); return Math.abs(r.x - p.x) < 0.05 && Math.abs(r.y - p.y) >= 2.5 })()).length >= 2
    const sameY = allCol.filter(q => q !== c && (() => { const r = ctr(q); return Math.abs(r.y - p.y) < 0.05 && Math.abs(r.x - p.x) >= 2.5 })()).length >= 2
    if (sameX && sameY) colKeep.push(c) }
  const colOut: Cand[] = []; for (const c of colKeep) { const o = obb(c.rings[0]); if (!colOut.some(k => inside([o.cx, o.cy], k.rings[0]))) colOut.push(c) }
  const walls: Wall[] = [
    ...kept.map(c => (c.seg ? { id: uid('w'), role: 'wall' as const, kind: 'brick', auto: true, shape: { type: 'seg' as const, a: c.seg.a, b: c.seg.b, t: c.seg.t } } : { id: uid('w'), role: 'wall' as const, kind: 'brick', auto: true, shape: { type: 'poly' as const, rings: c.rings } })),
    ...colOut.map(c => ({ id: uid('w'), role: 'col' as const, kind: 'concrete', auto: true, shape: { type: 'poly' as const, rings: c.rings } })),
  ]
  log.push(`Đọc theo hình: ${kept.length} đoạn tường (${kept.filter(c => c.src === 'reg').length} vùng tô, ${kept.filter(c => c.src === 'ring').length} viền kín, ${kept.filter(c => c.src === 'pair').length} cặp nét), ${colOut.length} cột`)
  // ---- 5) vách kính: 2 nét rất sát (≤ 12 cm), không nằm trong tường, hai đầu tựa vào tường / cột / vách kính khác ----
  const solid = [...kept, ...colOut]
  const nearSolid = (p: Pt, r = 0.25) => solid.some(k => p[0] >= k.box.x0 - r && p[0] <= k.box.x1 + r && p[1] >= k.box.y0 - r && p[1] <= k.box.y1 + r && k.edges.some(e => segDist(p, p, e[0], e[1]) <= r))
  // nét kép sát mặt tường (lớp trát, ốp, len chân tường) không phải vách kính: vách kính đứng riêng giữa hai đầu tựa
  const hug = (g: { a: Pt; b: Pt }) => { let n = 0; for (let k = 1; k <= 3; k++) { const t = k / 4, p: Pt = [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t]; if (nearSolid(p, 0.15)) n++ } return n >= 2 }
  const gl = thinPairs.filter(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) >= 0.5 && !hug(g) && !solid.some(k => { const p: Pt = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]; return k.rings.reduce((n, r) => n + (inside(p, r) ? 1 : 0), 0) % 2 === 1 }))
  const okG = new Set<number>()
  for (let it = 0; it < 6; it++) gl.forEach((g, i) => { if (okG.has(i)) return
    const end = (p: Pt) => nearSolid(p) || [...okG].some(j => segDist(p, p, gl[j].a, gl[j].b) <= 0.25)
    if (end(g.a) && end(g.b)) okG.add(i) })
  const glass: Wall[] = [...okG].map(i => gl[i]).map(g => ({ id: uid('w'), role: 'wall' as const, kind: 'glass', name: 'Vách kính', panel: 1.2, auto: true, shape: { type: 'seg' as const, a: g.a, b: g.b, t: Math.max(0.012, g.t) } }))
  if (glass.length) log.push(`Vách kính theo hình: ${glass.length}`)
  return { walls, glass, log }
}

// ───────── BẬC ĐẦU CỦA THANG BỘ ─────────
/** Xác định chiều đi lên của từng vế thang theo quy cách thể hiện; trả lời giải thích. Thang 3D dựng thấp ở phía −w (cục bộ). */
export function orientStairs(stairs: Furn[], v: VecPage, m: number, log: string[] = []): void {
  const segs: { a: Pt; b: Pt; L: number }[] = []
  for (let i = 0; i < v.nSeg; i++) { const a: Pt = [v.segs[i * 4] * m, v.segs[i * 4 + 1] * m], b: Pt = [v.segs[i * 4 + 2] * m, v.segs[i * 4 + 3] * m], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L >= 0.03 && L < 1e6) segs.push({ a, b, L }) }
  const texts = (v.texts ?? []).map(t => ({ t: t.t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), x: t.x * m, y: t.y * m }))
  const fl = stairs.filter(f => f.kind === 'stair'), ev = new Map<Furn, 'start' | 'arrow' | 'cut'>()
  for (const f of fl) {
    const c = Math.cos(f.ang), s = Math.sin(f.ang), loc = (p: Pt) => ({ u: (p[0] - f.x) * c + (p[1] - f.y) * s, v: -(p[0] - f.x) * s + (p[1] - f.y) * c })
    const inR = (q: { u: number; v: number }, pad = 0.05) => Math.abs(q.u) <= f.w / 2 + pad && Math.abs(q.v) <= f.d / 2 + pad
    let dir = 0, why = ''   // dir = +1: đi lên theo +u (giữ nguyên); −1: đảo
    // 1) chữ LÊN / UP (đứng ở chân thang) – XUỐNG / DN (ở đầu trên)
    for (const t of texts) { const q = loc([t.x, t.y]); if (!inR(q, 0.8)) continue
      if (/(^|\s)(len|up)(\s|$)/.test(t.t)) { dir = q.u < 0 ? 1 : -1; why = 'chữ LÊN/UP ở chân thang'; break }
      if (/(^|\s)(xuong|dn|down)(\s|$)/.test(t.t)) { dir = q.u > 0 ? 1 : -1; why = 'chữ XUỐNG/DN ở đầu thang'; break } }
    // 2) mũi tên đường đi: nét dọc theo hướng đi (song song trục u) cắt qua nhiều bậc; đầu có 2 nét ngắn xiên chụm lại = đầu mũi tên (phía trên)
    if (!dir) {
      const walk = segs.map(g => ({ g, A: loc(g.a), B: loc(g.b) })).filter(x => inR(x.A, 0.3) && inR(x.B, 0.3) && Math.abs(x.A.v - x.B.v) < 0.06 && Math.abs(x.A.u - x.B.u) > f.w * 0.4)
      for (const w of walk) { for (const [E, O] of [[w.A, w.B], [w.B, w.A]] as const) {
        const tips = segs.filter(g => { const a = loc(g.a), b = loc(g.b); if (g.L > 0.5) return false; const nearE = (q: { u: number; v: number }) => Math.hypot(q.u - E.u, q.v - E.v) < 0.05; const other = nearE(a) ? b : nearE(b) ? a : null; if (!other) return false
          const back = (other.u - E.u) * Math.sign(O.u - E.u), side = Math.abs(other.v - E.v); return back > 0.03 && side > 0.02 && side < back * 1.8 })
        if (tips.length >= 2) { dir = E.u > O.u ? 1 : -1; why = 'mũi tên đường đi lên'; break } } if (dir) break }
    }
    // 2b) chấm / vòng tròn nhỏ ở đầu đường đi = chân thang (quy ước ISO/DIN: tròn ở bậc đầu, mũi tên ở bậc cuối)
    if (!dir) for (const r of v.rings ?? []) { const pts = r.pts.map(p => [p[0] * m, p[1] * m] as Pt), o = obb(pts), R = Math.max(o.w, o.d); if (R > 0.4 || R < 0.06 || Math.abs(o.w - o.d) > R * 0.2) continue
      const q = loc([o.cx, o.cy]); if (!inR(q, 0.3) || Math.abs(q.u) < f.w / 4) continue
      dir = q.u < 0 ? 1 : -1; why = 'vòng tròn đánh dấu chân thang'; break }
    // 3) đường cắt: nét xiên (20–70° so với bậc) cắt ngang vế thang – bậc đầu ở đầu XA đường cắt
    if (!dir) {
      const cut = segs.map(g => ({ A: loc(g.a), B: loc(g.b), L: g.L })).filter(x => inR(x.A, 0.2) && inR(x.B, 0.2) && x.L > f.d * 0.4 && (() => { const ang = Math.abs(Math.atan2(x.B.u - x.A.u, x.B.v - x.A.v)) % Math.PI, a = Math.min(ang, Math.PI - ang) * 180 / Math.PI; return a >= 15 && a <= 75 })())
      if (cut.length) { const uc = cut.reduce((n, x) => n + (x.A.u + x.B.u) / 2, 0) / cut.length; if (Math.abs(uc) > f.w * 0.05) { dir = uc > 0 ? 1 : -1; why = 'đường cắt thang (bậc đầu ở phía xa đường cắt)' } }
    }
    if (dir === -1) f.ang += Math.PI
    if (dir) ev.set(f, /LÊN|XUỐNG|vòng tròn/.test(why) ? 'start' : /mũi tên/.test(why) ? 'arrow' : 'cut')
    if (dir) log.push(`Thang ${f.w.toFixed(1)}×${f.d.toFixed(1)} m: bậc đầu theo ${why}`)
  }
  // 4) hai vế song song sát nhau, ngược chiều (thang 2 vế có chiếu nghỉ): vế thứ hai bắt đầu ở cao độ chiếu nghỉ
  for (let i = 0; i < fl.length; i++) for (let j = 0; j < fl.length; j++) { if (i === j) continue
    const a = fl[i], b = fl[j], da = Math.abs(Math.cos(a.ang - b.ang)); if (da < 0.97) continue
    const c = Math.cos(a.ang), s = Math.sin(a.ang), dv = Math.abs(-(b.x - a.x) * s + (b.y - a.y) * c), du = (b.x - a.x) * c + (b.y - a.y) * s
    if (dv > (a.d + b.d) / 2 + 0.4 || Math.abs(du) > Math.max(a.w, b.w)) continue
    const opposite = Math.cos(a.ang - b.ang) < 0
    // a đi lên về phía +u; đầu trên của a ≈ đầu dưới của b → b là vế 2
    const aTop = a.x + c * a.w / 2, aTopY = a.y + s * a.w / 2, bBot = b.x - Math.cos(b.ang) * b.w / 2, bBotY = b.y - Math.sin(b.ang) * b.w / 2
    // vế 1 là vế có dấu chân thang (chữ LÊN / vòng tròn); không có thì vế có đường cắt (quy ước: đường cắt vẽ trên vế đi lên từ tầng này)
    const rank = (f: Furn) => ({ start: 3, arrow: 1, cut: 2 } as Record<string, number>)[ev.get(f) ?? ''] ?? 0
    if (opposite && rank(a) > rank(b) && Math.hypot(aTop - bBot, aTopY - bBotY) < Math.max(a.d, b.d) + 1.2 && !b.z && !a.z) { b.z = a.h; log.push('Thang 2 vế: vế 2 bắt đầu từ chiếu nghỉ') }
  }
}

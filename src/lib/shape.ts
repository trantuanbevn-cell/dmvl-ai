// Chuẩn hoá đường viền vùng sàn: thay đường bậc thang của điểm ảnh bằng các đoạn THẲNG (ngang/dọc/chéo 45°) và CUNG TRÒN có bán kính.
// Thuần hình học, không phụ thuộc OpenCV: nhận chuỗi điểm dày (đã khép kín), trả về chuỗi lệnh path SVG.
export type Pt = [number, number]

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const len = (a: Pt) => Math.hypot(a[0], a[1])
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0]

function rdpOpen(P: Pt[], a: number, b: number, eps: number, out: number[]) {
  // đệ quy bằng ngăn xếp: đưa các chỉ số (a, b] vào out theo thứ tự
  const st: [number, number][] = [[a, b]], keep = new Uint8Array(P.length); keep[a] = 1; keep[b] = 1
  while (st.length) {
    const [s, e] = st.pop()!; if (e <= s + 1) continue
    const ab = sub(P[e], P[s]), L = len(ab) || 1e-9; let md = -1, mi = -1
    for (let i = s + 1; i < e; i++) { const d = Math.abs(cross(ab, sub(P[i], P[s]))) / L; if (d > md) { md = d; mi = i } }
    if (md > eps) { keep[mi] = 1; st.push([s, mi], [mi, e]) }
  }
  for (let i = a + 1; i <= b; i++) if (keep[i]) out.push(i)
}

/** Đơn giản hoá đường khép kín, trả về chỉ số các đỉnh */
function rdpClosed(P: Pt[], eps: number): number[] {
  const n = P.length; let j = 0, md = -1
  for (let i = 1; i < n; i++) { const d = len(sub(P[i], P[0])); if (d > md) { md = d; j = i } }
  const out: number[] = [0]
  rdpOpen(P, 0, j, eps, out)
  const P2 = P.concat([P[0]]); const tail: number[] = []
  rdpOpen(P2, j, n, eps, tail)
  for (const t of tail) if (t < n) out.push(t)
  return out
}

function fitCircle(P: Pt[], idx: number[]): { c: Pt; r: number; rms: number } | null {
  // Kasa: x²+y² = 2ax + 2by + c
  let sx = 0, sy = 0; for (const i of idx) { sx += P[i][0]; sy += P[i][1] } const mx = sx / idx.length, my = sy / idx.length
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0
  for (const i of idx) { const u = P[i][0] - mx, v = P[i][1] - my; Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u }
  const D = 2 * (Suu * Svv - Suv * Suv); if (Math.abs(D) < 1e-9) return null
  const uc = (Svv * (Suuu + Suvv) - Suv * (Svvv + Svuu)) / D, vc = (Suu * (Svvv + Svuu) - Suv * (Suuu + Suvv)) / D
  const c: Pt = [uc + mx, vc + my]; let r = 0; for (const i of idx) r += len(sub(P[i], c)); r /= idx.length
  let s = 0; for (const i of idx) { const d = len(sub(P[i], c)) - r; s += d * d }
  return { c, r, rms: Math.sqrt(s / idx.length) }
}

type Node = { p: Pt; fixed: boolean; arc?: { r: number; sweep: 0 | 1; large: 0 | 1 } }
const f = (x: number) => +x.toFixed(2)

/**
 * @param P điểm dày của đường viền (px, khép kín, không lặp điểm đầu)
 * @param u số px trên 1 m thật
 */
export function regularize(P: Pt[], u: number, snap?: (m: Pt, d: Pt, len: number) => { m: Pt; d: Pt } | null): string {
  const n = P.length; if (n < 4) return ''
  const eps = Math.max(1.4, 0.05 * u)
  const V = rdpClosed(P, eps), m = V.length; if (m < 3) return ''
  const pt = (k: number) => P[V[((k % m) + m) % m]]
  // góc rẽ tại từng đỉnh
  const turn: number[] = [], curved: boolean[] = []
  for (let k = 0; k < m; k++) {
    const e1 = sub(pt(k), pt(k - 1)), e2 = sub(pt(k + 1), pt(k))
    turn.push(Math.atan2(cross(e1, e2), e1[0] * e2[0] + e1[1] * e2[1]))
    const l1 = len(e1), l2 = len(e2), a = Math.abs(turn[k])
    curved.push(a > 0.1 && a < 1.0 && l1 < 1.6 * u && l2 < 1.6 * u && l1 > 0.4 * eps)
  }
  // các đoạn cong liên tiếp cùng chiều
  const inArc = new Array<boolean>(m).fill(false)
  const arcs: { s: number; e: number; c: Pt; r: number; sweep: 0 | 1; full: boolean }[] = []
  const allCurved = curved.every(Boolean)
  const startAt = allCurved ? 0 : curved.findIndex((c, k) => c && !curved[(k + m - 1) % m])
  if (startAt >= 0 && curved.some(Boolean)) {
    let k = startAt, cnt = 0
    while (cnt < m) {
      if (!curved[k % m]) { k++; cnt++; continue }
      const s = k; let e = k, sg = Math.sign(turn[k % m])
      while (cnt < m && curved[(e + 1) % m] && Math.sign(turn[(e + 1) % m]) === sg && (e + 1 - s) < m) { e++; cnt++ }
      cnt++; k = e + 1
      const count = e - s + 1
      const full = allCurved && count >= m
      if (count < 1 && !full) continue
      // điểm dày từ đỉnh s-1 đến đỉnh e+1
      const a = V[(((s - 1) % m) + m) % m], b = V[(e + 1) % m], ids: number[] = []
      if (full) for (let i = 0; i < n; i++) ids.push(i)
      else { let i = a; for (let guard = 0; guard <= n; guard++) { ids.push(i); if (i === b) break; i = (i + 1) % n } }
      const fit = fitCircle(P, ids); if (!fit) continue
      let sag = 0; if (!full) { const A = P[ids[0]], B = P[ids[ids.length - 1]], ch = sub(B, A), cl = len(ch) || 1e-9; for (const i of ids) sag = Math.max(sag, Math.abs(cross(ch, sub(P[i], A))) / cl); if (sag / cl < 0.07) continue }
      const tot = turn.slice(0).reduce((q, _, i) => (i >= s && i <= e ? q + Math.abs(turn[i % m]) : q), 0)
      if (fit.r < 0.2 * u || fit.r > 40 * u || fit.rms > Math.max(1.3, 0.035 * fit.r) || (!full && tot < 0.45)) continue
      arcs.push({ s, e, c: fit.c, r: fit.r, sweep: sg > 0 ? 1 : 0, full })
      if (!full) for (let q = s; q <= e; q++) inArc[q % m] = true
      else inArc.fill(true)
    }
  }
  if (arcs.length === 1 && arcs[0].full) {
    const { c, r, sweep } = arcs[0]
    return `M${f(c[0] + r)} ${f(c[1])}A${f(r)} ${f(r)} 0 1 ${sweep} ${f(c[0] - r)} ${f(c[1])}A${f(r)} ${f(r)} 0 1 ${sweep} ${f(c[0] + r)} ${f(c[1])}Z`
  }
  // dựng danh sách nút
  const nodes: Node[] = [], endProj = new Map<number, Pt>()
  const arcAt = new Map<number, typeof arcs[number]>()
  for (const A of arcs) if (!A.full) arcAt.set((((A.s - 1) % m) + m) % m, A)
  for (let k = 0; k < m; k++) {
    if (inArc[k]) continue
    const A = arcAt.get(k)
    if (A) {
      const proj = (p: Pt): Pt => { const d = sub(p, A.c), l = len(d) || 1; return [A.c[0] + (d[0] / l) * A.r, A.c[1] + (d[1] / l) * A.r] }
      const p0 = proj(pt(k)), p1 = proj(pt(A.e + 1))
      let ang = Math.atan2(p1[1] - A.c[1], p1[0] - A.c[0]) - Math.atan2(p0[1] - A.c[1], p0[0] - A.c[0])
      if (A.sweep === 0) ang = -ang
      ang = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      nodes.push({ p: p0, fixed: true, arc: { r: A.r, sweep: A.sweep, large: ang > Math.PI ? 1 : 0 } })
      // nút kết thúc cung sẽ là đỉnh e+1 (thêm ở vòng sau) nhưng cần nằm trên đường tròn
      const endIdx = (A.e + 1) % m; endProj.set(endIdx, p1)
    } else nodes.push({ p: pt(k), fixed: false })
  }
  // nút cuối cung nằm trên đường tròn → cố định
  for (const nd of nodes) { for (const [ei, pp] of endProj) if (nd.p === pt(ei)) { nd.p = pp; nd.fixed = true } }
  endProj.clear()
  const N = nodes.length; if (N < 3) return ''
  // đường thẳng cho từng cạnh thẳng, ép về hướng ngang/dọc/45° nếu gần
  const snapDir = (d: Pt): Pt => {
    const l = len(d) || 1, ang = Math.atan2(d[1], d[0]), q = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4), diff = Math.abs(ang - q)
    const axis = Math.abs(q / (Math.PI / 2) - Math.round(q / (Math.PI / 2))) < 1e-6
    if (diff < (axis ? 0.12 : 0.09)) return [Math.cos(q), Math.sin(q)]
    return [d[0] / l, d[1] / l]
  }
  type Ln = { m: Pt; d: Pt } | null
  const lines: Ln[] = nodes.map((a, i) => {
    if (a.arc) return null
    const b = nodes[(i + 1) % N], d = sub(b.p, a.p); if (len(d) < 1e-6) return null
    const dir = snapDir(d)
    const mid: Pt = a.fixed ? a.p : b.fixed ? b.p : [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2]
    // bắt vào tường vector thật nếu cạnh này chạy dọc một mép tường
    const dl = len(d), sn = snap && dl > 4 ? snap([(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2], [d[0] / dl, d[1] / dl], dl) : null
    if (sn) return { m: sn.m, d: sn.d }
    return { m: mid, d: dir }
  })
  const np: Pt[] = nodes.map(a => a.p)
  for (let i = 0; i < N; i++) {
    if (nodes[i].fixed) continue
    const L1 = lines[(i + N - 1) % N], L2 = lines[i]; if (!L1 || !L2) continue
    const cr = cross(L1.d, L2.d); if (Math.abs(cr) < 0.2) continue
    const w = sub(L2.m, L1.m), t = cross(w, L2.d) / cr
    const q: Pt = [L1.m[0] + L1.d[0] * t, L1.m[1] + L1.d[1] * t]
    if (len(sub(q, nodes[i].p)) < 4 * eps) np[i] = q
  }
  // bỏ các đỉnh thẳng hàng sau khi ép
  const keepN: number[] = []
  for (let i = 0; i < N; i++) {
    const a = np[(i + N - 1) % N], b = np[i], c = np[(i + 1) % N]
    const e1 = sub(b, a), e2 = sub(c, b)
    if (!nodes[i].fixed && !nodes[(i + N - 1) % N].arc && len(e1) > 1e-6 && len(e2) > 1e-6 && Math.abs(cross(e1, e2)) / (len(e1) * len(e2)) < 0.03 && e1[0] * e2[0] + e1[1] * e2[1] > 0) continue
    // cạnh quá ngắn (< 0.06 m) trùng đỉnh
    keepN.push(i)
  }
  let d = ''
  keepN.forEach((i, q) => { d += (q ? 'L' : 'M') + f(np[i][0]) + ' ' + f(np[i][1]); const nd = nodes[i]; if (nd.arc) { const nx = np[(i + 1) % N]; d += `A${f(nd.arc.r)} ${f(nd.arc.r)} 0 ${nd.arc.large} ${nd.arc.sweep} ${f(nx[0])} ${f(nx[1])}` } })
  return d + 'Z'
}

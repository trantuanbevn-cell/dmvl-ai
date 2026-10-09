// Làm "chuẩn nét" ranh giới giữa các không gian trên bản đồ nhãn (mỗi điểm ảnh = id phòng, 0 = tường/ngoài).
//  • Ranh giới THẬT (dọc tường) được bắt vào nét tường vector ở bước vẽ viền (shape.ts + wallsnap.ts).
//  • Ranh giới ẢO – chỗ hai không gian thông nhau, trong bản vẽ KHÔNG có nét nào (cửa không cánh, hành lang mở ra sảnh…) –
//    thuật toán chia vùng cho ra đường cong/xiên theo "mặt sóng" nên rất xấu. Ở đây thay bằng ĐOẠN THẲNG nối hai điểm tường
//    hai đầu (bắt điểm: xuyên qua đúng góc tường nếu có; hướng ép về ngang/dọc hoặc song song/vuông góc với tường kế bên).
//  • Gom các mảnh vụn / dải mỏng vào không gian kế bên; tô nốt các ô kín nhỏ bị cung mở cửa cắt rời.
// Thuần mảng số, không phụ thuộc canvas/OpenCV.

/** giãn mặt nạ nhị phân r điểm ảnh (hình vuông) bằng tổng tiền tố – O(N) */
export function dilate(src: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), pre = new Int32Array(Math.max(W, H) + 1)
  for (let y = 0; y < H; y++) {
    const o = y * W; pre[0] = 0
    for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + (src[o + x] ? 1 : 0)
    for (let x = 0; x < W; x++) tmp[o + x] = pre[Math.min(W, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0
  }
  for (let x = 0; x < W; x++) {
    pre[0] = 0
    for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + tmp[y * W + x]
    for (let y = 0; y < H; y++) out[y * W + x] = pre[Math.min(H, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0
  }
  return out
}

type P = [number, number]
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1])

function rdp(P: P[], eps: number): P[] {
  const n = P.length; if (n < 3) return P.slice()
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1
  const st: [number, number][] = [[0, n - 1]]
  while (st.length) {
    const [s, e] = st.pop()!; if (e <= s + 1) continue
    const ax = P[s][0], ay = P[s][1], dx = P[e][0] - ax, dy = P[e][1] - ay, L = Math.hypot(dx, dy) || 1e-9
    let md = -1, mi = -1
    for (let i = s + 1; i < e; i++) { const d = Math.abs(dx * (P[i][1] - ay) - dy * (P[i][0] - ax)) / L; if (d > md) { md = d; mi = i } }
    if (md > eps) { keep[mi] = 1; st.push([s, mi], [mi, e]) }
  }
  return P.filter((_, i) => keep[i])
}

/** tô đa giác (chẵn-lẻ) và đổi nhãn a↔b bên trong */
function flipPoly(lab: Uint16Array, W: number, H: number, poly: P[], a: number, b: number): number {
  const n = poly.length; let y0 = 1e9, y1 = -1e9
  for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  let flipped = 0
  for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(H - 1, Math.floor(y1 - 0.5)); y++) {
    const yc = y + 0.5, xs: number[] = []
    for (let i = 0, j = n - 1; i < n; j = i++) { const p = poly[i], q = poly[j]; if ((p[1] > yc) !== (q[1] > yc)) xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0])) }
    xs.sort((u, v) => u - v)
    for (let t = 0; t + 1 < xs.length; t += 2) for (let x = Math.max(0, Math.ceil(xs[t] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[t + 1] - 0.5)); x++) {
      const i = y * W + x, l = lab[i]
      if (l === a) { lab[i] = b; flipped++ } else if (l === b) { lab[i] = a; flipped++ }
    }
  }
  return flipped
}

/** lưới nét tường để tra hướng tường gần một điểm */
function segGrid(S: ArrayLike<number>, cell = 48) {
  const n = S.length / 4, g = new Map<number, number[]>()
  const key = (i: number, j: number) => j * 100003 + i
  for (let s = 0; s < n; s++) {
    const ax = S[s * 4], ay = S[s * 4 + 1], bx = S[s * 4 + 2], by = S[s * 4 + 3]
    for (let j = Math.floor(Math.min(ay, by) / cell); j <= Math.floor(Math.max(ay, by) / cell); j++) for (let i = Math.floor(Math.min(ax, bx) / cell); i <= Math.floor(Math.max(ax, bx) / cell); i++) { const k = key(i, j); let a = g.get(k); if (!a) g.set(k, a = []); a.push(s) }
  }
  return {
    near(p: P, r: number): number[] { const out = new Set<number>(); for (let j = Math.floor((p[1] - r) / cell); j <= Math.floor((p[1] + r) / cell); j++) for (let i = Math.floor((p[0] - r) / cell); i <= Math.floor((p[0] + r) / cell); i++) for (const s of g.get(key(i, j)) ?? []) out.add(s); return [...out] },
  }
}

export type SnapStats = { chains: number; straightened: number; poly: number; flipped: number; absorbed: number; pockets: number }

/**
 * @param lab bản đồ nhãn (sửa tại chỗ)
 * @param wallMask 1 = nét tường vector (đã vẽ dày vài px)
 * @param wsegs nét tường dạng đoạn thẳng [x1,y1,x2,y2,…] theo px
 * @param pxPerM số px trên 1 m thật
 */
export function straightenZones(lab: Uint16Array, W: number, H: number, wallMask: Uint8Array, wsegs: ArrayLike<number>, pxPerM: number): SnapStats {
  const st: SnapStats = { chains: 0, straightened: 0, poly: 0, flipped: 0, absorbed: 0, pockets: 0 }
  const wm2 = dilate(wallMask, W, H, 2), wm5 = dilate(wallMask, W, H, Math.max(4, Math.round(0.16 * pxPerM))), wm1 = dilate(wallMask, W, H, 1)
  const grid = segGrid(wsegs)
  // 1) các vết nứt giữa hai nhãn khác nhau, không sát tường = ranh giới ảo
  const pairs = new Map<number, number[]>()
  const add = (a: number, b: number, x2: number, y2: number) => { const k = a < b ? a * 65536 + b : b * 65536 + a; let arr = pairs.get(k); if (!arr) pairs.set(k, arr = []); arr.push(x2, y2) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = lab[i]; if (!a) continue
    if (x < W - 1) { const b = lab[i + 1]; if (b && b !== a && !wm2[i] && !wm2[i + 1]) add(a, b, 2 * x + 2, 2 * y + 1) }
    if (y < H - 1) { const b = lab[i + W]; if (b && b !== a && !wm2[i] && !wm2[i + W]) add(a, b, 2 * x + 1, 2 * y + 2) }
  }
  const OFF: [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  const minLen = 0.25 * pxPerM, maxCut = 16 * pxPerM
  const verts: P[] = []; for (let i = 0; i < wsegs.length; i += 4) { verts.push([wsegs[i], wsegs[i + 1]], [wsegs[i + 2], wsegs[i + 3]]) }
  const vgrid = new Map<number, number[]>(), VC = 40, vkey = (i: number, j: number) => j * 100003 + i
  verts.forEach((v, idx) => { const k = vkey(Math.floor(v[0] / VC), Math.floor(v[1] / VC)); let a = vgrid.get(k); if (!a) vgrid.set(k, a = []); a.push(idx) })
  const nearVert = (p: P, r: number): P | null => {
    let best: P | null = null, bd = r
    for (let j = Math.floor((p[1] - r) / VC); j <= Math.floor((p[1] + r) / VC); j++) for (let i = Math.floor((p[0] - r) / VC); i <= Math.floor((p[0] + r) / VC); i++) for (const idx of vgrid.get(vkey(i, j)) ?? []) { const d = dist(verts[idx], p); if (d < bd) { bd = d; best = verts[idx] } }
    return best
  }
  const hitWall = (p: P) => { const x = Math.round(p[0]), y = Math.round(p[1]); return x < 0 || y < 0 || x >= W || y >= H || wm1[y * W + x] === 1 }
  const march = (p: P, d: P, maxLen: number, skip = false): P | null => {
    let t0 = 0
    if (skip) { while (t0 < 8 && hitWall([p[0] + d[0] * t0, p[1] + d[1] * t0])) t0 += 0.5; if (t0 >= 8) return null }
    for (let t = t0; t <= maxLen; t += 0.5) { const q: P = [p[0] + d[0] * t, p[1] + d[1] * t]; if (hitWall(q)) return t - t0 < 1 ? null : [p[0] + d[0] * Math.max(0, t - 0.5), p[1] + d[1] * Math.max(0, t - 0.5)] }
    return null
  }
  for (const [pk, arr] of pairs) {
    const a = Math.floor(pk / 65536), b = pk % 65536, n = arr.length / 2
    if (n < 4) continue
    const idxOf = new Map<number, number>(), K = 2 * W + 8
    for (let c = 0; c < n; c++) idxOf.set(arr[c * 2 + 1] * K + arr[c * 2], c)
    const par = new Int32Array(n).map((_, i) => i), find = (i: number): number => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i] } return i }
    const nb: number[][] = Array.from({ length: n }, () => [])
    for (let c = 0; c < n; c++) for (const [dx, dy] of OFF) { const j = idxOf.get((arr[c * 2 + 1] + dy) * K + arr[c * 2] + dx); if (j !== undefined) { nb[c].push(j); par[find(j)] = find(c) } }
    const comps = new Map<number, number[]>()
    for (let c = 0; c < n; c++) { const r = find(c); let l = comps.get(r); if (!l) comps.set(r, l = []); l.push(c) }
    for (const cs of comps.values()) {
      if (cs.length < minLen * 1.5) continue
      // đường đi dài nhất trong vết nứt (BFS hai lần: tìm đầu mút xa nhất) – chịu được vết xiên bậc thang nhiều láng giềng
      const bfs = (src: number) => {
        const dd = new Map<number, number>([[src, 0]]), pr = new Map<number, number>(), q = [src]; let last = src
        for (let h = 0; h < q.length; h++) { const cur = q[h]; last = cur; for (const j of nb[cur]) if (!dd.has(j)) { dd.set(j, dd.get(cur)! + 1); pr.set(j, cur); q.push(j) } }
        return { last, pr }
      }
      const e1 = bfs(cs[0]).last, { last: e2, pr } = bfs(e1)
      const order: number[] = [e2]; for (let cur = e2; pr.has(cur);) { cur = pr.get(cur)!; order.push(cur) }
      if (order.length < cs.length * 0.6) continue
      const run: P[] = order.map(c => [arr[c * 2] / 2, arr[c * 2 + 1] / 2])
      const E1 = run[0], E2 = run[run.length - 1], L = dist(E1, E2)
      if (L < minLen) continue
      st.chains++
      let bulge = 0
      { const dx = E2[0] - E1[0], dy = E2[1] - E1[1], l = L || 1; for (const p of run) bulge = Math.max(bulge, Math.abs(dx * (p[1] - E1[1]) - dy * (p[0] - E1[0])) / l) }
      const nearEnd = (p: P) => { const x = Math.round(p[0]), y = Math.round(p[1]); return x >= 0 && y >= 0 && x < W && y < H && wm5[y * W + x] === 1 }
      let Q: P[] | null = null
      if (nearEnd(E1) && nearEnd(E2) && L <= maxCut && bulge <= 0.5 * L + 2) {
        // đường cắt nối hai điểm tường: bắt điểm vào góc tường gần nhất, hướng ép về trục / song song hoặc vuông góc với tường kế bên
        const u: P = [(E2[0] - E1[0]) / L, (E2[1] - E1[1]) / L]
        const cands: { d: P; pr: number }[] = [{ d: [1, 0], pr: 0 }, { d: [0, 1], pr: 0 }]
        for (const e of [E1, E2]) for (const s of grid.near(e, 0.6 * pxPerM)) {
          const sx = wsegs[s * 4 + 2] - wsegs[s * 4], sy = wsegs[s * 4 + 3] - wsegs[s * 4 + 1], sl = Math.hypot(sx, sy); if (sl < 0.4 * pxPerM) continue
          cands.push({ d: [sx / sl, sy / sl], pr: 0.04 }, { d: [-sy / sl, sx / sl], pr: 0.04 })
        }
        let best: P | null = null, bs = 1e9
        for (const c of cands) { let ang = Math.acos(Math.min(1, Math.abs(c.d[0] * u[0] + c.d[1] * u[1]))); const sc = ang + c.pr; if (ang <= 0.25 && sc < bs) { bs = sc; best = c.d } }
        let cut: [P, P] | null = null
        if (best) {
          const v1 = nearVert(E1, 0.5 * pxPerM), v2 = nearVert(E2, 0.5 * pxPerM)
          const pivot: P = v1 && v2 ? (dist(v1, E1) <= dist(v2, E2) ? v1 : v2) : v1 ?? v2 ?? [(E1[0] + E2[0]) / 2, (E1[1] + E2[1]) / 2]
          const lim = 1.6 * L + 1.0 * pxPerM
          const onV = !!(v1 || v2), sg = best[0] * u[0] + best[1] * u[1] >= 0 ? 1 : -1, dir: P = [best[0] * sg, best[1] * sg]
          // đi từ góc tường (nằm trong tường) xuyên qua khoảng trống tới tường đối diện; không có góc thì ra hai phía từ trung điểm
          const r1 = onV ? march(pivot, dir, lim, true) : march(pivot, best, lim), r2 = onV ? pivot : march(pivot, [-best[0], -best[1]], lim)
          if (r1 && r2) { const cl = dist(r1, r2); if (cl >= 0.5 * L && cl <= 1.6 * L + pxPerM) cut = dist(r1, E1) + dist(r2, E2) <= dist(r1, E2) + dist(r2, E1) ? [r2, r1] : [r1, r2] }
        }
        Q = cut ? [cut[0], cut[1]] : [E1, E2]
        if (cut) st.straightened++; else st.poly++
        // đa giác kín = vết cũ + đường cắt mới (đầu mút cắt có thể lệch vài px so với đầu vết)
        const poly: P[] = [...run, Q[1], Q[0]]
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
        if ((x1 - x0) * (y1 - y0) > 80 * pxPerM * pxPerM) continue
        st.flipped += flipPoly(lab, W, H, poly, a, b)
      } else {
        const q = rdp(run, Math.max(1.5, 0.22 * pxPerM)); if (q.length >= run.length) continue
        st.poly++
        st.flipped += flipPoly(lab, W, H, [...run, ...q.slice().reverse()], a, b)
      }
    }
  }
  // 2) gom mảnh vụn / dải mỏng; 3) tô nốt ô kín nhỏ (cung mở cửa)
  const r = absorbSmall(lab, W, H, wm1, pxPerM)
  st.absorbed = r.absorbed; st.pockets = r.pockets
  return st
}

/** thành phần liên thông 4-láng giềng của các điểm thoả `member` */
function components(member: (i: number) => boolean, W: number, H: number): { id: Int32Array; n: number } {
  const N = W * H, id = new Int32Array(N), stack = new Int32Array(N); let n = 0
  for (let s = 0; s < N; s++) {
    if (id[s] || !member(s)) continue
    n++; let sp = 0; stack[sp++] = s; id[s] = n
    while (sp) {
      const i = stack[--sp], x = i % W
      if (x > 0 && !id[i - 1] && member(i - 1)) { id[i - 1] = n; stack[sp++] = i - 1 }
      if (x < W - 1 && !id[i + 1] && member(i + 1)) { id[i + 1] = n; stack[sp++] = i + 1 }
      if (i >= W && !id[i - W] && member(i - W)) { id[i - W] = n; stack[sp++] = i - W }
      if (i + W < N && !id[i + W] && member(i + W)) { id[i + W] = n; stack[sp++] = i + W }
    }
  }
  return { id, n }
}

export function absorbSmall(lab: Uint16Array, W: number, H: number, wm1: Uint8Array, pxPerM: number): { absorbed: number; pockets: number } {
  const N = W * H, px2 = pxPerM * pxPerM
  let absorbed = 0, pockets = 0
  const vote = (idxs: number[], own: number, R: number): number => {
    const cnt = new Map<number, number>()
    for (const i of idxs) {
      const x = i % W, y = (i - x) / W
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= R; k++) {
        const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) break
        const l = lab[yy * W + xx]; if (l && l !== own) { cnt.set(l, (cnt.get(l) ?? 0) + 1); break }
      }
    }
    let best = 0, bc = 0; for (const [l, c] of cnt) if (c > bc) { bc = c; best = l }
    return best
  }
  const stats = (id: Int32Array, n: number) => {
    const area = new Int32Array(n + 1), per = new Int32Array(n + 1), border = new Uint8Array(n + 1), idx: number[][] = Array.from({ length: n + 1 }, () => [])
    for (let i = 0; i < N; i++) {
      const c = id[i]; if (!c) continue
      area[c]++; idx[c].push(i)
      const x = i % W, y = (i - x) / W
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border[c] = 1
      if (x === 0 || id[i - 1] !== c) per[c]++
      if (x === W - 1 || id[i + 1] !== c) per[c]++
      if (y === 0 || id[i - W] !== c) per[c]++
      if (y === H - 1 || id[i + W] !== c) per[c]++
    }
    return { area, per, border, idx }
  }
  // mảnh vụn của từng phòng: liên thông cùng nhãn
  const { id, n } = (() => {
    // liên thông theo nhãn: chạy riêng từng phép duyệt với điều kiện cùng nhãn
    const idArr = new Int32Array(N), stack = new Int32Array(N); let cnt = 0
    for (let s = 0; s < N; s++) {
      const L = lab[s]; if (!L || idArr[s]) continue
      cnt++; let sp = 0; stack[sp++] = s; idArr[s] = cnt
      while (sp) {
        const i = stack[--sp], x = i % W
        if (x > 0 && !idArr[i - 1] && lab[i - 1] === L) { idArr[i - 1] = cnt; stack[sp++] = i - 1 }
        if (x < W - 1 && !idArr[i + 1] && lab[i + 1] === L) { idArr[i + 1] = cnt; stack[sp++] = i + 1 }
        if (i >= W && !idArr[i - W] && lab[i - W] === L) { idArr[i - W] = cnt; stack[sp++] = i - W }
        if (i + W < N && !idArr[i + W] && lab[i + W] === L) { idArr[i + W] = cnt; stack[sp++] = i + W }
      }
    }
    return { id: idArr, n: cnt }
  })()
  const S = stats(id, n)
  const order = Array.from({ length: n }, (_, i) => i + 1).sort((p, q) => S.area[p] - S.area[q])
  const total = new Map<number, number>(); for (let c = 1; c <= n; c++) { const l = lab[S.idx[c][0]]; total.set(l, (total.get(l) ?? 0) + S.area[c]) }
  for (const c of order) {
    const A = S.area[c] / px2, t = (2 * S.area[c]) / Math.max(1, S.per[c]) / pxPerM
    const l = lab[S.idx[c][0]]
    if ((total.get(l) ?? 0) === S.area[c]) continue                 // phòng chỉ có đúng mảnh này
    if (!(A < 0.3 || (A < 4 && t < 0.28))) continue
    const tgt = vote(S.idx[c], l, 4); if (!tgt) continue
    for (const i of S.idx[c]) lab[i] = tgt
    absorbed++
  }
  // ô kín nhỏ chưa có nhãn (vd. cung mở cửa): vùng không-nhãn, không-tường, nằm trọn trong nhà
  const comp0 = components(i => lab[i] === 0 && wm1[i] === 0, W, H)
  const S0 = stats(comp0.id, comp0.n)
  for (let c = 1; c <= comp0.n; c++) {
    if (S0.border[c]) continue
    const A = S0.area[c] / px2, t = (2 * S0.area[c]) / Math.max(1, S0.per[c]) / pxPerM
    if (A > 3.5 || t < 0.3) continue
    const tgt = vote(S0.idx[c], 0, 5); if (!tgt) continue
    for (const i of S0.idx[c]) lab[i] = tgt
    pockets++
  }
  return { absorbed, pockets }
}

/** Ô quạt quét của cánh cửa: phần chưa có nhãn nằm trong 1/4 hình tròn (tâm = bản lề) về phía phòng → tô cùng màu phòng đó.
 *  doors: [hx,hy,ox,oy] theo px – bản lề và đầu kia của khung cửa (dọc tường). */
export function fillDoorSwings(lab: Uint16Array, W: number, H: number, doors: number[][]): number {
  let filled = 0
  const area = new Map<number, number>(); for (let i = 0; i < lab.length; i++) if (lab[i]) area.set(lab[i], (area.get(lab[i]) ?? 0) + 1)
  for (const [hx, hy, ox, oy] of doors) {
    const r = Math.hypot(ox - hx, oy - hy); if (r < 4) continue
    const ux = (ox - hx) / r, uy = (oy - hy) / r
    let best: { cnt: Map<number, number>; zero: number[]; nz: number } | null = null
    for (const sg of [1, -1]) {
      const vx = -uy * sg, vy = ux * sg, cnt = new Map<number, number>(), zero: number[] = []; let nz = 0
      for (let y = Math.max(0, Math.floor(hy - r)); y <= Math.min(H - 1, Math.ceil(hy + r)); y++) for (let x = Math.max(0, Math.floor(hx - r)); x <= Math.min(W - 1, Math.ceil(hx + r)); x++) {
        const px = x - hx, py = y - hy
        if (px * px + py * py > r * r) continue
        if (px * ux + py * uy < 0 || px * vx + py * vy < 0) continue
        const l = lab[y * W + x]; if (l) { nz++; cnt.set(l, (cnt.get(l) ?? 0) + 1) } else zero.push(y * W + x)
      }
      if (!best || nz > best.nz) best = { cnt, zero, nz }
    }
    // vùng kín nhỏ nằm trọn trong ô quạt (bị cung cửa tách thành "phòng" riêng) → nhập vào phòng chính của ô quạt
    if (best) {
      const sorted = [...best.cnt].sort((p, q) => p[1] - q[1]), main = sorted.length ? sorted[sorted.length - 1][0] : 0
      for (const [l, c] of sorted) {
        if (l === main || !main) continue
        const A = area.get(l) ?? 0, AM = area.get(main) ?? 0
        if (A <= 1.5 * Math.PI * r * r / 4 && c >= 0.6 * A && AM > A) { for (let i = 0; i < lab.length; i++) if (lab[i] === l) lab[i] = main; area.set(main, AM + A); area.delete(l); best.cnt.set(main, (best.cnt.get(main) ?? 0) + c); best.cnt.delete(l); filled++ }
      }
    }
    if (!best || !best.zero.length || best.nz < 0.2 * (best.nz + best.zero.length)) continue
    let l = 0, bc = 0; for (const [k, c] of best.cnt) if (c > bc) { bc = c; l = k }
    if (!l) continue
    for (const i of best.zero) lab[i] = l
    filled++
  }
  return filled
}

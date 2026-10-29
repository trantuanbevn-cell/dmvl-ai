// NHẬN ĐỐI TƯỢNG TỪ KHỐI (BLOCK) – đọc bản vẽ như người: mỗi khối chèn (INSERT) là MỘT vật thể; nhận nó là gì dựa trên
// 3 bằng chứng cùng lúc: (1) TÊN thật của khối (kể cả block động *U… → tên gốc), (2) LAYER ngoài + layer các nét bên trong,
// (3) HÌNH HỌC bên trong: cung quay cánh (cửa 1 cánh / 2 cánh / cánh lật 2 chiều), dải dài mảnh (vách kính), không cung (cửa trượt).
// Không dùng AI. Toạ độ vào/ra: đơn vị bản vẽ (trục y hướng lên như DXF).

type Pt = [number, number]
export type BlkRaw = { name: string; layer: string; layers: string[]; paths: { pts: Pt[]; closed?: boolean }[]; rot: number }
export type ObjKind = 'door' | 'double' | 'slide' | 'glass' | 'window' | 'lift' | 'stair' | 'spiral'
/** Đối tượng nhận được. Cửa: H1 (bản lề / đầu ô cửa), H2 (bản lề thứ hai hoặc đầu kia ô cửa), O = điểm đầu cánh khi mở (để biết phía mở). Vách / thang: hộp bao xoay. */
export type BlkObj = { kind: ObjKind; name: string; layer: string; why: string; H1?: Pt; H2?: Pt; O?: Pt; cx: number; cy: number; w: number; d: number; rot: number; t?: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
const RX = {
  glass: /kinh|glass|glaz|curtain|storefront/,
  door: /(^|[^a-z])cua(?! ?so)|door|(^|[^a-z])dr[-_ ]?\d|(^|[^a-z])d\d+($|[^a-z])|canh mo|canh lat|swing/,
  window: /cua ?so|window|(^|[^a-z])w\d+($|[^a-z])/,
  partition: /vach|partition/,
  slide: /truot|sliding|slide|lua/,
  spiral: /thang ?tron|thang ?xoan|spiral/,
  stair: /cau ?thang|thang ?bo|stair/,
  lift: /thang ?may|(^|[^a-z])lift|elevator|elev(^|[^a-z])/,
}

type Arc = { c: Pt; r: number; a: Pt; b: Pt; sweep: number }
/** Một đường cong có phải cung tròn không (≥ 5 điểm, bán kính đều) → tâm, bán kính, hai đầu, góc quét (độ) */
function arcOf(p: Pt[]): Arc | null {
  const n = p.length; if (n < 5) return null
  const A = p[0], B = p[n - 1], M = p[n >> 1]
  const d = 2 * (A[0] * (B[1] - M[1]) + B[0] * (M[1] - A[1]) + M[0] * (A[1] - B[1])); if (Math.abs(d) < 1e-9) return null
  const sq = (q: Pt) => q[0] * q[0] + q[1] * q[1]
  const c: Pt = [(sq(A) * (B[1] - M[1]) + sq(B) * (M[1] - A[1]) + sq(M) * (A[1] - B[1])) / d, (sq(A) * (M[0] - B[0]) + sq(B) * (A[0] - M[0]) + sq(M) * (B[0] - A[0])) / d]
  const r = Math.hypot(A[0] - c[0], A[1] - c[1]); if (!(r > 0)) return null
  for (const q of p) if (Math.abs(Math.hypot(q[0] - c[0], q[1] - c[1]) - r) > r * 0.03) return null
  let sweep = 0; for (let i = 1; i < n; i++) { let da = Math.atan2(p[i][1] - c[1], p[i][0] - c[0]) - Math.atan2(p[i - 1][1] - c[1], p[i - 1][0] - c[0]); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; sweep += da }
  return { c, r, a: A, b: B, sweep: Math.abs(sweep) * 180 / Math.PI }
}
/** Các đoạn cung nằm trong một đường (polyline vẽ cả cung lẫn đoạn thẳng, vd cánh cửa + cung quay trong cùng một nét) */
function arcsIn(p: Pt[]): Arc[] {
  const whole = arcOf(p); if (whole) return [whole]
  const out: Arc[] = []
  for (let i = 0; i + 4 < p.length;) {
    let j = i + 4, best: Arc | null = arcOf(p.slice(i, j + 1))
    if (!best) { i++; continue }
    while (j + 1 < p.length) { const a = arcOf(p.slice(i, j + 2)); if (!a) break; best = a; j++ }
    out.push(best); i = j
  }
  return out
}
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** hộp bao xoay theo góc chèn khối (đúng kích thước thật của vật) */
function obbAt(pts: Pt[], rot: number) {
  const co = Math.cos(-rot), si = Math.sin(-rot); let a0 = 1e18, b0 = 1e18, a1 = -1e18, b1 = -1e18
  for (const t of pts) { const u = t[0] * co - t[1] * si, v = t[0] * si + t[1] * co; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v) }
  const cu = (a0 + a1) / 2, cv = (b0 + b1) / 2
  return { cx: cu * Math.cos(rot) - cv * Math.sin(rot), cy: cu * Math.sin(rot) + cv * Math.cos(rot), w: a1 - a0, d: b1 - b0 }
}

/** mmU = mm trên một đơn vị bản vẽ */
export function classifyBlocks(raws: BlkRaw[], mmU: number): BlkObj[] {
  const out: BlkObj[] = [], mm = (x: number) => x * mmU
  for (const k of raws) {
    const all = k.paths.flatMap(p => p.pts); if (all.length < 2) continue
    const txt = norm(`${k.name} | ${k.layer} | ${k.layers.join(' ')}`), nameT = norm(k.name)
    const box = obbAt(all, k.rot)
    // hộp bao theo trục dài
    const long = box.w >= box.d, L = Math.max(box.w, box.d), T = Math.min(box.w, box.d), ang = k.rot + (long ? 0 : Math.PI / 2)
    // cung quay cánh cửa: bán kính 0,4–1,6 m, quét 60–200°
    const arcs = k.paths.flatMap(p => arcsIn(p.closed ? [...p.pts, p.pts[0]] : p.pts)).filter((a): a is Arc => !!a && mm(a.r) >= 400 && mm(a.r) <= 1600 && a.sweep >= 60 && a.sweep <= 200)
    const segs: [Pt, Pt][] = []; for (const p of k.paths) for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i], p.pts[i + 1]])
    const isDoorName = RX.door.test(txt) && !RX.window.test(nameT), isGlass = RX.glass.test(txt), isPart = RX.partition.test(txt)
    const base = { name: k.name, layer: k.layer, ...box, rot: ang, w: L, d: T }
    // ---- thang (theo tên khối) ----
    if (RX.spiral.test(nameT)) { out.push({ ...base, kind: 'spiral', why: 'tên khối: thang tròn/xoắn' }); continue }
    if (RX.lift.test(nameT)) { out.push({ ...base, kind: 'lift', why: 'tên khối: thang máy' }); continue }
    if (RX.stair.test(nameT)) { out.push({ ...base, kind: 'stair', why: 'tên khối: cầu thang' }); continue }
    // ---- cửa có cung quay ----
    if (arcs.length) {
      // gom bản lề: các cung chung tâm (cánh lật 2 chiều vẽ 2 nửa cung quanh cùng bản lề) = một cánh
      const hinges: { c: Pt; r: number; arcs: Arc[] }[] = []
      for (const a of arcs.sort((p, q) => q.r - p.r)) { const h = hinges.find(x => dist(x.c, a.c) < a.r * 0.08); if (h) h.arcs.push(a); else hinges.push({ c: a.c, r: a.r, arcs: [a] }) }
      // điểm cuối cánh khi mở: đầu cung có nét thẳng nối về bản lề (chính là cánh cửa)
      const openEnd = (h: { c: Pt; r: number; arcs: Arc[] }): { O: Pt; C: Pt; leafSeen: boolean } => {
        const a = h.arcs[0], tol = h.r * 0.12
        const leaf = (X: Pt) => segs.some(([p, q]) => (dist(p, h.c) < tol && dist(q, X) < tol) || (dist(q, h.c) < tol && dist(p, X) < tol) || (dist(p, X) < tol && Math.abs(dist(q, h.c) - h.r) < tol && dist(q, X) > h.r * 0.5))
        if (leaf(a.b) && !leaf(a.a)) return { O: a.b, C: a.a, leafSeen: true }
        if (leaf(a.a) && !leaf(a.b)) return { O: a.a, C: a.b, leafSeen: true }
        // không thấy nét cánh: đầu cung nằm trên đường nối hai bản lề / trục dài của khối là đầu "đóng"
        const ux = Math.cos(ang), uy = Math.sin(ang), along = (X: Pt) => Math.abs(((X[0] - h.c[0]) * ux + (X[1] - h.c[1]) * uy) / h.r)
        return along(a.a) >= along(a.b) ? { O: a.b, C: a.a, leafSeen: false } : { O: a.a, C: a.b, leafSeen: false }
      }
      // không có tên cửa: chỉ nhận khi giống cửa thật (cánh ≥ 450 mm, quét ~90°, thấy nét cánh) – tránh nhầm ghế, bàn tròn…
      if (!isDoorName) { const ok = (h: { c: Pt; r: number; arcs: Arc[] }) => mm(h.r) >= 450 && h.arcs.some(a => a.sweep >= 80 && a.sweep <= 100) && openEnd(h).leafSeen; for (let i = hinges.length - 1; i >= 0; i--) if (!ok(hinges[i])) hinges.splice(i, 1); if (!hinges.length) continue }
      // cửa 2 cánh: tìm cặp bản lề có khoảng cách ≈ tổng hai cánh, hai cánh gần bằng nhau (cửa lật 2 chiều vẽ 2 cung mỗi bản lề)
      let pair: [typeof hinges[number], typeof hinges[number]] | null = null, ps = -1
      for (let i = 0; i < hinges.length; i++) for (let j = i + 1; j < hinges.length; j++) { const a = hinges[i], b = hinges[j], d = dist(a.c, b.c)
        if (d < (a.r + b.r) * 0.85 || d > (a.r + b.r) * 1.2 || Math.abs(a.r - b.r) > 0.3 * Math.max(a.r, b.r)) continue
        const sc = a.arcs.length + b.arcs.length - Math.abs(d / (a.r + b.r) - 1); if (sc > ps) { ps = sc; pair = [a, b] } }
      if (pair) {
        const [h1, h2] = pair, d12 = dist(h1.c, h2.c)
        { const { O } = openEnd(h1); out.push({ ...base, kind: 'double', H1: h1.c, H2: h2.c, O, why: `2 cung quay ở 2 bản lề (${Math.round(mm(d12))} mm)` + (isDoorName ? ' + tên cửa' : '') }); continue }
      }
      const h = hinges[0], { O, C, leafSeen } = openEnd(h)
      if (!isDoorName && !leafSeen) continue   // cung lẻ không có cánh, tên không phải cửa → không chắc là cửa
      out.push({ ...base, kind: 'door', H1: h.c, H2: C, O, why: `1 cung quay ${Math.round(h.arcs[0].sweep)}°, cánh ${Math.round(mm(h.r))} mm` + (isDoorName ? ' + tên cửa' : '') })
      continue
    }
    // ---- không có cung ----
    const thin = mm(T) <= 300 && L / Math.max(T, 1e-9) >= 4
    if ((isGlass || isPart) && thin) { out.push({ ...base, kind: 'glass', t: T, why: `dải mảnh ${Math.round(mm(L))}×${Math.round(mm(T))} mm + tên/layer kính` }); continue }
    if (isDoorName && RX.slide.test(txt) && mm(L) >= 600) { out.push({ ...base, kind: 'slide', t: T, why: 'tên cửa trượt, không có cung' }); continue }
    if (RX.window.test(nameT) && thin) { out.push({ ...base, kind: 'window', t: T, why: 'tên cửa sổ' }); continue }
  }
  return out
}

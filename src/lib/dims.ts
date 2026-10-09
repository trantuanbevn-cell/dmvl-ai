// Nhận biết HỆ LƯỚI TRỤC + DIM (kích thước) trong bản vẽ vector → suy ra tỉ lệ thật. Hoàn toàn bằng thuật toán, không AI.
// Chữ số của dim trong bản vẽ AutoCAD thường là hình vẽ (không còn là text) → nhận dạng bằng "tự nhất quán":
// với mỗi tỉ lệ giả định, khoảng cách giữa các trục/đường gióng cho ra con số; hình dạng ký tự phải ứng với đúng một chữ số.
import type { VecPage } from './vector'

export const PT_MM = 25.4 / 72 // 1 pt giấy = 0.3528 mm
export const DIM_RE = /dim|kich ?thuoc|kích ?thước|dimension/i
export const GRID_RE = /axis|grid|luoi|lưới|(^|[^a-z])truc([^a-z]|$)|trục/i
/** layer chỉ dùng để chú thích (dim, lưới trục): không vẽ lên mặt bằng màu, không coi là tường/vách */
export const isAnnoLayer = (layer: string) => DIM_RE.test(layer) || GRID_RE.test(layer)

export const STD_DEN = [20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 125, 150, 200, 250, 300, 400, 500, 600, 750, 1000, 1250, 1500, 2000]

export type ScaleResult = {
  den: number; conf: number // conf 0..1
  via: 'glyph' | 'text'; labels: number; matched: number
  gridX: number; gridY: number // số trục dọc / ngang tìm thấy
  note: string
}

type Glyph = { x0: number; y0: number; x1: number; y1: number; segs: number[] }
type Label = { g: Glyph[]; cx: number; cy: number; ang: 0 | 90; H: number }

/** ký tự của dim là các nét ngắn (font SHX) hoặc vùng tô: gom nét nối nhau thành ký tự, bỏ khung chữ nhật và đường dim dài */
export function readGlyphs(v: VecPage, dimCls: Set<number>): Glyph[] {
  const idx: number[] = []
  for (let i = 0; i < v.nSeg; i++) if (dimCls.has(v.cls[i]) && Math.hypot(v.segs[i * 4 + 2] - v.segs[i * 4], v.segs[i * 4 + 3] - v.segs[i * 4 + 1]) < 8) idx.push(i)
  const par = idx.map((_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])))
  const cell = new Map<string, number[]>(), q = 0.06
  const key = (x: number, y: number) => Math.round(x / q) + ',' + Math.round(y / q)
  idx.forEach((si, k) => { for (const o of [0, 2]) { const kk = key(v.segs[si * 4 + o], v.segs[si * 4 + o + 1]); const a = cell.get(kk); if (a) { par[find(k)] = find(a[0]); a.push(k) } else cell.set(kk, [k]) } })
  const comps = new Map<number, number[]>()
  idx.forEach((si, k) => { const r = find(k); let a = comps.get(r); if (!a) comps.set(r, a = []); a.push(si) })
  let gl: Glyph[] = []
  for (const c of comps.values()) {
    const sg: number[] = []; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (const si of c) { for (let o = 0; o < 4; o++) sg.push(v.segs[si * 4 + o]); for (const o of [0, 2]) { x0 = Math.min(x0, v.segs[si * 4 + o]); x1 = Math.max(x1, v.segs[si * 4 + o]); y0 = Math.min(y0, v.segs[si * 4 + o + 1]); y1 = Math.max(y1, v.segs[si * 4 + o + 1]) } }
    const m = Math.max(x1 - x0, y1 - y0); if (m > 12 || m < 0.3) continue
    // khung chữ nhật: 4 đoạn thẳng đứng/ngang
    if (c.length <= 5 && c.every(si => Math.abs(v.segs[si * 4] - v.segs[si * 4 + 2]) < 0.02 || Math.abs(v.segs[si * 4 + 1] - v.segs[si * 4 + 3]) < 0.02) && (x1 - x0) > 3 && (y1 - y0) > 3) continue
    gl.push({ x0, y0, x1, y1, segs: sg })
  }
  // ghép các mảnh của cùng một ký tự (bbox chồng nhau)
  const h = gl.map(g => Math.max(g.x1 - g.x0, g.y1 - g.y0)).sort((a, b) => a - b), Href = h[Math.floor(h.length * 0.75)] || 1
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) {
      const a = gl[i], b = gl[j], t = Href * 0.06
      if (a.x0 - t <= b.x1 && b.x0 - t <= a.x1 && a.y0 - t <= b.y1 && b.y0 - t <= a.y1) {
        gl[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), segs: a.segs.concat(b.segs) }
        gl.splice(j, 1); changed = true; break outer
      }
    }
  }
  return gl
}

/** gom ký tự thành nhãn (chuỗi số): các ký tự sát nhau theo chiều chữ */
export function clusterLabels(gl: Glyph[]): Label[] {
  if (gl.length < 3) return []
  const sizes = gl.map(g => Math.max(g.x1 - g.x0, g.y1 - g.y0)).sort((a, b) => a - b)
  const Href = sizes[Math.floor(sizes.length * 0.75)]
  const keep = gl.filter(g => Math.max(g.x1 - g.x0, g.y1 - g.y0) >= Href * 0.55)
  const par = keep.map((_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])))
  const gap = Href * 0.9
  for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
    const a = keep[i], b = keep[j]
    const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1))
    if (dx < gap && dy < gap) par[find(i)] = find(j)
  }
  const groups = new Map<number, Glyph[]>()
  keep.forEach((g, i) => { const r = find(i); let a = groups.get(r); if (!a) groups.set(r, a = []); a.push(g) })
  const labels: Label[] = []
  for (const g of groups.values()) {
    if (g.length < 3 || g.length > 8) continue
    const xs = g.map(q => (q.x0 + q.x1) / 2), ys = g.map(q => (q.y0 + q.y1) / 2)
    const rx = Math.max(...xs) - Math.min(...xs), ry = Math.max(...ys) - Math.min(...ys)
    // chỉ nhận chữ nằm ngang hoặc dọc
    let ang: 0 | 90
    if (ry < rx * 0.35) ang = 0; else if (rx < ry * 0.35) ang = 90; else continue
    labels.push({ g, cx: (Math.min(...g.map(q => q.x0)) + Math.max(...g.map(q => q.x1))) / 2, cy: (Math.min(...g.map(q => q.y0)) + Math.max(...g.map(q => q.y1))) / 2, ang, H: Href })
  }
  return labels
}

const GW = 14, GH = 20
type Sig = { bits: Uint8Array; asp: number }
/** dấu vân tay hình dạng ký tự (xoay cho chữ đứng thẳng) */
function signature(g: Glyph, ang: 0 | 90, up: boolean): Sig {
  const tf = (x: number, y: number): [number, number] => (ang === 0 ? [x, y] : up ? [-y, x] : [y, -x])
  const pts: number[] = []
  for (let i = 0; i < g.segs.length; i += 4) { const [a, b] = tf(g.segs[i], g.segs[i + 1]), [c, d] = tf(g.segs[i + 2], g.segs[i + 3]); pts.push(a, b, c, d) }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]) }
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), bits = new Uint8Array(GW * GH)
  for (let i = 0; i < pts.length; i += 4) {
    const n = 40
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = pts[i] + (pts[i + 2] - pts[i]) * t, y = pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t
      const c = Math.min(GW - 1, Math.floor(((x - x0) / w) * GW)), r = Math.min(GH - 1, Math.floor(((y - y0) / h) * GH)); bits[r * GW + c] = 1
    }
  }
  return { bits, asp: w / h }
}
const dil = (b: Uint8Array) => { const o = new Uint8Array(b.length); for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (b[r * GW + c]) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < GH && cc >= 0 && cc < GW) o[rr * GW + cc] = 1 } return o }
const cover = (a: Uint8Array, bd: Uint8Array) => { let n = 0, k = 0; for (let i = 0; i < a.length; i++) if (a[i]) { n++; if (bd[i]) k++ } return n ? k / n : 1 }
const similar = (a: Sig, b: Sig) => {
  if (Math.abs(a.asp - b.asp) > 0.2) return false
  return cover(a.bits, dil(b.bits)) > 0.95 && cover(b.bits, dil(a.bits)) > 0.95
}

/** các đường vuông góc với hướng chữ (trục, đường gióng) cắt ngang vị trí nhãn → các "điểm dừng" để đo khoảng cách */
export function stopsFor(v: VecPage, anno: Set<number>, lb: Label): number[] {
  const out: number[] = [], minL = lb.H * 3
  for (let i = 0; i < v.nSeg; i++) {
    if (!anno.has(v.cls[i])) continue
    const x0 = v.segs[i * 4], y0 = v.segs[i * 4 + 1], x1 = v.segs[i * 4 + 2], y1 = v.segs[i * 4 + 3]
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    if (lb.ang === 0) { // chữ ngang → đường đứng
      if (dx > 0.2 || dy < minL) continue
      if (lb.cy < Math.min(y0, y1) - 3 || lb.cy > Math.max(y0, y1) + 3) continue
      out.push((x0 + x1) / 2)
    } else {
      if (dy > 0.2 || dx < minL) continue
      if (lb.cx < Math.min(x0, x1) - 3 || lb.cx > Math.max(x0, x1) + 3) continue
      out.push((y0 + y1) / 2)
    }
  }
  out.sort((a, b) => a - b)
  const m: number[] = []; for (const s of out) if (!m.length || s - m[m.length - 1] > 0.4) m.push(s)
  return m
}

/** các khoảng (pt) có tâm gần tâm nhãn */
function spansFor(stops: number[], centre: number, tol: number): number[] {
  const r: number[] = []
  for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) {
    const mid = (stops[i] + stops[j]) / 2
    if (Math.abs(mid - centre) <= tol) r.push(stops[j] - stops[i])
    else if (mid > centre + tol && stops[i] > centre) break
  }
  return r
}

function gridCount(v: VecPage, grid: Set<number>) {
  const xs: number[] = [], ys: number[] = []
  for (let i = 0; i < v.nSeg; i++) {
    if (!grid.has(v.cls[i])) continue
    const x0 = v.segs[i * 4], y0 = v.segs[i * 4 + 1], x1 = v.segs[i * 4 + 2], y1 = v.segs[i * 4 + 3]
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    if (dx < 0.2 && dy > 40) xs.push((x0 + x1) / 2); else if (dy < 0.2 && dx > 40) ys.push((y0 + y1) / 2)
  }
  const uniq = (a: number[]) => { a.sort((p, q) => p - q); const m: number[] = []; for (const s of a) if (!m.length || s - m[m.length - 1] > 0.6) m.push(s); return m.length }
  return { gx: uniq(xs), gy: uniq(ys) }
}

/** Suy ra tỉ lệ bản vẽ (mẫu số) từ dim + lưới trục. null nếu không đủ dữ liệu. */
export function detectScale(v: VecPage): ScaleResult | null {
  const dimCls = new Set<number>(), gridCls = new Set<number>()
  v.classes.forEach((c, i) => { if (DIM_RE.test(c.layer)) dimCls.add(i); else if (GRID_RE.test(c.layer)) gridCls.add(i) })
  if (!dimCls.size) return null
  const anno = new Set([...dimCls, ...gridCls])
  const { gx, gy } = gridCount(v, gridCls)
  const labels = clusterLabels(readGlyphs(v, dimCls))
  if (labels.length < 3) return null
  // các khoảng ứng viên của từng nhãn
  const cand = labels.map(lb => {
    const stops = stopsFor(v, anno, lb)
    return spansFor(stops, lb.ang === 0 ? lb.cx : lb.cy, Math.max(2.5, lb.H * 0.9))
  })
  const usable = labels.map((_, i) => i).filter(i => cand[i].length)
  if (usable.length < 3) return null

  let best: { den: number; score: number; matched: number; classes: number } | null = null, second = 0
  for (const up of [true, false]) {
    // lớp ký tự (gộp ký tự giống nhau)
    const protos: Sig[] = [], lab = labels.map(lb => lb.g.map(g => {
      // thứ tự đọc: chữ ngang trái→phải; chữ dọc theo hướng đọc
      return g
    }))
    const order = labels.map((lb, li) => {
      const gs = lab[li].slice()
      if (lb.ang === 0) gs.sort((a, b) => a.x0 - b.x0)
      else if (up) gs.sort((a, b) => b.y0 - a.y0)
      else gs.sort((a, b) => a.y0 - b.y0)
      return gs
    })
    const cls = order.map((gs, li) => gs.map(g => {
      const s = signature(g, labels[li].ang, up)
      let k = protos.findIndex(p => similar(p, s)); if (k < 0) { protos.push(s); k = protos.length - 1 }
      return k
    }))
    if (protos.length > 16) continue // không phải font đồng nhất → bỏ
    for (const den of STD_DEN) {
      const k = PT_MM * den
      const votes = new Map<string, number>(); let denom = 0, matched = 0
      for (const li of usable) {
        const n = order[li].length
        // chọn khoảng cho ra số có đúng n chữ số; chỉ tin các chữ số đầu (đủ chắc dù trục lệch vài mm)
        let used = false
        for (const L of cand[li]) {
          const v0 = L * k, tol = 12 + 0.0005 * v0, lo = String(Math.round(v0 - tol)), hi = String(Math.round(v0 + tol))
          if (lo.length !== n || hi.length !== n) continue
          let m = 0; while (m < n && lo[m] === hi[m]) m++
          if (m < 1) continue
          used = true
          for (let i = 0; i < m; i++) { const key = cls[li][i] + ':' + lo[i]; votes.set(key, (votes.get(key) ?? 0) + 1) }
          denom += 0; break
        }
        denom += Math.max(1, n - 2)
        if (used) matched++
      }
      if (!denom) continue
      // mỗi lớp ký tự → 1 chữ số; mỗi chữ số ← 1 lớp ký tự
      const byClass = new Map<number, Map<string, number>>()
      for (const [key, n] of votes) { const [c, d] = key.split(':'); let m = byClass.get(+c); if (!m) byClass.set(+c, m = new Map()); m.set(d, n) }
      const pick = new Map<string, { c: number; n: number }>(); let sumAll = 0
      for (const [c, m] of byClass) {
        let tot = 0, bd = '', bn = 0; for (const [d, n] of m) { tot += n; if (n > bn) { bn = n; bd = d } }
        sumAll += tot
        const cur = pick.get(bd); if (!cur || cur.n < bn) pick.set(bd, { c, n: bn })
      }
      let ok = 0; for (const p of pick.values()) ok += p.n
      const tv = [...votes.values()].reduce((a, b) => a + b, 0), score = tv ? (ok / tv) * Math.min(1, tv / (0.5 * denom)) * (matched / usable.length) : 0
      if (!best || score > best.score) { if (best && best.den !== den) second = Math.max(second, best.score); best = { den, score, matched, classes: protos.length } }
      else if (den !== best.den) second = Math.max(second, score)
      void sumAll
    }
  }
  if (!best) return null
  const b = best as { den: number; score: number; matched: number; classes: number }
  const conf = Math.max(0, Math.min(1, b.score >= 0.7 ? 0.5 + Math.min(0.5, (b.score - second) * 2.5) : b.score * 0.5))
  if (b.score < 0.7 || b.score - second < 0.08) return null
  return { den: b.den, conf, via: 'glyph', labels: labels.length, matched: b.matched, gridX: gx, gridY: gy, note: `${b.matched}/${usable.length} kích thước khớp, ${gx}×${gy} trục` }
}

// Đọc bản vẽ VECTOR (PDF xuất từ AutoCAD): lấy toàn bộ nét vẽ, độ dày nét, layer (nếu có) và chữ – không dùng AI.
import * as pdfjs from 'pdfjs-dist'
import './pdf' // nạp worker
import { cleanText } from './pdf'
import { isAnnoLayer } from './dims'

const OPS = pdfjs.OPS as Record<string, number>

export type VecClass = { key: string; layer: string; lw: number; fill: boolean; len: number; n: number }
export type VecText = { t: string; x: number; y: number; h: number } // pt, gốc trên-trái
export type VecPage = {
  w: number; h: number // pt
  segs: Float32Array; cls: Uint16Array // x0,y0,x1,y1 (pt, y hướng xuống) + chỉ số lớp
  fills: { cls: number; pts: Float32Array }[]
  classes: VecClass[]; texts: VecText[]; nSeg: number
  arcs: { a: [number, number]; b: [number, number]; m: [number, number]; r: number }[] // các cung ~90° (nghi là cánh cửa quay)
}

type M = [number, number, number, number, number, number]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Đường con có phải một cung ~90° (bán kính hợp lý) không? Trả về hai đầu cung, điểm giữa và bán kính (pt) */
function asArc(s: number[]): VecPage['arcs'][number] | null {
  const n = s.length / 2; if (n < 4 || n > 40) return null
  const ax = s[0], ay = s[1], bx = s[s.length - 2], by = s[s.length - 1]
  const chord = Math.hypot(bx - ax, by - ay); if (chord < 3) return null
  let turn = 0, sign = 0
  for (let i = 1; i < n - 1; i++) {
    const d1x = s[i * 2] - s[i * 2 - 2], d1y = s[i * 2 + 1] - s[i * 2 - 1], d2x = s[i * 2 + 2] - s[i * 2], d2y = s[i * 2 + 3] - s[i * 2 + 1]
    if (Math.hypot(d1x, d1y) < 1e-6 || Math.hypot(d2x, d2y) < 1e-6) continue
    const ang = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y)
    if (sign && Math.sign(ang) !== sign && Math.abs(ang) > 0.05) return null
    if (!sign && Math.abs(ang) > 0.02) sign = Math.sign(ang)
    turn += ang
  }
  const deg = Math.abs(turn) * 180 / Math.PI
  if (deg < 65 || deg > 115) return null
  const r = chord / Math.SQRT2
  // độ dài đường cong ≈ π/2·r
  let len = 0; for (let i = 0; i + 3 < s.length; i += 2) len += Math.hypot(s[i + 2] - s[i], s[i + 3] - s[i + 1])
  if (Math.abs(len / (r * Math.PI / 2) - 1) > 0.15) return null
  const mi = Math.floor(n / 2)
  return { a: [ax, ay], b: [bx, by], m: [s[mi * 2], s[mi * 2 + 1]], r }
}

/** Cửa đi quay: cung ~90° + cánh cửa (đoạn thẳng từ tâm cung, dài bằng bán kính). Trả về đoạn "đóng ô cửa" [x0,y0,x1,y1] (pt) */
export function detectDoors(v: VecPage, mPerPt: number): number[][] {
  const cell = 6, grid = new Map<string, number[]>()
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
  for (let i = 0; i < v.nSeg; i++) for (const k of [0, 2]) { const kk = key(v.segs[i * 4 + k], v.segs[i * 4 + k + 1]); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(i) }
  const near = (x: number, y: number, tol: number) => { const out: number[] = []; for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (const i of grid.get(`${Math.floor(x / cell) + gx},${Math.floor(y / cell) + gy}`) ?? []) out.push(i); return out.filter((i, k, a) => a.indexOf(i) === k) }
  const doors: number[][] = [], seen = new Set<string>()
  for (const ar of v.arcs) {
    const rm = ar.r * mPerPt; if (rm < 0.45 || rm > 1.4) continue
    // tâm cung: nằm đối diện điểm giữa cung qua dây cung
    const mx = (ar.a[0] + ar.b[0]) / 2, my = (ar.a[1] + ar.b[1]) / 2
    let nx = -(ar.b[1] - ar.a[1]), ny = ar.b[0] - ar.a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl
    if ((ar.m[0] - mx) * nx + (ar.m[1] - my) * ny > 0) { nx = -nx; ny = -ny }
    const h: [number, number] = [mx + nx * (Math.hypot(ar.b[0] - ar.a[0], ar.b[1] - ar.a[1]) / 2), my + ny * (Math.hypot(ar.b[0] - ar.a[0], ar.b[1] - ar.a[1]) / 2)]
    const tol = Math.max(2, ar.r * 0.12)
    let leafEnd: 'a' | 'b' | null = null
    for (const i of near(h[0], h[1], tol)) {
      const p = [v.segs[i * 4], v.segs[i * 4 + 1]], q = [v.segs[i * 4 + 2], v.segs[i * 4 + 3]]
      for (const [e, o] of [[p, q], [q, p]]) {
        if (Math.hypot(e[0] - h[0], e[1] - h[1]) > tol) continue
        if (Math.abs(Math.hypot(o[0] - h[0], o[1] - h[1]) - ar.r) > tol) continue
        if (Math.hypot(o[0] - ar.a[0], o[1] - ar.a[1]) < tol) leafEnd = 'a'
        else if (Math.hypot(o[0] - ar.b[0], o[1] - ar.b[1]) < tol) leafEnd = 'b'
      }
      if (leafEnd) break
    }
    if (!leafEnd) continue
    const other = leafEnd === 'a' ? ar.b : ar.a
    const k = `${Math.round(h[0])},${Math.round(h[1])},${Math.round(other[0])},${Math.round(other[1])}`; if (seen.has(k)) continue; seen.add(k)
    doors.push([h[0], h[1], other[0], other[1]])
  }
  return doors
}

export async function readVectorPage(data: ArrayBuffer, pageNo = 1, onLog?: (s: string) => void): Promise<VecPage> {
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise
  const page = await doc.getPage(Math.min(pageNo, doc.numPages))
  const vp = page.getViewport({ scale: 1 })
  const base = vp.transform as M
  let ocName: (id: string) => string = () => ''
  try {
    const cfg: any = await (doc as any).getOptionalContentConfig()
    ocName = (id: string) => { try { return String(cfg.getGroup(id)?.name ?? '') } catch { return '' } }
  } catch { /* không có layer */ }
  onLog?.('Đang đọc lệnh vẽ trong PDF...')
  const ol = await page.getOperatorList()
  const classIdx = new Map<string, number>(), classes: VecClass[] = []
  const cls = (layer: string, lw: number, fill: boolean) => {
    const w = fill ? -1 : Math.round(lw * 20) / 20
    const key = `${layer}|${fill ? 'fill' : w}`
    let i = classIdx.get(key)
    if (i === undefined) { i = classes.length; classIdx.set(key, i); classes.push({ key, layer, lw: w, fill, len: 0, n: 0 }) }
    return i
  }
  const arcs: VecPage['arcs'] = []
  const segs: number[] = [], segCls: number[] = [], fills: { cls: number; pts: Float32Array }[] = []
  let ctm: M = base; const stack: M[] = []
  const layerStack: string[] = []; let lw = 1
  let cur: number[][] = [] // các đường con (toạ độ đã đổi sang pt trang)
  let sub: number[] = [], cx = 0, cy = 0, sx = 0, sy = 0
  const flush = () => { if (sub.length >= 4) cur.push(sub); sub = [] }
  const pt = (x: number, y: number) => ap(ctm, x, y)
  const move = (x: number, y: number) => { flush(); const [a, b] = pt(x, y); sub = [a, b]; cx = a; cy = b; sx = a; sy = b }
  const line = (x: number, y: number) => { const [a, b] = pt(x, y); if (!sub.length) sub = [cx, cy]; sub.push(a, b); cx = a; cy = b }
  const bez = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const [a1, b1] = pt(x1, y1), [a2, b2] = pt(x2, y2), [a3, b3] = pt(x3, y3)
    if (!sub.length) sub = [cx, cy]
    for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t; sub.push(u * u * u * cx + 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t * a3, u * u * u * cy + 3 * u * u * t * b1 + 3 * u * t * t * b2 + t * t * t * b3) }
    cx = a3; cy = b3
  }
  const close = () => { if (sub.length >= 2) { sub.push(sx, sy); cx = sx; cy = sy } }
  const scale = () => Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]))
  const paint = (stroke: boolean, fill: boolean) => {
    flush()
    const layer = layerStack.length ? layerStack[layerStack.length - 1] : ''
    if (stroke) {
      const ci = cls(layer, lw * scale(), false), c = classes[ci]
      for (const s of cur) {
        const arc = asArc(s); if (arc && arcs.length < 20000) arcs.push(arc)
      }
      for (const s of cur) for (let i = 0; i + 3 < s.length; i += 2) {
        const dx = s[i + 2] - s[i], dy = s[i + 3] - s[i + 1], L = Math.hypot(dx, dy); if (L < 0.05) continue
        segs.push(s[i], s[i + 1], s[i + 2], s[i + 3]); segCls.push(ci); c.len += L; c.n++
      }
    }
    if (fill) {
      const ci = cls(layer, 0, true)
      for (const s of cur) if (s.length >= 6) { fills.push({ cls: ci, pts: new Float32Array(s) }); classes[ci].n++; classes[ci].len += s.length / 2 }
    }
    cur = []; sub = []
  }
  for (let i = 0; i < ol.fnArray.length; i++) {
    const f = ol.fnArray[i], a: any = ol.argsArray[i]
    switch (f) {
      case OPS.save: stack.push(ctm); layerStack.push(layerStack[layerStack.length - 1] ?? ''); break
      case OPS.restore: ctm = stack.pop() ?? ctm; layerStack.pop(); break
      case OPS.transform: ctm = mul(ctm, a as M); break
      case OPS.paintFormXObjectBegin: stack.push(ctm); layerStack.push(layerStack[layerStack.length - 1] ?? ''); if (a?.[0]) ctm = mul(ctm, a[0] as M); break
      case OPS.paintFormXObjectEnd: ctm = stack.pop() ?? ctm; layerStack.pop(); break
      case OPS.setLineWidth: lw = a[0]; break
      case OPS.beginMarkedContentProps: {
        const id = a?.[1]?.id ?? (typeof a?.[1] === 'string' ? a[1] : '')
        const name = a?.[0] === 'OC' && id ? ocName(id) : ''
        layerStack.push(name || (layerStack[layerStack.length - 1] ?? '')); break
      }
      case OPS.beginMarkedContent: layerStack.push(layerStack[layerStack.length - 1] ?? ''); break
      case OPS.endMarkedContent: layerStack.pop(); break
      case OPS.constructPath: {
        const ops: number[] = a[0], co: ArrayLike<number> = a[1]; let k = 0
        for (const op of ops) {
          if (op === OPS.moveTo) { move(co[k], co[k + 1]); k += 2 }
          else if (op === OPS.lineTo) { line(co[k], co[k + 1]); k += 2 }
          else if (op === OPS.curveTo) { bez(co[k], co[k + 1], co[k + 2], co[k + 3], co[k + 4], co[k + 5]); k += 6 }
          else if (op === OPS.curveTo2) { bez(cx, cy, co[k], co[k + 1], co[k + 2], co[k + 3]); k += 4 }
          else if (op === OPS.curveTo3) { bez(co[k], co[k + 1], co[k + 2], co[k + 3], co[k + 2], co[k + 3]); k += 4 }
          else if (op === OPS.closePath) close()
          else if (op === OPS.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; k += 4; move(x, y); line(x + w, y); line(x + w, y + h); line(x, y + h); close(); flush() }
        }
        break
      }
      case OPS.stroke: paint(true, false); break
      case OPS.closeStroke: close(); paint(true, false); break
      case OPS.fill: case OPS.eoFill: paint(false, true); break
      case OPS.fillStroke: case OPS.eoFillStroke: paint(true, true); break
      case OPS.closeFillStroke: case OPS.closeEOFillStroke: close(); paint(true, true); break
      case OPS.endPath: cur = []; sub = []; break
    }
  }
  // chữ
  const texts: VecText[] = []
  try {
    const tc = await page.getTextContent()
    for (const it of tc.items as any[]) {
      const t = cleanText(String(it.str ?? '')).trim(); if (!t) continue
      const m = pdfjs.Util.transform(base, it.transform)
      texts.push({ t, x: m[4], y: m[5], h: Math.hypot(m[2], m[3]) })
    }
  } catch { /* */ }
  onLog?.(`  ${segs.length / 4} đoạn nét, ${fills.length} vùng tô, ${classes.length} nhóm nét/layer, ${texts.length} chữ`)
  const out: VecPage = { arcs, w: vp.width, h: vp.height, segs: new Float32Array(segs), cls: new Uint16Array(segCls), fills, classes, texts, nSeg: segs.length / 4 }
  page.cleanup()
  return out
}

/** Gợi ý nhóm nét là TƯỜNG: layer có tên giống "wall/tường" nếu có, ngược lại các nét dày nhất có số lượng đáng kể */
export function guessWallClasses(v: VecPage): Set<number> {
  const out = new Set<number>()
  const byName = v.classes.map((c, i) => (!c.fill && /wall|tuong|tường|a-wall|struct|column|cot|cột|vach|vách/i.test(c.layer) ? i : -1)).filter(i => i >= 0)
  const glass = v.classes.map((c, i) => (!c.fill && /glass|kinh|kính|window|curtain|cua so|cửa sổ|vach kinh|vách kính|partition/i.test(c.layer) ? i : -1)).filter(i => i >= 0)
  if (byName.length) { byName.forEach(i => out.add(i)); glass.forEach(i => out.add(i)); return out }
  const stroke = v.classes.map((c, i) => ({ c, i })).filter(x => !x.c.fill && !isAnnoLayer(x.c.layer))
  const total = stroke.reduce((s, x) => s + x.c.len, 0) || 1
  const widths = [...new Set(stroke.map(x => x.c.lw))].sort((a, b) => b - a)
  let thr = widths[widths.length - 1] ?? 0
  for (const w of widths) { const len = stroke.filter(x => x.c.lw === w).reduce((s, x) => s + x.c.len, 0); if (len / total >= 0.03) { thr = w; break } }
  for (const x of stroke) if (x.c.lw >= thr * 0.99) out.add(x.i)
  glass.forEach(i => out.add(i))
  return out
}

// Tô màu SÀN từng không gian trên mặt bằng PDF vector đã vẽ ra ảnh: nền sàn có màu, nét tường/đồ nội thất giữ nguyên,
// phần bên trong đồ nội thất (vùng trắng bị nét vẽ bao kín, tách rời sàn) để TRẮNG. Hoàn toàn bằng thuật toán, không AI.
import * as pdfjs from 'pdfjs-dist'
import './pdf'
import { roomPolys } from './cadZones'
import { isAnnoLayer } from './dims'
import { readVectorPage } from './vector'
import { loadCv } from './cv'
import type { FloorGeom } from './types'
import { regularize } from './shape'

export type PlanPaint = {
  W: number; H: number; crop: { x: number; y: number; w: number; h: number }
  /** vẽ ảnh đã cắt khung; colorOfRaw: màu (#rrggbb) theo id phòng kín gốc */
  paint: (colorOfRaw: (rawId: number) => string) => HTMLCanvasElement
  /** mặt bằng dạng VECTOR (SVG, toạ độ theo khung cắt `crop`): sàn tô màu liền khít + nét bản vẽ gốc. null nếu không dựng được */
  svg: ((colorOfRaw: (rawId: number) => string) => string) | null
}
const hex = (s: string): [number, number, number] => { const n = parseInt(s.replace('#', '').padEnd(6, '0'), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

export async function buildPlanPaint(buf: ArrayBuffer, pageNo: number, g: FloorGeom, longEdge = 3400): Promise<PlanPaint> {
    // đọc nét vector (đúng thứ tự vẽ, đúng màu) rồi TỰ VẼ lên canvas: bỏ lớp dim + lưới trục, nhanh hơn và không phụ thuộc bộ dựng hình của PDF.js
  let vv: Awaited<ReturnType<typeof readVectorPage>> | null = null
  try { vv = await readVectorPage(buf, pageNo, undefined, { draw: true }) } catch (e) { console.warn('đọc vector lỗi', e) }
  let c: HTMLCanvasElement, cx: CanvasRenderingContext2D
  if (vv?.draw?.length) {
    const sc = longEdge / Math.max(vv.w, vv.h)
    c = document.createElement('canvas'); c.width = Math.round(vv.w * sc); c.height = Math.round(vv.h * sc)
    cx = c.getContext('2d', { willReadFrequently: true })!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
    cx.setTransform(c.width / vv.w, 0, 0, c.height / vv.h, 0, 0); cx.lineJoin = 'round'; cx.lineCap = 'round'
    for (const r of vv.draw) {
      if (isAnnoLayer(vv.classes[r.cls]?.layer ?? '')) continue
      const p = new Path2D(r.d)
      if (r.fc) { cx.fillStyle = r.fc; cx.fill(p) }
      if (r.sc) { cx.strokeStyle = r.sc; cx.lineWidth = Math.max(r.lw, 0.18); cx.stroke(p) }
    }
    cx.fillStyle = '#000'
    for (const t of vv.texts) { if (t.t.length < 2 || /^[\d.,\s]+$/.test(t.t)) continue; cx.save(); cx.translate(t.x, t.y); if (t.rot) cx.rotate((t.rot * Math.PI) / 180); cx.font = `${t.h}px Arial, sans-serif`; cx.fillText(t.t, 0, 0); cx.restore() }
    cx.setTransform(1, 0, 0, 1, 0, 0)
  } else { // không đọc được nét vector → dựng bằng PDF.js (không ẩn được lớp)
    const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
    const page = await doc.getPage(Math.min(pageNo, doc.numPages))
    const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: longEdge / Math.max(v1.width, v1.height) })
    c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height)
    cx = c.getContext('2d', { willReadFrequently: true })!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvasContext: cx, viewport: vp } as any).promise
  }
  const W = c.width, H = c.height, N = W * H
  const base = cx.getImageData(0, 0, W, H), d = base.data
  const lum = new Uint8Array(N), ink = new Uint8Array(N)
  for (let i = 0; i < N; i++) { const l = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; lum[i] = l; ink[i] = l < 225 ? 1 : 0 }
  const inkD = ink.slice()   // giãn nét 1 px để bít khe hở nhỏ của nét đồ nội thất
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!ink[i]) continue; if (x > 0) inkD[i - 1] = 1; if (x < W - 1) inkD[i + 1] = 1; if (y > 0) inkD[i - W] = 1; if (y < H - 1) inkD[i + W] = 1 }

  // bản đồ id phòng kín gốc – tô đa giác bằng thuật toán quét dòng (không khử răng cưa → không sinh pixel lẫn màu)
    const raw = g.raw_rooms ?? g.rooms
  const roomOf = new Uint16Array(N)
  raw.forEach((r, k) => {
    for (const poly of roomPolys(r)) {
      const P = poly.map(p => [p[0] * W, p[1] * H]), n = P.length; if (n < 3) continue
      let ymin = 1e9, ymax = -1e9; for (const p of P) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]) }
      for (let y = Math.max(0, Math.ceil(ymin - 0.5)); y <= Math.min(H - 1, Math.floor(ymax - 0.5)); y++) {
        const yc = y + 0.5, xs: number[] = []
        for (let i = 0, j = n - 1; i < n; j = i++) { const a = P[i], b = P[j]; if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) }
        xs.sort((p, q) => p - q)
        for (let t = 0; t + 1 < xs.length; t += 2) for (let x = Math.max(0, Math.ceil(xs[t] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[t + 1] - 0.5)); x++) roomOf[y * W + x] = k + 1
      }
    }
  })
  // lấp khe hở giữa 2 vùng giáp nhau (đa giác được đơn giản hoá riêng nên có thể hở 1–3 px) → không còn vệt trắng
  {
    const R = 3, out = roomOf.slice()
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (roomOf[i]) continue
      let l = 0, r = 0, u = 0, d2 = 0, dl = 0, dr = 0, du = 0, dd = 0
      for (let k = 1; k <= R; k++) { if (!l && x - k >= 0 && roomOf[i - k]) { l = roomOf[i - k]; dl = k } if (!r && x + k < W && roomOf[i + k]) { r = roomOf[i + k]; dr = k } if (!u && y - k >= 0 && roomOf[i - k * W]) { u = roomOf[i - k * W]; du = k } if (!d2 && y + k < H && roomOf[i + k * W]) { d2 = roomOf[i + k * W]; dd = k } }
      let best = 0, bd = 99
      if (l && r) { if (dl <= dr) { best = l; bd = dl } else { best = r; bd = dr } }
      if (u && d2) { const [v, dist] = du <= dd ? [u, du] : [d2, dd]; if (dist < bd) { best = v; bd = dist } }
      if (best) out[i] = best
    }
    roomOf.set(out)
  }
  // thành phần liên thông của vùng "không nét" trong từng phòng
  const comp = new Int32Array(N), sizes: number[] = [0], compRoom: number[] = [0], stack = new Int32Array(N)
  for (let s = 0; s < N; s++) {
    const r = roomOf[s]; if (!r || inkD[s] || comp[s]) continue
    const id = sizes.length; let sz = 0, sp = 0; stack[sp++] = s; comp[s] = id
    while (sp) {
      const i = stack[--sp]; sz++; const x = i % W
      if (x > 0) { const j = i - 1; if (roomOf[j] === r && !inkD[j] && !comp[j]) { comp[j] = id; stack[sp++] = j } }
      if (x < W - 1) { const j = i + 1; if (roomOf[j] === r && !inkD[j] && !comp[j]) { comp[j] = id; stack[sp++] = j } }
      if (i >= W) { const j = i - W; if (roomOf[j] === r && !inkD[j] && !comp[j]) { comp[j] = id; stack[sp++] = j } }
      if (i < N - W) { const j = i + W; if (roomOf[j] === r && !inkD[j] && !comp[j]) { comp[j] = id; stack[sp++] = j } }
    }
    sizes.push(sz); compRoom.push(r)
  }
  const pxPerM = (W / g.w) / g.m_per_pt, minPx = 0.4 * pxPerM * pxPerM
  const maxOf = new Map<number, number>(); sizes.forEach((s, i) => i && maxOf.set(compRoom[i], Math.max(maxOf.get(compRoom[i]) ?? 0, s)))
  const keepC = sizes.map((s, i) => !!i && s >= Math.max(0.3 * (maxOf.get(compRoom[i]) ?? 0), minPx))
  let keep = new Uint16Array(N)
  for (let i = 0; i < N; i++) { const k = comp[i]; if (k && keepC[k]) keep[i] = roomOf[i] }
  // trả lại vành 1 px sát nét cho phần sàn (do đã giãn nét)
  const k2 = keep.slice()
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (keep[i] || ink[i] || !inkD[i]) continue
    const v = (x > 0 && keep[i - 1]) || (x < W - 1 && keep[i + 1]) || (y > 0 && keep[i - W]) || (y < H - 1 && keep[i + W]) || 0
    if (v) k2[i] = v
  }
  keep = k2

  // khung cắt = bao của mọi phòng + lề
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const r of raw) for (const poly of roomPolys(r)) for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1 }
  const m = 0.03 * Math.max(x1 - x0, y1 - y0)
  const crop = { x: Math.max(0, Math.floor((x0 - m) * W)), y: Math.max(0, Math.floor((y0 - m) * H)), w: 0, h: 0 }
  crop.w = Math.min(W, Math.ceil((x1 + m) * W)) - crop.x; crop.h = Math.min(H, Math.ceil((y1 + m) * H)) - crop.y

  const paint = (colorOfRaw: (rawId: number) => string) => {
    const cols = raw.map(r => hex(colorOfRaw(r.id)))
    const out = new ImageData(crop.w, crop.h), o = out.data
    for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
      const i = (y + crop.y) * W + x + crop.x, j = (y * crop.w + x) * 4, k = keep[i]
      if (k && !ink[i]) { const l = lum[i] / 255, cc = cols[k - 1]; o[j] = cc[0] * l; o[j + 1] = cc[1] * l; o[j + 2] = cc[2] * l; o[j + 3] = 255 }
      else { o[j] = d[i * 4]; o[j + 1] = d[i * 4 + 1]; o[j + 2] = d[i * 4 + 2]; o[j + 3] = 255 }
    }
    const oc = document.createElement('canvas'); oc.width = crop.w; oc.height = crop.h
    oc.getContext('2d')!.putImageData(out, 0, 0)
    return oc
  }
  // ---- bản vector: viền các vùng sàn (có lỗ cho đồ nội thất) + nét bản vẽ gốc đúng thứ tự vẽ
  let svg: PlanPaint['svg'] = null
  try {
    const cv = await loadCv()
    if (vv?.draw?.length) {
      const sx = W / vv.w
      const floorD: string[] = raw.map(() => '')
      const ids = new Map<number, [number, number, number, number]>()
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = keep[y * W + x]; if (!k) continue; const b = ids.get(k); if (!b) ids.set(k, [x, y, x, y]); else { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y } }
      for (const [k, [bx0, by0, bx1, by1]] of ids) {
        const bw = bx1 - bx0 + 7, bh = by1 - by0 + 7, sub = new cv.Mat(bh, bw, cv.CV_8UC1, new cv.Scalar(0))
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (keep[y * W + x] === k) sub.data[(y - by0 + 3) * bw + (x - bx0 + 3)] = 255
        // bịt các khe nhỏ do nét đồ đạc / nét đứt cửa (vẫn nằm trong vùng của chính phòng này, không tràn sang phòng khác)
        const ker = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)); cv.morphologyEx(sub, sub, cv.MORPH_CLOSE, ker); ker.delete()
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const X = x + bx0 - 3, Y = y + by0 - 3; if (sub.data[y * bw + x] && X >= 0 && Y >= 0 && X < W && Y < H) { const o = keep[Y * W + X]; if (o && o !== k) sub.data[y * bw + x] = 0 } }
        const cs = new cv.MatVector(), hi = new cv.Mat(); cv.findContours(sub, cs, hi, cv.RETR_CCOMP, cv.CHAIN_APPROX_NONE)
        let d = ''
        for (let c = 0; c < cs.size(); c++) {
          const cc = cs.get(c), isHole = hi.data32S[c * 4 + 3] >= 0, area = cv.contourArea(cc)
          if (area < (isHole ? 0.25 : 0.3) * pxPerM * pxPerM) { cc.delete(); continue }   // lỗ nhỏ (<0,25 m²) coi như sàn liền
          const pts: [number, number][] = []; for (let q = 0; q < cc.rows; q++) pts.push([cc.data32S[q * 2] + bx0 - 3 + 0.5, cc.data32S[q * 2 + 1] + by0 - 3 + 0.5])
          d += regularize(pts, pxPerM); cc.delete()
        }
        cs.delete(); hi.delete(); sub.delete(); floorD[k - 1] = d
      }
      const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      let lines = ''
      for (const r of vv.draw) {
        if (isAnnoLayer(vv.classes[r.cls]?.layer ?? '')) continue
        const w = Math.max(r.lw, 0.18)
        lines += `<path d="${r.d}" fill="${r.fc ?? 'none'}" stroke="${r.sc ?? 'none'}"${r.sc ? ` stroke-width="${+w.toFixed(3)}"` : ''}/>`
      }
      let txt = ''
      for (const t of vv.texts) { if (t.t.length < 2 || /^[\d.,\s]+$/.test(t.t)) continue; txt += `<text transform="translate(${+t.x.toFixed(2)} ${+t.y.toFixed(2)})${t.rot ? ` rotate(${t.rot})` : ''}" font-size="${+t.h.toFixed(2)}" font-family="Arial,sans-serif" fill="#000" stroke="none">${esc(t.t)}</text>` }
      const lineLayer = `<g style="mix-blend-mode:multiply;isolation:isolate" transform="translate(${-crop.x} ${-crop.y}) scale(${sx})" stroke-linejoin="round" stroke-linecap="round"><rect x="0" y="0" width="${vv.w}" height="${vv.h}" fill="#fff" stroke="none"/>${lines}${txt}</g>`
      svg = (colorOfRaw: (rawId: number) => string) => {
        let f = ''
        raw.forEach((r, k) => { if (floorD[k]) { const c = colorOfRaw(r.id); f += `<path d="${floorD[k]}" fill="${c}" stroke="${c}" stroke-width="1.4"/>` } })
        return `<g transform="translate(${-crop.x} ${-crop.y})" fill-rule="evenodd" stroke-linejoin="round">${f}</g>${lineLayer}`
      }
    }
  } catch (e) { console.warn('Không dựng được bản vector, dùng ảnh', e) }
  return { W, H, crop, paint, svg }
}

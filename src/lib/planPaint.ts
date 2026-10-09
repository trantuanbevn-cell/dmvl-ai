// Tô màu SÀN từng không gian trên mặt bằng PDF vector đã vẽ ra ảnh: nền sàn có màu, nét tường/đồ nội thất giữ nguyên,
// phần bên trong đồ nội thất (vùng trắng bị nét vẽ bao kín, tách rời sàn) để TRẮNG. Hoàn toàn bằng thuật toán, không AI.
import * as pdfjs from 'pdfjs-dist'
import './pdf'
import { roomPolys } from './cadZones'
import { isAnnoLayer } from './dims'
import type { FloorGeom } from './types'

export type PlanPaint = {
  W: number; H: number; crop: { x: number; y: number; w: number; h: number }
  /** vẽ ảnh đã cắt khung; colorOfRaw: màu (#rrggbb) theo id phòng kín gốc */
  paint: (colorOfRaw: (rawId: number) => string) => HTMLCanvasElement
}
const hex = (s: string): [number, number, number] => { const n = parseInt(s.replace('#', '').padEnd(6, '0'), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }

export async function buildPlanPaint(buf: ArrayBuffer, pageNo: number, g: FloorGeom, longEdge = 3400): Promise<PlanPaint> {
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
  const page = await doc.getPage(Math.min(pageNo, doc.numPages))
  const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: longEdge / Math.max(v1.width, v1.height) })
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height)
  const cx = c.getContext('2d', { willReadFrequently: true })!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height)
  // ẩn lớp lưới trục + dim: chỉ dùng làm dữ liệu đo, không thể hiện trên mặt bằng màu
  let ocp: Promise<any> | undefined
  try {
    const cfg: any = await (doc as any).getOptionalContentConfig()
    for (const [id, gp] of Object.entries((cfg.getGroups?.() ?? {}) as Record<string, { name?: string }>)) if (isAnnoLayer(String(gp?.name ?? ''))) cfg.setVisibility(id, false)
    ocp = Promise.resolve(cfg)
  } catch { /* PDF không có layer */ }
  await page.render({ canvasContext: cx, viewport: vp, ...(ocp ? { optionalContentConfigPromise: ocp } : {}) } as any).promise
  const W = c.width, H = c.height, N = W * H
  const base = cx.getImageData(0, 0, W, H), d = base.data
  const lum = new Uint8Array(N), ink = new Uint8Array(N)
  for (let i = 0; i < N; i++) { const l = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; lum[i] = l; ink[i] = l < 225 ? 1 : 0 }
  const inkD = ink.slice()   // giãn nét 1 px để bít khe hở nhỏ của nét đồ nội thất
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!ink[i]) continue; if (x > 0) inkD[i - 1] = 1; if (x < W - 1) inkD[i + 1] = 1; if (y > 0) inkD[i - W] = 1; if (y < H - 1) inkD[i + W] = 1 }

  // bản đồ id phòng kín gốc
  const raw = g.raw_rooms ?? g.rooms
  const ic = document.createElement('canvas'); ic.width = W; ic.height = H
  const ig = ic.getContext('2d', { willReadFrequently: true })!
  raw.forEach((r, k) => { ig.fillStyle = `rgb(${(k + 1) & 255},${(k + 1) >> 8},0)`; for (const poly of roomPolys(r)) { ig.beginPath(); poly.forEach((p, j) => (j ? ig.lineTo(p[0] * W, p[1] * H) : ig.moveTo(p[0] * W, p[1] * H))); ig.closePath(); ig.fill() } })
  const idd = ig.getImageData(0, 0, W, H).data, roomOf = new Uint16Array(N)
  for (let i = 0; i < N; i++) if (idd[i * 4 + 3] === 255) roomOf[i] = idd[i * 4] + (idd[i * 4 + 1] << 8)

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
  return { W, H, crop, paint }
}

const imgCache = new Map<string, Promise<HTMLImageElement>>()
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imgCache.get(url)
  if (!p) {
    p = new Promise((ok, fail) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = () => fail(new Error('load ' + url)); im.src = url })
    imgCache.set(url, p)
  }
  return p
}

/** Cắt vùng bbox [x,y,w,h] (0..1) từ ảnh trang → canvas */
export async function cropCanvas(url: string, bbox: number[], maxEdge = 480): Promise<HTMLCanvasElement> {
  const im = await loadImage(url)
  const [x, y, w, h] = clampBox(bbox)
  const sx = x * im.naturalWidth, sy = y * im.naturalHeight, sw = Math.max(4, w * im.naturalWidth), sh = Math.max(4, h * im.naturalHeight)
  const r = Math.min(1, maxEdge / Math.max(sw, sh))
  const c = document.createElement('canvas'); c.width = Math.round(sw * r); c.height = Math.round(sh * r)
  c.getContext('2d')!.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c
}
export async function cropBase64(url: string, bbox: number[], maxEdge = 800): Promise<string> {
  const c = await cropCanvas(url, bbox, maxEdge)
  return c.toDataURL('image/jpeg', 0.88).split(',')[1]
}
export function clampBox(b: number[]): [number, number, number, number] {
  let [x, y, w, h] = b.map(v => (Number.isFinite(v) ? v : 0))
  // AI đôi khi trả theo thang 0..1000
  if (x > 1 || y > 1 || w > 1 || h > 1) { x /= 1000; y /= 1000; w /= 1000; h /= 1000 }
  x = Math.min(Math.max(x, 0), 0.99); y = Math.min(Math.max(y, 0), 0.99)
  w = Math.min(Math.max(w, 0.01), 1 - x); h = Math.min(Math.max(h, 0.01), 1 - y)
  return [x, y, w, h]
}
/** Chuẩn hóa khung do AI trả về → [x,y,w,h] thang 0..1 (hoặc null nếu không hợp lệ).
 *  Gemini trả `box_2d` = [ymin, xmin, ymax, xmax] thang 0..1000; vẫn chấp nhận `bbox` [x,y,w,h] kiểu cũ. */
export function normalizeAIBox(it: { box_2d?: unknown; bbox?: unknown }): number[] | null {
  const num = (a: unknown) => (Array.isArray(a) && a.length === 4 && a.every(v => typeof v === 'number' && Number.isFinite(v)) ? (a as number[]) : null)
  const b2 = num(it.box_2d)
  let x: number, y: number, w: number, h: number
  if (b2) {
    const sc = Math.max(...b2) <= 1.5 ? 1 : 1000
    const [y0, x0, y1, x1] = b2.map(v => v / sc)
    x = Math.min(x0, x1); y = Math.min(y0, y1); w = Math.abs(x1 - x0); h = Math.abs(y1 - y0)
  } else {
    const b = num(it.bbox); if (!b) return null
    ;[x, y, w, h] = clampBox(b)
  }
  x = Math.min(Math.max(x, 0), 1); y = Math.min(Math.max(y, 0), 1)
  w = Math.min(w, 1 - x); h = Math.min(h, 1 - y)
  if (w < 0.012 || h < 0.012) return null
  return [+x.toFixed(4), +y.toFixed(4), +w.toFixed(4), +h.toFixed(4)]
}

/** Vùng ngữ cảnh rộng quanh khung (thang 0..1 của ảnh trang) – để người xem thấy bối cảnh xung quanh vật thể */
export function contextRegion(bbox: number[]): { rx: number; ry: number; rw: number; rh: number } {
  const [x, y, w, h] = clampBox(bbox)
  const rw = Math.min(1, Math.max(w * 3, 0.36)), rh = Math.min(1, Math.max(h * 3, 0.48))
  const rx = Math.min(Math.max(x + w / 2 - rw / 2, 0), 1 - rw), ry = Math.min(Math.max(y + h / 2 - rh / 2, 0), 1 - rh)
  return { rx, ry, rw, rh }
}
/** Hình học mũi tên đỏ + khung, toạ độ tương đối trong vùng ngữ cảnh (0..1) */
export function arrowGeom(bbox: number[]) {
  const [x, y, w, h] = clampBox(bbox)
  const { rx, ry, rw, rh } = contextRegion(bbox)
  const bx = (x - rx) / rw, by = (y - ry) / rh, bw = w / rw, bh = h / rh
  const sx = bx > 0.28 ? -1 : 1, sy = by > 0.28 ? -1 : 1
  const tx = bx + (sx < 0 ? 0.15 : 0.85) * bw, ty = by + (sy < 0 ? 0.15 : 0.85) * bh
  const cl = (v: number) => Math.min(0.97, Math.max(0.03, v))
  return { box: { x: bx, y: by, w: bw, h: bh }, tip: { x: tx, y: ty }, tail: { x: cl(tx + sx * 0.24), y: cl(ty + sy * 0.26) } }
}
/** Ảnh crop RỘNG (có bối cảnh) + khung và mũi tên đỏ chỉ vào đối tượng */
export async function contextCanvas(url: string, bbox: number[], maxEdge = 560, arrow = true): Promise<HTMLCanvasElement> {
  const im = await loadImage(url)
  const { rx, ry, rw, rh } = contextRegion(bbox)
  const sx = rx * im.naturalWidth, sy = ry * im.naturalHeight, sw = rw * im.naturalWidth, sh = rh * im.naturalHeight
  const r = Math.min(1, maxEdge / Math.max(sw, sh))
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(sw * r)); c.height = Math.max(8, Math.round(sh * r))
  const g = c.getContext('2d')!
  g.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height)
  if (!arrow) return c
  const a = arrowGeom(bbox), W = c.width, H = c.height, lw = Math.max(2, Math.round(Math.max(W, H) / 120))
  const draw = (color: string, extra: number) => {
    g.strokeStyle = color; g.fillStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'
    g.lineWidth = lw + extra
    g.strokeRect(a.box.x * W, a.box.y * H, a.box.w * W, a.box.h * H)
    const x1 = a.tail.x * W, y1 = a.tail.y * H, x2 = a.tip.x * W, y2 = a.tip.y * H
    const ang = Math.atan2(y2 - y1, x2 - x1), hl = lw * 5.5, hw = lw * 3
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - Math.cos(ang) * hl * 0.6, y2 - Math.sin(ang) * hl * 0.6); g.stroke()
    g.beginPath(); g.moveTo(x2, y2)
    g.lineTo(x2 - Math.cos(ang) * hl + Math.sin(ang) * hw, y2 - Math.sin(ang) * hl - Math.cos(ang) * hw)
    g.lineTo(x2 - Math.cos(ang) * hl - Math.sin(ang) * hw, y2 - Math.sin(ang) * hl + Math.cos(ang) * hw)
    g.closePath(); g.fill()
  }
  g.save(); g.setLineDash([]); draw('rgba(255,255,255,0.95)', lw * 1.2); g.restore()
  draw('#e11d1d', 0)
  return c
}

/** Ô màu (map tạm) từ mã hex */
export function swatchBase64(hex: string, w = 120, h = 90): string {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!; g.fillStyle = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#cccccc'; g.fillRect(0, 0, w, h)
  return c.toDataURL('image/png').split(',')[1]
}

/** Màu chủ đạo của vùng bbox (lấy trung vị phần lõi 50% để tránh viền) – thay cho việc hỏi AI */
export async function sampleColor(url: string, bbox: number[]): Promise<string | null> {
  try {
    const c = await cropCanvas(url, bbox, 120)
    const g = c.getContext('2d')!
    const x0 = Math.floor(c.width / 4), y0 = Math.floor(c.height / 4), w = Math.max(1, Math.floor(c.width / 2)), h = Math.max(1, Math.floor(c.height / 2))
    const d = g.getImageData(x0, y0, w, h).data
    const R: number[] = [], G: number[] = [], B: number[] = []
    for (let i = 0; i < d.length; i += 4) { R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]) }
    const med = (a: number[]) => { a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)] }
    return '#' + [med(R), med(G), med(B)].map(v => v.toString(16).padStart(2, '0')).join('')
  } catch { return null }
}

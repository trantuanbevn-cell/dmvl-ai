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

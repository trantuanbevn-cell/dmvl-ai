// Tách các ô ảnh phối cảnh trong một slide từ chính file PDF (không AI): đọc toạ độ các ảnh nhúng kèm vùng cắt (clip).
import * as pdfjs from 'pdfjs-dist'

export type Rect = { x: number; y: number; w: number; h: number } // 0..1 theo trang
type M = number[]
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
const bboxOf = (m: M, pts: number[][]) => { const q = pts.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]); const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
const inter = (a: number[] | null, b: number[] | null) => (a ? (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a) : b)

/** Các ô ảnh lớn trên mỗi trang (đã lọc ảnh nhỏ/logo/cả trang), sắp trái→phải rồi trên→dưới */
export async function renderRects(data: ArrayBuffer, pageNos: number[]): Promise<Map<number, Rect[]>> {
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise
  const OPS = pdfjs.OPS as Record<string, number>
  const out = new Map<number, Rect[]>()
  for (const pn of pageNos) {
    try {
      const page = await doc.getPage(pn), vp = page.getViewport({ scale: 1 })
      const ol = await page.getOperatorList()
      let ctm: M = vp.transform as M, clip: number[] | null = null
      const st: [M, number[] | null][] = []
      let pend: number[] | null = null
      const all: Rect[] = []
      for (let i = 0; i < ol.fnArray.length; i++) {
        const f = ol.fnArray[i], a: any = ol.argsArray[i]
        if (f === OPS.save) st.push([ctm, clip])
        else if (f === OPS.restore) { const s = st.pop(); if (s) { ctm = s[0]; clip = s[1] } }
        else if (f === OPS.transform) ctm = mul(ctm, a)
        else if (f === OPS.paintFormXObjectBegin) { st.push([ctm, clip]); if (a?.[0]) ctm = mul(ctm, a[0]) }
        else if (f === OPS.paintFormXObjectEnd) { const s = st.pop(); if (s) { ctm = s[0]; clip = s[1] } }
        else if (f === OPS.constructPath) {
          const ops: number[] = a[0], co: number[] = a[1]; let k = 0, other = false; const rects: number[][] = []
          for (const op of ops) {
            if (op === OPS.rectangle) { rects.push([co[k], co[k + 1], co[k + 2], co[k + 3]]); k += 4 }
            else if (op === OPS.moveTo || op === OPS.lineTo) { other = true; k += 2 }
            else if (op === OPS.curveTo) { other = true; k += 6 }
            else if (op === OPS.curveTo2 || op === OPS.curveTo3) { other = true; k += 4 }
          }
          pend = !other && rects.length === 1 ? bboxOf(ctm, [[rects[0][0], rects[0][1]], [rects[0][0] + rects[0][2], rects[0][1] + rects[0][3]]]) : null
        }
        else if (f === OPS.clip || f === OPS.eoClip) { if (pend) clip = inter(clip, pend) }
        else if (f === OPS.endPath) pend = null
        else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintJpegXObject) {
          const b = inter(bboxOf(ctm, [[0, 0], [1, 1]]), clip)!
          const x0 = Math.max(0, b[0]) / vp.width, y0 = Math.max(0, b[1]) / vp.height, x1 = Math.min(vp.width, b[2]) / vp.width, y1 = Math.min(vp.height, b[3]) / vp.height
          if (x1 > x0 && y1 > y0) all.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
        }
      }
      // giữ ô đủ lớn, bỏ ảnh phủ cả trang (nền) và các ô nằm gọn trong ô khác
      let big = all.filter(r => r.w * r.h >= 0.12 && Math.min(r.w, r.h) >= 0.2 && !(r.w > 0.97 && r.h > 0.97))
      big = big.filter((r, i) => !big.some((o, j) => j !== i && o.x <= r.x + 0.005 && o.y <= r.y + 0.005 && o.x + o.w >= r.x + r.w - 0.005 && o.y + o.h >= r.y + r.h - 0.005 && o.w * o.h > r.w * r.h * 1.05))
      // bỏ trùng lặp gần như y hệt
      big = big.filter((r, i) => !big.slice(0, i).some(o => Math.abs(o.x - r.x) < 0.01 && Math.abs(o.y - r.y) < 0.01 && Math.abs(o.w - r.w) < 0.01 && Math.abs(o.h - r.h) < 0.01))
      big.sort((a, b) => (Math.abs(a.x - b.x) > 0.05 ? a.x - b.x : a.y - b.y))
      out.set(pn, big)
      page.cleanup()
    } catch { out.set(pn, []) }
  }
  return out
}

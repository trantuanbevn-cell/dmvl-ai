import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { despaceLine } from './despace'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Làm sạch chữ trích từ PDF: bỏ ký tự rỗng/điều khiển (font Canva hay mã hoá dấu tiếng Việt thành \u0000),
 *  gộp dấu rời vào chữ (chuẩn NFC). PostgreSQL không nhận ký tự \u0000. */
export function cleanText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .normalize('NFC')
}

export type RenderedPage = { page_no: number; large: Blob; thumb: Blob; width: number; height: number; text: string }

function canvasBlob(c: HTMLCanvasElement, q = 0.85): Promise<Blob> {
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('toBlob failed'))), 'image/jpeg', q))
}
function downscale(src: HTMLCanvasElement, longEdge: number) {
  const r = Math.min(1, longEdge / Math.max(src.width, src.height))
  const c = document.createElement('canvas'); c.width = Math.round(src.width * r); c.height = Math.round(src.height * r)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height); return c
}

/** Đọc PDF trong trình duyệt, xuất mỗi trang thành ảnh lớn (~2000px) + ảnh nhỏ (~900px) + chữ */
export async function renderPdf(file: File, onPage?: (i: number, n: number) => void, longEdge = 2000): Promise<RenderedPage[]> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out: RenderedPage[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    onPage?.(i, doc.numPages)
    const page = await doc.getPage(i)
    const v1 = page.getViewport({ scale: 1 })
    const scale = longEdge / Math.max(v1.width, v1.height)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    const large = await canvasBlob(canvas, 0.85)
    const thumb = await canvasBlob(downscale(canvas, 900), 0.8)
    let text = ''
    try {
      // giữ xuống dòng (hasEOL) để tách được tiêu đề trang và ô số liệu
      const tc = await page.getTextContent()
      text = tc.items.map((it: any) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('')
        .split('\n').map(l => despaceLine(cleanText(l).replace(/\s+/g, ' ').trim())).filter(Boolean).join('\n')
    } catch { /* */ }
    out.push({ page_no: i, large, thumb, width: canvas.width, height: canvas.height, text })
    page.cleanup()
  }
  return out
}

export type Word = { t: string; x: number; y: number; w: number; h: number }
/** Chữ + vị trí (chuẩn hoá 0..1 theo trang) từ PDF gốc – dùng để tìm nhãn phòng trên mặt bằng */
export async function extractWords(data: ArrayBuffer): Promise<Record<number, Word[]>> {
  const doc = await pdfjs.getDocument({ data }).promise
  const out: Record<number, Word[]> = {}
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const ws: Word[] = []
    for (const it of tc.items as any[]) {
      const t = cleanText(String(it.str ?? '')).trim()
      if (!t) continue
      const m = pdfjs.Util.transform(vp.transform, it.transform)
      const h = Math.hypot(m[2], m[3]), w = Math.abs(it.width ?? 0)
      ws.push({ t, x: m[4] / vp.width, y: (m[5] - h * 0.85) / vp.height, w: w / vp.width, h: h / vp.height })
    }
    out[i] = ws
    page.cleanup()
  }
  return out
}

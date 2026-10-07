import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

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
        .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
    } catch { /* */ }
    out.push({ page_no: i, large, thumb, width: canvas.width, height: canvas.height, text })
    page.cleanup()
  }
  return out
}

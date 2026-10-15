// AI chỉ NHÌN ẢNH để soi lỗi bản dựng mặt bằng (so với bản vẽ gốc PDF) – không tự sửa; kết quả là danh sách nghi vấn để người duyệt.
import * as pdfjs from 'pdfjs-dist'
import './pdf'
import { callAI } from './ai'
import { isPdfBuf } from './dxf'
import { renderPlan, type PlanResult } from './planRead'

export type IssueKind = 'merged' | 'missing_door' | 'floating_door' | 'missing_wall' | 'extra_wall' | 'bad_split' | 'other'
export const ISSUE_LABEL: Record<string, string> = { merged: 'Hai không gian bị gộp', missing_door: 'Thiếu cửa', floating_door: 'Cửa lơ lửng', missing_wall: 'Thiếu tường/vách', extra_wall: 'Thừa tường', bad_split: 'Chia nhầm một không gian', other: 'Khác' }
export type PlanIssue = { n: number; kind: IssueKind; box: [number, number, number, number]; rooms: number[]; note: string; conf?: number } // box: px của ảnh dựng lại (x0,y0,x1,y1)

/** vẽ lại trang PDF gốc đúng cùng kích thước/toạ độ với ảnh dựng (res.ppp px / pt) */
export async function renderOriginal(buf: ArrayBuffer, pageNo: number, res: PlanResult): Promise<HTMLCanvasElement> {
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise
  const page = await doc.getPage(Math.min(pageNo, doc.numPages))
  const vp = page.getViewport({ scale: res.ppp })
  const c = document.createElement('canvas'); c.width = res.W; c.height = res.H
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: g, viewport: vp, canvas: c } as any).promise
  page.cleanup(); return c
}

const crop = (src: HTMLCanvasElement, x: number, y: number, w: number, h: number, maxEdge = 1600) => {
  const s = Math.min(1, maxEdge / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s)
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height)
  return { base64: c.toDataURL('image/jpeg', 0.88).split(',')[1], media_type: 'image/jpeg' }
}

export async function checkPlanWithAI(buf: ArrayBuffer, pageNo: number, res: PlanResult, floor: string, onProgress: (s: string) => void): Promise<{ issues: PlanIssue[]; orig: HTMLCanvasElement }> {
  if (!isPdfBuf(buf)) throw new Error('AI so với bản vẽ gốc nên cần file PDF (DXF chưa hỗ trợ bước này)')
  onProgress('Vẽ lại bản gốc để so sánh…')
  const orig = await renderOriginal(buf, pageNo, res)
  const out = renderPlan(res, { rooms: true, doors: true, labels: true })
  // khung bao toà nhà → chia lưới 2×2 có chồng lấn nhẹ để AI nhìn đủ rõ cửa
  let x0 = res.W, y0 = res.H, x1 = 0, y1 = 0
  for (let y = 0; y < res.H; y++) for (let x = 0; x < res.W; x++) if (res.wall[y * res.W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const bw = x1 - x0, bh = y1 - y0, ov = 0.06, cols = bw > bh * 0.8 ? 2 : 1, rows = bh > bw * 0.8 ? 2 : (cols === 1 ? 1 : 2)
  const tiles: [number, number, number, number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tw = bw / cols, th = bh / rows
    const tx = Math.max(0, x0 + c * tw - ov * tw), ty = Math.max(0, y0 + r * th - ov * th)
    tiles.push([tx, ty, Math.min(res.W - tx, tw * (1 + 2 * ov)), Math.min(res.H - ty, th * (1 + 2 * ov))])
  }
  const all: PlanIssue[] = []
  for (let i = 0; i < tiles.length; i++) {
    const [tx, ty, tw, th] = tiles[i]
    onProgress(`AI đang so sánh vùng ${i + 1}/${tiles.length}…`)
    const r = await callAI('check_plan', { floor, original: crop(orig, tx, ty, tw, th), result: crop(out, tx, ty, tw, th) })
    for (const it of (r.tool?.issues ?? []) as any[]) {
      const b = it.box_2d as number[]; if (!Array.isArray(b) || b.length !== 4) continue
      all.push({ n: 0, kind: (it.kind as IssueKind) ?? 'other', rooms: Array.isArray(it.rooms) ? it.rooms : [], note: String(it.note ?? ''), conf: typeof it.confidence === 'number' ? it.confidence : undefined,
        box: [tx + (b[1] / 1000) * tw, ty + (b[0] / 1000) * th, tx + (b[3] / 1000) * tw, ty + (b[2] / 1000) * th] })
    }
  }
  // bỏ trùng giữa các vùng chồng lấn
  const iou = (a: number[], b: number[]) => { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i) }
  const issues: PlanIssue[] = []
  for (const a of all.sort((p, q) => (q.conf ?? 0.5) - (p.conf ?? 0.5))) if (!issues.some(b => b.kind === a.kind && iou(a.box, b.box) > 0.3)) issues.push(a)
  issues.forEach((a, i) => { a.n = i + 1 })
  return { issues, orig }
}

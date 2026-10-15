// Chuyển kết quả đọc mặt bằng (mặt nạ điểm ảnh) thành đường VECTOR (polygon theo pt) để phóng to bao nhiêu cũng nét.
import { loadCv } from './cv'
import type { PlanResult } from './planRead'

export type PlanVec = { w: number; h: number; walls: string; rooms: { id: number; d: string; c: string }[] }
const PALETTE = ['#cfe3f5', '#f5d9c8', '#d6efc9', '#f1e2a6', '#e3cdf0', '#c8efe9', '#f6c9d6', '#dcdcdc', '#c9d6f6', '#e6f0b8']

function pathOf(cv: any, mask: any, ox: number, oy: number, ppp: number, eps: number): string {
  const cs = new cv.MatVector(), hi = new cv.Mat()
  cv.findContours(mask, cs, hi, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
  let d = ''
  for (let i = 0; i < cs.size(); i++) {
    const c = cs.get(i), ap = new cv.Mat(); cv.approxPolyDP(c, ap, eps, true)
    const a = ap.data32S as Int32Array
    if (ap.rows >= 3) { for (let j = 0; j < ap.rows; j++) d += (j ? 'L' : 'M') + ((a[j * 2] + ox) / ppp).toFixed(2) + ' ' + ((a[j * 2 + 1] + oy) / ppp).toFixed(2); d += 'Z' }
    c.delete(); ap.delete()
  }
  cs.delete(); hi.delete()
  return d
}

export async function planVector(res: PlanResult): Promise<PlanVec> {
  const cv = await loadCv(), { W, H, ppp, wall, lab } = res
  const wm = new cv.Mat(H, W, cv.CV_8UC1); wm.data.set(wall)
  const walls = pathOf(cv, wm, 0, 0, ppp, 0.6); wm.delete()
  const rooms: PlanVec['rooms'] = []
  for (const r of res.rooms) {
    const x0 = Math.max(0, Math.floor(r.x * ppp) - 2), y0 = Math.max(0, Math.floor(r.y * ppp) - 2), w = Math.min(W - x0, Math.ceil(r.w * ppp) + 5), h = Math.min(H - y0, Math.ceil(r.h * ppp) + 5)
    const m = new cv.Mat(h, w, cv.CV_8UC1)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m.data[y * w + x] = lab[(y + y0) * W + x + x0] === r.id ? 255 : 0
    rooms.push({ id: r.id, d: pathOf(cv, m, x0, y0, ppp, 0.8), c: PALETTE[(r.id - 1) % PALETTE.length] }); m.delete()
  }
  return { w: W / ppp, h: H / ppp, walls, rooms }
}

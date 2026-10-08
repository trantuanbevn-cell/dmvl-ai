// Từ nét vẽ vector → mặt nạ tường → các phòng kín (diện tích thật). Không dùng AI.
import type { VecPage } from './vector'

export type CadRoom = {
  id: number; area_m2: number; poly: number[][] // chuẩn hoá 0..1 theo trang
  cx: number; cy: number // tâm (chuẩn hoá)
  names: string[]; label_area?: number // chữ trong phòng (tên) và diện tích ghi trong bản vẽ nếu có
}
export type CadResult = { rooms: CadRoom[]; m_per_pt: number; px_per_pt: number; leaked: boolean; wall_px: number }

export const mPerPt = (scaleDen: number) => (25.4 / 72 / 1000) * scaleDen

/** Vẽ các nhóm nét được chọn thành mặt nạ tường (canvas → Uint8Array 0/255) */
export function rasterWalls(v: VecPage, selected: Set<number>, pxPerPt: number, doors: number[][] = []): { mask: Uint8Array; W: number; H: number } {
  const W = Math.ceil(v.w * pxPerPt), H = Math.ceil(v.h * pxPerPt)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'butt'; g.lineJoin = 'miter'
  const byCls = new Map<number, number[]>()
  for (let i = 0; i < v.nSeg; i++) { const ci = v.cls[i]; if (!selected.has(ci) || v.classes[ci].fill) continue; let a = byCls.get(ci); if (!a) byCls.set(ci, a = []); a.push(i) }
  for (const [ci, idx] of byCls) {
    g.lineWidth = Math.max(1.6, v.classes[ci].lw * pxPerPt)
    g.beginPath()
    for (const i of idx) { g.moveTo(v.segs[i * 4] * pxPerPt, v.segs[i * 4 + 1] * pxPerPt); g.lineTo(v.segs[i * 4 + 2] * pxPerPt, v.segs[i * 4 + 3] * pxPerPt) }
    g.stroke()
  }
  for (const f of v.fills) {
    if (!selected.has(f.cls)) continue
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (let i = 0; i < f.pts.length; i += 2) { x0 = Math.min(x0, f.pts[i]); x1 = Math.max(x1, f.pts[i]); y0 = Math.min(y0, f.pts[i + 1]); y1 = Math.max(y1, f.pts[i + 1]) }
    if ((x1 - x0) * (y1 - y0) > 0.25 * v.w * v.h) continue // bỏ nền trang
    g.beginPath(); g.moveTo(f.pts[0] * pxPerPt, f.pts[1] * pxPerPt)
    for (let i = 2; i < f.pts.length; i += 2) g.lineTo(f.pts[i] * pxPerPt, f.pts[i + 1] * pxPerPt)
    g.closePath(); g.fill()
  }
  // ô cửa đi: nối bản lề → mép đối diện để phòng khép kín đúng tại cửa
  if (doors.length) { g.lineWidth = Math.max(2, 0.6 * pxPerPt); g.beginPath(); for (const d of doors) { g.moveTo(d[0] * pxPerPt, d[1] * pxPerPt); g.lineTo(d[2] * pxPerPt, d[3] * pxPerPt) } g.stroke() }
  const d = g.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = d[i * 4] > 100 ? 255 : 0
  return { mask, W, H }
}

/** Tìm các phòng kín. doorW = bề rộng cửa lớn nhất (m) cần "đóng" để tách phòng */
export function findRooms(cv: any, v: VecPage, mask: Uint8Array, W: number, H: number, pxPerPt: number, scaleDen: number, doorW = 1.0, minArea = 1.5): CadResult {
  const mpp = mPerPt(scaleDen), mPerPx = mpp / pxPerPt
  const wall = new cv.Mat(H, W, cv.CV_8UC1); wall.data.set(mask)
  const k = Math.max(3, Math.round(doorW / mPerPx)) | 1
  const closed = new cv.Mat()
  cv.morphologyEx(wall, closed, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)))
  // vùng trống = ngược của tường; ngoài nhà = nối với mép ảnh
  const free = new cv.Mat(); cv.bitwise_not(closed, free)
  const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat()
  const n = cv.connectedComponentsWithStats(free, lab, st, ce, 4, cv.CV_32S)
  const L = lab.data32S as Int32Array
  const outside = new Set<number>()
  for (let x = 0; x < W; x++) { outside.add(L[x]); outside.add(L[(H - 1) * W + x]) }
  for (let y = 0; y < H; y++) { outside.add(L[y * W]); outside.add(L[y * W + W - 1]) }
  const rooms: CadRoom[] = []
  const maxArea = 3000
  for (let i = 1; i < n; i++) {
    if (outside.has(i)) continue
    const px = st.data32S[i * 5 + 4], area = px * mPerPx * mPerPx
    if (area < minArea || area > maxArea) continue
    const bx = st.data32S[i * 5], by = st.data32S[i * 5 + 1], bw = st.data32S[i * 5 + 2], bh = st.data32S[i * 5 + 3]
    const sub = new cv.Mat(bh, bw, cv.CV_8UC1)
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sub.data[y * bw + x] = L[(by + y) * W + bx + x] === i ? 255 : 0
    const cs = new cv.MatVector(), hi = new cv.Mat(); cv.findContours(sub, cs, hi, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    let bi = -1, ba = 0; for (let c = 0; c < cs.size(); c++) { const a = cv.contourArea(cs.get(c)); if (a > ba) { ba = a; bi = c } }
    const poly: number[][] = []
    if (bi >= 0) {
      const apx = new cv.Mat(); cv.approxPolyDP(cs.get(bi), apx, Math.max(1.5, 0.05 / mPerPx), true)
      for (let p = 0; p < apx.rows; p++) poly.push([(apx.data32S[p * 2] + bx) / W, (apx.data32S[p * 2 + 1] + by) / H]); apx.delete()
    }
    cs.delete(); hi.delete(); sub.delete()
    if (poly.length < 3) continue
    rooms.push({ id: rooms.length + 1, area_m2: +area.toFixed(2), poly, cx: ce.data64F[i * 2] / W, cy: ce.data64F[i * 2 + 1] / H, names: [] })
  }
  wall.delete(); closed.delete(); free.delete(); lab.delete(); st.delete(); ce.delete()
  // gán chữ trong bản vẽ cho phòng chứa nó
  const inside = (r: CadRoom, x: number, y: number) => { let c = false; const p = r.poly; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; return c }
  for (const t of v.texts) {
    const x = t.x / v.w, y = (t.y - t.h * 0.3) / v.h
    const r = rooms.find(rr => inside(rr, x, y)); if (!r) continue
    const m = /^([\d.,]+)\s*(m2|m²|㎡)$/i.exec(t.t.replace(/\s+/g, ''))
    if (m) { const val = parseFloat(m[1].replace(',', '.')); if (val > 0) r.label_area = val }
    else if (!/^[\d.,\s]+$/.test(t.t) && t.t.length > 2) r.names.push(t.t)
  }
  return { rooms, m_per_pt: mpp, px_per_pt: pxPerPt, leaked: rooms.length < 2, wall_px: mask.reduce((s, x) => s + (x ? 1 : 0), 0) }
}

/** Mặt nạ tường → ảnh nhỏ (data URL) để xem trước */
export function maskPreview(mask: Uint8Array, W: number, H: number, maxEdge = 900): string {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!; const im = g.createImageData(W, H)
  for (let i = 0; i < W * H; i++) { const v = mask[i] ? 30 : 255; im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255 }
  g.putImageData(im, 0, 0)
  const s = Math.min(1, maxEdge / Math.max(W, H)), o = document.createElement('canvas'); o.width = Math.round(W * s); o.height = Math.round(H * s)
  o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png')
}

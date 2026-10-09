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
export function rasterWalls(v: VecPage, selected: Set<number>, pxPerPt: number, doors: number[][] = [], partitions = false, mpp = 0.03528): { mask: Uint8Array; W: number; H: number } {
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
  let d = g.getImageData(0, 0, W, H).data
  if (partitions) {
    // đường dài ở layer khác (vách WC, kệ...) có 1 đầu chạm tường → coi là vách ngăn
    const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = d[i * 4] > 100 ? 1 : 0
    const r = Math.round(0.12 / mpp * pxPerPt) + 1, minL = 0.8 / mpp
    const near = (x: number, y: number) => { const px = Math.round(x * pxPerPt), py = Math.round(y * pxPerPt); for (let dy = -r; dy <= r; dy++) { const yy = py + dy; if (yy < 0 || yy >= H) continue; for (let dx = -r; dx <= r; dx++) { const xx = px + dx; if (xx >= 0 && xx < W && m[yy * W + xx]) return true } } return false }
    g.lineWidth = 1.8; g.beginPath()
    for (let i = 0; i < v.nSeg; i++) {
      const cl = v.classes[v.cls[i]]; if (cl.fill || selected.has(v.cls[i]) || /TEXT|NOTE|HATCH|DIM/i.test(cl.layer)) continue
      const x0 = v.segs[i * 4], y0 = v.segs[i * 4 + 1], x1 = v.segs[i * 4 + 2], y1 = v.segs[i * 4 + 3]
      if (Math.hypot(x1 - x0, y1 - y0) < minL) continue
      if (near(x0, y0) || near(x1, y1)) { g.moveTo(x0 * pxPerPt, y0 * pxPerPt); g.lineTo(x1 * pxPerPt, y1 * pxPerPt) }
    }
    g.stroke(); d = g.getImageData(0, 0, W, H).data
  }
  const mask = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) mask[i] = d[i * 4] > 100 ? 255 : 0
  return { mask, W, H }
}

/** Tách vùng trống thành các không gian: mỗi "cổ hẹp" (cửa mở, hành lang nối khu...) là ranh giới (watershed theo khoảng cách) */
function splitNecks(cv: any, mask: Uint8Array, W: number, H: number, mPerPx: number, alpha = 0.62, wideM = 0.8, minHalfM = 0.1): { lab: Int32Array; n: number } {
  const N = W * H
  const fm = new cv.Mat(H, W, cv.CV_8UC1); for (let i = 0; i < N; i++) fm.data[i] = mask[i] ? 0 : 255
  const dt = new cv.Mat(); cv.distanceTransform(fm, dt, cv.DIST_L2, 5); const D = dt.data32F as Float32Array; fm.delete()
  const wide = wideM / mPerPx, minHalf = minHalfM / mPerPx
  let maxq = 0; const q = new Int32Array(N)
  for (let i = 0; i < N; i++) { const v = D[i]; if (v > 0) { const k = Math.round(v * 2); q[i] = k; if (k > maxq) maxq = k } }
  const cnt = new Int32Array(maxq + 2); for (let i = 0; i < N; i++) if (q[i] > 0) cnt[q[i]]++
  const start = new Int32Array(maxq + 2); let acc = 0; for (let k = maxq; k >= 1; k--) { start[k] = acc; acc += cnt[k] }
  const order = new Int32Array(acc), pos = start.slice(); for (let i = 0; i < N; i++) if (q[i] > 0) order[pos[q[i]]++] = i
  const L = new Int32Array(N), parent = [0], peak = [0]
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  for (let oi = 0; oi < order.length; oi++) {
    const p = order[oi], x = p % W, d = D[p], roots: number[] = []
    const add = (pp: number) => { const l = L[pp]; if (!l) return; const rt = find(l); if (roots.indexOf(rt) < 0) roots.push(rt) }
    if (x > 0) add(p - 1); if (x < W - 1) add(p + 1); if (p >= W) add(p - W); if (p + W < N) add(p + W)
    if (!roots.length) { const id = parent.length; parent.push(id); peak.push(d); L[p] = id }
    else if (roots.length === 1) L[p] = roots[0]
    else {
      roots.sort((u, v) => peak[v] - peak[u]); const big = roots[0]; L[p] = big
      for (let k = 1; k < roots.length; k++) { const s = roots[k]; if (find(s) === find(big)) continue; const pk = peak[s]; if (pk < minHalf || d >= alpha * pk || d >= wide) parent[s] = big }
    }
  }
  const lab = new Int32Array(N), remap = new Map<number, number>(); let n = 1
  for (let i = 0; i < N; i++) { const l = L[i]; if (!l) continue; const rt = find(l); let m = remap.get(rt); if (!m) { m = n++; remap.set(rt, m) } lab[i] = m }
  dt.delete(); return { lab, n }
}

/** Tìm các không gian kín. doorW chỉ dùng để "đóng" khe nhỏ (≤ vài px); việc tách phòng do splitNecks đảm nhiệm */
export function findRooms(cv: any, v: VecPage, mask: Uint8Array, W: number, H: number, pxPerPt: number, scaleDen: number, doorW = 1.0, minArea = 0.3): CadResult {
  const mpp = mPerPt(scaleDen), mPerPx = mpp / pxPerPt
  void doorW
  const wall = new cv.Mat(H, W, cv.CV_8UC1); wall.data.set(mask)
  const closed = new cv.Mat()
  cv.morphologyEx(wall, closed, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)))
  // nối thông với mép ảnh = ngoài nhà → coi như tường để không tràn
  const free = new cv.Mat(); cv.bitwise_not(closed, free)
  const l0 = new cv.Mat(), s0 = new cv.Mat(), c0 = new cv.Mat()
  const n0 = cv.connectedComponentsWithStats(free, l0, s0, c0, 4, cv.CV_32S)
  const L0 = l0.data32S as Int32Array, out0 = new Set<number>()
  for (let x = 0; x < W; x++) { out0.add(L0[x]); out0.add(L0[(H - 1) * W + x]) }
  for (let y = 0; y < H; y++) { out0.add(L0[y * W]); out0.add(L0[y * W + W - 1]) }
  const m2 = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m2[i] = (closed.data[i] || out0.has(L0[i])) ? 255 : 0
  l0.delete(); s0.delete(); c0.delete(); void n0
  const sp = splitNecks(cv, m2, W, H, mPerPx)
  const n = sp.n, L = sp.lab
  const stA = new Int32Array(n * 5); for (let i = 0; i < n; i++) { stA[i * 5] = 1e9; stA[i * 5 + 1] = 1e9; stA[i * 5 + 2] = -1; stA[i * 5 + 3] = -1 }
  const sx = new Float64Array(n), sy = new Float64Array(n)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = L[y * W + x]; if (!l) continue; const o = l * 5; if (x < stA[o]) stA[o] = x; if (y < stA[o + 1]) stA[o + 1] = y; if (x > stA[o + 2]) stA[o + 2] = x; if (y > stA[o + 3]) stA[o + 3] = y; stA[o + 4]++; sx[l] += x; sy[l] += y }
  const st = { data32S: stA }, ce = { data64F: new Float64Array(n * 2) }
  for (let i = 1; i < n; i++) { const c = stA[i * 5 + 4] || 1; ce.data64F[i * 2] = sx[i] / c; ce.data64F[i * 2 + 1] = sy[i] / c; stA[i * 5 + 2] = stA[i * 5 + 2] - stA[i * 5] + 1; stA[i * 5 + 3] = stA[i * 5 + 3] - stA[i * 5 + 1] + 1 }
  const rooms: CadRoom[] = []
  const maxArea = 3000
  for (let i = 1; i < n; i++) {
    const px = st.data32S[i * 5 + 4], area = px * mPerPx * mPerPx
    if (area < minArea || area > maxArea) continue
    const bx = st.data32S[i * 5], by = st.data32S[i * 5 + 1], bw = st.data32S[i * 5 + 2], bh = st.data32S[i * 5 + 3]
    // bỏ mảnh mỏng (dải hẹp sát tường) – bề dày trung bình < 0.25 m
    if (area / (Math.max(bw, bh) * mPerPx) < 0.25 && area < 3) continue
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
  wall.delete(); closed.delete(); free.delete()
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

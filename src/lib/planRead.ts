// ĐỌC MẶT BẰNG (bản thử nghiệm, chỉ dùng trong tab concept – chưa nối vào dự án danh mục nào):
// nét vector (PDF/DXF) → TƯỜNG + CỘT (gộp làm một) + CỬA → các không gian kín và diện tích sàn. Không dùng AI.
// Điểm khác bản cũ: nhận cửa theo HÌNH DẠNG (cánh + cung quay 90°) ở bất kỳ layer nào; cung có thể nằm ở layer khác với cánh;
// cửa luôn phải nằm trong tường (tự nối tường / đóng ô cửa); phòng chạm mép toà nhà (vùng ngoài) bị loại.
import type { VecPage } from './vector'
import { loadCv } from './cv'
import { rasterWalls, mPerPt } from './cad'

export type Role = 'wall' | 'door' | 'arc' | 'skip'
export type LayerRow = { layer: string; segs: number; fills: number; role: Role }

const SKIP = /equip|noithat|furn|text|note|dim|gutter|interior|hood|pl_point|balloon|general|淘宝/i
const WALL = /ktv-kt-tuong|k-wall|be ?tong|1-tuong|column|ktv-kt-hatch|1-hatch|lift|gsa03_net thay|gsa15_net manh|(^|[^a-z])tuong|tường|a-wall/i
const DOOR = /door|cua di|cửa đi|9-door/i
const ARC = /net ?khuat|netkhuat|net ?manh|net ?thay|nét khuất/i

/** gợi ý vai trò từng layer theo tên (người dùng đổi được): tường/cột · cửa · chỉ để tìm cung cửa · bỏ */
export function suggestRoles(v: VecPage): LayerRow[] {
  const m = new Map<string, LayerRow>()
  for (let i = 0; i < v.nSeg; i++) { const l = v.classes[v.cls[i]].layer; const r = m.get(l) ?? { layer: l, segs: 0, fills: 0, role: 'skip' as Role }; r.segs++; m.set(l, r) }
  for (const f of v.fills) { const l = v.classes[f.cls].layer; const r = m.get(l) ?? { layer: l, segs: 0, fills: 0, role: 'skip' as Role }; r.fills++; m.set(l, r) }
  for (const r of m.values()) {
    const n = r.layer
    r.role = /balloon/i.test(n) ? 'skip' : DOOR.test(n) ? 'door' : /k-wall|column/i.test(n) || (WALL.test(n) && !SKIP.test(n)) ? 'wall' : ARC.test(n) && !SKIP.test(n) ? 'arc' : 'skip'
  }
  return [...m.values()].sort((a, b) => b.segs + b.fills - a.segs - a.fills)
}

export type PlanDoor = { H: number[]; Q: number[]; E: number[]; r: number; pair: boolean; hOk: boolean; eOk: boolean } // toạ độ pt
export type PlanRoom = { id: number; area: number; cx: number; cy: number; x: number; y: number; w: number; h: number; names: string[]; labelArea?: number }
export type PlanResult = {
  W: number; H: number; ppp: number; mpp: number
  wall: Uint8Array // tường + cột (đã khép kín khe nhỏ), 255 = tường
  lab: Int32Array // nhãn không gian cho từng điểm ảnh (0 = tường/ngoài)
  doors: PlanDoor[]; closures: number[][] // đoạn đóng ô cửa không có cung (trượt, ô mở) [x0,y0,x1,y1] pt
  rooms: PlanRoom[]; unresolved: { x: number; y: number; len: number }[]; log: string[]
}

type P = [number, number]
export async function readPlan(v: VecPage, roles: Record<string, Role>, den: number, onLog: (s: string) => void = () => {}): Promise<PlanResult> {
  const log: string[] = []; const say = (s: string) => { log.push(s); onLog(s) }
  const cv = await loadCv()
  const mpp = mPerPt(den), PT = 1 / mpp
  const ppp = Math.min(4, 5200 / Math.max(v.w, v.h))
  // 1) mặt nạ tường + cột (một loại duy nhất)
  const sel = new Set<number>(); v.classes.forEach((c, i) => { if (roles[c.layer] === 'wall') sel.add(i) })
  if (!sel.size) throw new Error('Chưa chọn layer nào là tường/cột')
  say('Dựng mặt nạ tường…')
  const { mask, W, H } = rasterWalls(v, sel, ppp, [], false, mpp)
  const wm = new cv.Mat(H, W, cv.CV_8UC1); wm.data.set(mask)
  const kz = Math.max(3, Math.round(1.4 * ppp) | 1), ker = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kz, kz))
  const wc = new cv.Mat(); cv.morphologyEx(wm, wc, cv.MORPH_CLOSE, ker); wc.copyTo(wm); wc.delete()
  const Wm = (wm.data as Uint8Array).slice() // bản sao: bộ nhớ wasm có thể đổi chỗ khi cấp phát thêm
  const hasWall = (x: number, y: number, rad = 0.15) => {
    const r = Math.round(rad * PT * ppp), px = Math.round(x * ppp), py = Math.round(y * ppp)
    if (px < r || py < r || px >= W - r || py >= H - r) return false
    for (let yy = py - r; yy <= py + r; yy++) { const o = yy * W; for (let xx = px - r; xx <= px + r; xx++) if (Wm[o + xx]) return true }
    return false
  }
  // 2) đoạn nét cửa (bỏ nét trùng) + điểm để tìm cung (cửa ∪ layer cung)
  const doorSegs: number[][] = [], seen = new Set<string>()
  const addSeg = (a: number, b: number, c: number, d: number) => {
    const k1 = `${Math.round(a / 0.3)},${Math.round(b / 0.3)}`, k2 = `${Math.round(c / 0.3)},${Math.round(d / 0.3)}`
    const k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; if (seen.has(k)) return; seen.add(k); doorSegs.push([a, b, c, d])
  }
  const arcPts: number[] = []
  for (let i = 0; i < v.nSeg; i++) {
    const ro = roles[v.classes[v.cls[i]].layer]; if (ro !== 'door' && ro !== 'arc') continue
    const a = v.segs[i * 4], b = v.segs[i * 4 + 1], c = v.segs[i * 4 + 2], d = v.segs[i * 4 + 3]
    if (Math.hypot(c - a, d - b) > 3 * PT) continue
    arcPts.push(a, b, c, d); if (ro === 'door') addSeg(a, b, c, d)
  }
  for (const f of v.fills) { // cánh cửa chỉ là vùng tô → lấy cạnh
    if (roles[v.classes[f.cls].layer] !== 'door') continue
    const n = f.pts.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; addSeg(f.pts[i * 2], f.pts[i * 2 + 1], f.pts[j * 2], f.pts[j * 2 + 1]) }
  }
  const nPts = arcPts.length / 2
  say(`Cửa: ${doorSegs.length} nét · ${nPts} điểm tìm cung`)
  // 3) cửa quay: cánh dài 0,28–1,75 m + cung ≥70° quanh bản lề
  const raw: { H: P; Q: P; E: P; r: number }[] = []
  for (const s of doorSegs) {
    const L = Math.hypot(s[2] - s[0], s[3] - s[1]); if (L < 0.28 * PT || L > 1.75 * PT) continue
    for (const [H, Q] of [[[s[0], s[1]], [s[2], s[3]]], [[s[2], s[3]], [s[0], s[1]]]] as [P, P][]) {
      const r = Math.hypot(Q[0] - H[0], Q[1] - H[1]), a0 = Math.atan2(Q[1] - H[1], Q[0] - H[0]) * 180 / Math.PI
      const rel: number[] = []
      for (let i = 0; i < nPts; i++) {
        const x = arcPts[i * 2], y = arcPts[i * 2 + 1]
        if (Math.abs(Math.hypot(x - H[0], y - H[1]) - r) >= 0.6) continue
        rel.push((((Math.atan2(y - H[1], x - H[0]) * 180 / Math.PI - a0 + 180) % 360) + 360) % 360 - 180)
      }
      if (rel.length < 5) continue
      for (const sg of [1, -1]) {
        const sl = rel.map(x => x * sg).filter(x => x > -6 && x < 100); if (sl.length < 5) continue
        const far = Math.max(...sl); if (far < 70) continue
        let cov = true; for (let t = 0; t < Math.min(far, 90) - 15; t += 15) if (!sl.some(x => x >= t && x < t + 15)) { cov = false; break }
        if (!cov) continue
        const ae = (a0 + sg * far) * Math.PI / 180
        raw.push({ H, Q, r, E: [H[0] + r * Math.cos(ae), H[1] + r * Math.sin(ae)] })
      }
    }
  }
  const uniq: typeof raw = []
  for (const d of raw) if (!uniq.some(u => Math.hypot(d.H[0] - u.H[0], d.H[1] - u.H[1]) < 1.5 && Math.abs(d.r - u.r) < 1.5 && Math.hypot(d.E[0] - u.E[0], d.E[1] - u.E[1]) < 2)) uniq.push(d)
  const doors: PlanDoor[] = uniq.map(d => {
    const L = Math.hypot(d.E[0] - d.H[0], d.E[1] - d.H[1]) || 1, u: P = [(d.E[0] - d.H[0]) / L, (d.E[1] - d.H[1]) / L]
    const hOk = [0, 0.1, 0.2].some(k => hasWall(d.H[0] - u[0] * k * PT, d.H[1] - u[1] * k * PT))
    const eOk = [0, 0.1, 0.2].some(k => hasWall(d.E[0] + u[0] * k * PT, d.E[1] + u[1] * k * PT))
    return { H: d.H, Q: d.Q, E: d.E, r: d.r, pair: false, hOk, eOk }
  })
  for (const d of doors) { d.pair = doors.some(o => o !== d && Math.hypot(o.E[0] - d.E[0], o.E[1] - d.E[1]) < 0.45 * PT); if (d.pair) d.eOk = true } // cửa đôi: hai cánh gặp nhau
  say(`Cửa quay nhận được: ${doors.length} (cánh đôi: ${doors.filter(d => d.pair).length})`)
  // 4) đóng ô cửa bằng một nét mỏng; đầu cửa không chạm tường → nối tới tường gần nhất (cửa không thể lơ lửng)
  const w2 = wm.clone()
  const px = (p: number[]) => new cv.Point(Math.round(p[0] * ppp), Math.round(p[1] * ppp))
  const thin = Math.max(3, Math.round(0.06 * PT * ppp)), thick = Math.max(3, Math.round(0.1 * PT * ppp))
  const nearestWall = (P0: P, u: P, maxd = 0.9): P | null => {
    let best: { t: number; q: P } | null = null
    for (let ang = -40; ang <= 40; ang += 10) {
      const c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180), vx = u[0] * c - u[1] * s, vy = u[0] * s + u[1] * c
      for (let t = 0.05; t < maxd; t += 0.03) {
        const qx = P0[0] + vx * t * PT, qy = P0[1] + vy * t * PT, x = Math.round(qx * ppp), y = Math.round(qy * ppp)
        if (x >= 0 && x < W && y >= 0 && y < H && Wm[y * W + x]) { if (!best || t < best.t) best = { t, q: [qx, qy] }; break }
      }
    }
    return best ? best.q : null
  }
  for (const d of doors) {
    const L = Math.hypot(d.E[0] - d.H[0], d.E[1] - d.H[1]) || 1, u: P = [(d.E[0] - d.H[0]) / L, (d.E[1] - d.H[1]) / L]
    cv.line(w2, px([d.H[0] - u[0] * 0.1 * PT, d.H[1] - u[1] * 0.1 * PT]), px([d.E[0] + u[0] * 0.1 * PT, d.E[1] + u[1] * 0.1 * PT]), new cv.Scalar(255), thin)
    for (const [p, ok, uu] of [[d.H, d.hOk, [-u[0], -u[1]]], [d.E, d.eOk, u]] as [number[], boolean, number[]][]) {
      if (ok) continue
      const q = nearestWall([p[0], p[1]], [uu[0], uu[1]]); if (q) cv.line(w2, px(p), px(q), new cv.Scalar(255), thick)
    }
  }
  // 5) ô cửa không có cung (cửa trượt, ô mở…): cụm nét cửa chưa thuộc cửa quay nào → đóng bằng một nét dọc trục dài của cụm
  const dm = cv.Mat.zeros(H, W, cv.CV_8UC1)
  for (const s of doorSegs) cv.line(dm, px([s[0], s[1]]), px([s[2], s[3]]), new cv.Scalar(255), 2)
  const dk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)); const dd = new cv.Mat(); cv.dilate(dm, dd, dk)
  const cl = new cv.Mat(), cst = new cv.Mat(), cce = new cv.Mat(); const nc = cv.connectedComponentsWithStats(dd, cl, cst, cce, 8, cv.CV_32S)
  const CL = (cl.data32S as Int32Array).slice(), covered = new Set<number>()
  for (const d of doors) { const x = Math.round((d.H[0] + d.E[0]) / 2 * ppp), y = Math.round((d.H[1] + d.E[1]) / 2 * ppp); if (x >= 0 && y >= 0 && x < W && y < H) covered.add(CL[y * W + x]) }
  const pts: number[][] = Array.from({ length: nc }, () => [])
  const DM = (dm.data as Uint8Array).slice()
  for (let i = 0; i < W * H; i++) if (DM[i] && !covered.has(CL[i])) { const a = pts[CL[i]]; if (a.length < 200000) a.push(i % W, (i / W) | 0) }
  const closures: number[][] = [], unresolved: PlanResult['unresolved'] = []
  for (let k = 1; k < nc; k++) {
    const a = pts[k]; if (a.length < 10) continue
    let mx = 0, my = 0; const n = a.length / 2; for (let i = 0; i < a.length; i += 2) { mx += a[i]; my += a[i + 1] } mx /= n; my /= n
    let sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < a.length; i += 2) { const dx = a[i] - mx, dy = a[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th)
    let t0 = 1e9, t1 = -1e9; for (let i = 0; i < a.length; i += 2) { const t = (a[i] - mx) * ux + (a[i + 1] - my) * uy; if (t < t0) t0 = t; if (t > t1) t1 = t }
    const Lm = (t1 - t0) / ppp / PT
    if (Lm < 0.6 || Lm > 3.2) { if (Lm > 0.5) unresolved.push({ x: mx / ppp, y: my / ppp, len: +Lm.toFixed(2) }); continue }
    const ex = 0.1 * PT * ppp, A: P = [mx + ux * (t0 - ex), my + uy * (t0 - ex)], B: P = [mx + ux * (t1 + ex), my + uy * (t1 + ex)]
    cv.line(w2, new cv.Point(Math.round(A[0]), Math.round(A[1])), new cv.Point(Math.round(B[0]), Math.round(B[1])), new cv.Scalar(255), thin)
    closures.push([A[0] / ppp, A[1] / ppp, B[0] / ppp, B[1] / ppp])
  }
  say(`Ô cửa không cung đóng bằng nét: ${closures.length}; cụm chưa rõ: ${unresolved.length}`)
  // 6) không gian = vùng trống kín; bỏ vùng ngoài toà nhà (chạm khung bao tường)
  const free = new cv.Mat(); cv.bitwise_not(w2, free)
  const lm = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat(); const nn = cv.connectedComponentsWithStats(free, lm, st, ce, 4, cv.CV_32S)
  const lab = (lm.data32S as Int32Array).slice(), S = (st.data32S as Int32Array).slice(), C = (ce.data64F as Float64Array).slice()
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Wm[y * W + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y }
  const outside = lab[0], keep = new Map<number, PlanRoom>(), m2 = (mpp / ppp) ** 2
  for (let i = 1; i < nn; i++) {
    if (i === outside) continue
    const x = S[i * 5], y = S[i * 5 + 1], w = S[i * 5 + 2], h = S[i * 5 + 3], area = S[i * 5 + 4] * m2
    if (x <= bx0 || y <= by0 || x + w >= bx1 || y + h >= by1) continue
    if (area < 0.8 || area > 3000) continue
    keep.set(i, { id: keep.size + 1, area: +area.toFixed(2), cx: C[i * 2] / ppp, cy: C[i * 2 + 1] / ppp, x: x / ppp, y: y / ppp, w: w / ppp, h: h / ppp, names: [] })
  }
  const remap = new Int32Array(nn); keep.forEach((r, i) => { remap[i] = r.id })
  for (let i = 0; i < lab.length; i++) lab[i] = remap[lab[i]]
  const rooms = [...keep.values()]
  // chữ trong bản vẽ nằm trong phòng nào: tên + diện tích ghi sẵn (nếu có)
  for (const t of v.texts) {
    const x = Math.round(t.x * ppp), y = Math.round((t.y - t.h * 0.3) * ppp); if (x < 0 || y < 0 || x >= W || y >= H) continue
    const id = lab[y * W + x]; if (!id) continue
    const r = rooms[id - 1]; const m = /^(?:S\s*[=:]?\s*)?([\d.,]+)\s*(m2|m²|㎡)?$/i.exec(t.t.replace(/\s+/g, ''))
    if (m && (/^S/i.test(t.t) || m[2])) { const val = parseFloat(m[1].replace(',', '.')); if (val > 0) r.labelArea = val }
    else if (!/^[\d.,\s]+$/.test(t.t) && t.t.length > 2 && r.names.length < 4) r.names.push(t.t)
  }
  const wall = Wm.slice()
  for (const m of [wm, w2, free, lm, st, ce, dm, dd, cl, cst, cce, ker, dk]) m.delete()
  say(`Không gian tách được: ${rooms.length}`)
  return { W, H, ppp, mpp, wall, lab, doors, closures, rooms, unresolved, log }
}

const PALETTE = ['#cfe3f5', '#f5d9c8', '#d6efc9', '#f1e2a6', '#e3cdf0', '#c8efe9', '#f6c9d6', '#dcdcdc', '#c9d6f6', '#e6f0b8']
export type RenderOpt = { rooms: boolean; doors: boolean; labels: boolean; maxEdge?: number }
/** vẽ kết quả: tường/cột xám viền đen, cửa xanh, (tuỳ chọn) sàn từng không gian tô màu + diện tích */
export function renderPlan(res: PlanResult, opt: RenderOpt): HTMLCanvasElement {
  const { W, H, ppp, wall, lab } = res
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!, im = g.createImageData(W, H), d = im.data
  for (let i = 0; i < W * H; i++) {
    let r = 255, gg = 255, b = 255
    if (wall[i]) {
      const x = i % W, edge = x === 0 || x === W - 1 || i < W || i >= W * (H - 1) || !wall[i - 1] || !wall[i + 1] || !wall[i - W] || !wall[i + W]
      r = gg = b = edge ? 0 : 150
    } else if (opt.rooms && lab[i]) { const h = PALETTE[(lab[i] - 1) % PALETTE.length]; r = parseInt(h.slice(1, 3), 16); gg = parseInt(h.slice(3, 5), 16); b = parseInt(h.slice(5, 7), 16) }
    d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255
  }
  g.putImageData(im, 0, 0)
  if (opt.doors) {
    g.strokeStyle = '#1e5ac8'; g.lineWidth = Math.max(1.5, 0.35 * ppp); g.lineCap = 'round'
    for (const dr of res.doors) {
      const a0 = Math.atan2(dr.Q[1] - dr.H[1], dr.Q[0] - dr.H[0]), a1 = Math.atan2(dr.E[1] - dr.H[1], dr.E[0] - dr.H[0])
      let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da))
      g.beginPath(); g.moveTo(dr.H[0] * ppp, dr.H[1] * ppp); g.lineTo(dr.Q[0] * ppp, dr.Q[1] * ppp); g.stroke()
      g.beginPath(); for (let t = 0; t <= 20; t++) { const a = a0 + da * t / 20, x = (dr.H[0] + dr.r * Math.cos(a)) * ppp, y = (dr.H[1] + dr.r * Math.sin(a)) * ppp; if (t) g.lineTo(x, y); else g.moveTo(x, y) } g.stroke()
    }
    g.setLineDash([6, 4]); for (const l of res.closures) { g.beginPath(); g.moveTo(l[0] * ppp, l[1] * ppp); g.lineTo(l[2] * ppp, l[3] * ppp); g.stroke() }; g.setLineDash([])
  }
  if (opt.labels) {
    g.fillStyle = '#000'; g.textAlign = 'center'; g.font = `${Math.round(2.6 * ppp * 1.6)}px Arial`
    for (const r of res.rooms) if (r.area >= 1.5) g.fillText(`${r.id} · ${r.area.toFixed(1)} m²`, r.cx * ppp, r.cy * ppp)
  }
  return c
}

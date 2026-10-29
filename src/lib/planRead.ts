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
const DOOR = /door|cua di|cửa đi|9-door|(^|[-_ ])cua($|[-_ ])/i
const ARC = /net ?khuat|netkhuat|net ?manh|net ?thay|nét khuất/i

/** PDF không chia layer (mọi nét cùng layer rỗng): đặt tên theo bề dày nét / vùng tô để vẫn chọn được vai trò từng loại nét */
export function nameBareLayers(v: VecPage) {
  for (const c of v.classes) if (!c.layer) c.layer = c.fill ? '(vùng tô / hatch)' : `(nét dày ${c.lw} pt)`
}
/** gợi ý vai trò từng layer theo tên (người dùng đổi được): tường/cột · cửa · chỉ để tìm cung cửa · bỏ */
export function suggestRoles(v: VecPage): LayerRow[] {
  const m = new Map<string, LayerRow>()
  for (let i = 0; i < v.nSeg; i++) { const l = v.classes[v.cls[i]].layer; const r = m.get(l) ?? { layer: l, segs: 0, fills: 0, role: 'skip' as Role }; r.segs++; m.set(l, r) }
  for (const f of v.fills) { const l = v.classes[f.cls].layer; const r = m.get(l) ?? { layer: l, segs: 0, fills: 0, role: 'skip' as Role }; r.fills++; m.set(l, r) }
  for (const r of m.values()) {
    const n = r.layer
    r.role = /^\(nét dày/.test(n) ? (parseFloat(n.replace(/[^\d.]/g, '')) >= 0.6 ? 'wall' : parseFloat(n.replace(/[^\d.]/g, '')) >= 0.25 ? 'door' : 'arc') : /balloon/i.test(n) ? 'skip' : DOOR.test(n) ? 'door' : /k-wall|column/i.test(n) || (WALL.test(n) && !SKIP.test(n)) ? 'wall' : ARC.test(n) && !SKIP.test(n) ? 'arc' : 'skip'
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
  seal: Uint8Array // điểm ảnh nét đóng cửa/nối tường (không phải tường thật) – chỉ để tô liền khi hiển thị
  extra: number[][] // tường bổ sung do tự sửa (pt) [x0,y0,x1,y1]
}

type P = [number, number]
export async function readPlan(v: VecPage, roles: Record<string, Role>, den: number, onLog: (s: string) => void = () => {}, extra: number[][] = []): Promise<PlanResult> {
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
        const ae = (a0 + sg * (far >= 78 && far <= 104 ? 90 : far)) * Math.PI / 180
        raw.push({ H, Q, r, E: [H[0] + r * Math.cos(ae), H[1] + r * Math.sin(ae)] })
      }
    }
  }
  const uniq: typeof raw = []
  for (const d of raw) if (!uniq.some(u => Math.hypot(d.H[0] - u.H[0], d.H[1] - u.H[1]) < 8 && Math.abs(d.r - u.r) < 3 && Math.hypot(d.E[0] - u.E[0], d.E[1] - u.E[1]) < 8)) uniq.push(d)
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
    for (let ang = -12; ang <= 12; ang += 6) {
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
  for (const e of extra) cv.line(w2, px([e[0], e[1]]), px([e[2], e[3]]), new cv.Scalar(255), thick) // tường bổ sung (tự sửa)
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
  // 5b) vật thể nhận từ khối DXF: ô cửa (bản lề → bản lề / đầu cánh) đóng bằng nét mỏng; vách kính khép phòng như tường mỏng
  for (const o of v.objs ?? []) {
    if ((o.kind === 'door' || o.kind === 'double') && o.H1 && o.H2) { cv.line(w2, px(o.H1), px(o.H2), new cv.Scalar(255), thin); closures.push([o.H1[0], o.H1[1], o.H2[0], o.H2[1]]) }
    else if (o.kind === 'glass' || o.kind === 'window' || o.kind === 'slide') { const c = Math.cos(o.rot), s2 = Math.sin(o.rot), h = o.w / 2; cv.line(w2, px([o.cx - c * h, o.cy - s2 * h]), px([o.cx + c * h, o.cy + s2 * h]), new cv.Scalar(255), thin) }
  }
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
  const wall = Wm.slice(), seal = new Uint8Array(W * H); { const W2 = w2.data as Uint8Array; for (let i = 0; i < W * H; i++) if (W2[i] && !Wm[i]) seal[i] = 1 }
  for (const m of [wm, w2, free, lm, st, ce, dm, dd, cl, cst, cce, ker, dk]) m.delete()
  say(`Không gian tách được: ${rooms.length}`)
  return { W, H, ppp, mpp, wall, lab, doors, closures, rooms, unresolved, log, seal, extra }
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

// ───────── Gộp thêm DXF (dữ liệu bổ sung, tuỳ chọn) ─────────
/** DXF và PDF cùng một bản vẽ nhưng khác gốc toạ độ → quy DXF về toạ độ trang PDF: tỉ lệ theo đơn vị thật, dịch chuyển bằng khớp mặt nạ tường (coarse 1 px/pt rồi tinh 4 px/pt) */
export type DxfMerge = { merged: VecPage; dx: number; dy: number; score: number; mmPerPt: number; den: number; roles: Record<string, Role>; diffs: { kind: 'dxfOnly' | 'pdfOnly'; x: number; y: number; w: number; h: number }[]; nDxfOnly: number; nPdfOnly: number }
type DxfVec = VecPage & { dxf?: { den: number } }
const PT_MM = 25.4 / 72

function wallMaskCanvas(v: VecPage, sel: Set<number>, ppp: number, W: number, H: number): Uint8Array {
  const { mask, W: w, H: h } = rasterWalls(v, sel, ppp, [], false, 0.03528)
  if (w === W && h === H) return mask
  const out = new Uint8Array(W * H)
  for (let y = 0; y < Math.min(h, H); y++) for (let x = 0; x < Math.min(w, W); x++) if (mask[y * w + x]) out[y * W + x] = 255
  return out
}

/** Ghép DXF vào PDF: dò TỈ LỆ THẬT của PDF (mm/pt – PDF xuất ra thường không đúng 1:200) và độ dịch bằng khớp mẫu mặt nạ tường; sau đó quy nét DXF về toạ độ PDF. */
export async function mergeDxf(pdf: VecPage, pdfRoles: Record<string, Role>, dxf: DxfVec, den: number, onLog: (s: string) => void = () => {}, dRolesIn?: Record<string, Role>): Promise<DxfMerge> {
  const cv = await loadCv()
  const dxfMm = PT_MM * (dxf.dxf?.den ?? den) // mm thật trên 1 pt của DXF
  const dRows = suggestRoles(dxf), dRoles: Record<string, Role> = {}; dRows.forEach(r => { dRoles['[DXF] ' + r.layer] = dRolesIn?.['[DXF] ' + r.layer] ?? r.role })
  const selP = new Set<number>(); pdf.classes.forEach((c, i) => { if (pdfRoles[c.layer] === 'wall') selP.add(i) })
  const selD = new Set<number>(); dxf.classes.forEach((c, i) => { if (dRoles['[DXF] ' + c.layer] === 'wall') selD.add(i) })
  if (!selP.size || !selD.size) throw new Error('Cần có layer tường ở cả PDF lẫn DXF để khớp hai file')
  onLog('Dò tỉ lệ và vị trí DXF so với PDF…')
  const M0 = 70.56, k0 = dxfMm / M0 // quy chiếu: 1 pt PDF = M0 mm
  const blur = (a: Uint8Array, w: number, h: number, ks: number) => { const m = new cv.Mat(h, w, cv.CV_8UC1); m.data.set(a); const o = new cv.Mat(); cv.GaussianBlur(m, o, new cv.Size(ks, ks), 0); const f = new cv.Mat(); o.convertTo(f, cv.CV_32F, 1 / 255); m.delete(); o.delete(); return f }
  const dense = (m: Uint8Array, w: number, h: number, lo: number, hi: number) => { // vùng đặc theo phân vị (DXF hay có nét lạc ở xa)
    const cx = new Float64Array(w), cy = new Float64Array(h); let tot = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { cx[x]++; cy[y]++; tot++ }
    const pct = (a: Float64Array, q: number) => { let acc = 0; for (let i = 0; i < a.length; i++) { acc += a[i]; if (acc >= q * tot) return i } return a.length - 1 }
    return { x0: pct(cx, lo), x1: pct(cx, hi), y0: pct(cy, lo), y1: pct(cy, hi) }
  }
  // tìm vị trí tốt nhất của mẫu DXF (đã thu/phóng theo M) trong mặt nạ PDF ở độ phân giải g px/pt
  const search = (g: number, Ms: number[]) => {
    const Wg = Math.ceil(pdf.w * g), Hg = Math.ceil(pdf.h * g)
    const img = blur(wallMaskCanvas(pdf, selP, g, Wg, Hg), Wg, Hg, g >= 1 ? 7 : 5)
    const D = rasterWalls(dxf, selD, k0 * g, [], false, 0.03528), bb = dense(D.mask, D.W, D.H, 0.08, 0.92)
    const cw = bb.x1 - bb.x0, ch = bb.y1 - bb.y0, crop = new Uint8Array(cw * ch)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = D.mask[(y + bb.y0) * D.W + x + bb.x0]
    const cm = new cv.Mat(ch, cw, cv.CV_8UC1); cm.data.set(crop)
    let best = { score: -1, M: M0, x: 0, y: 0 }
    for (const M of Ms) {
      const sc = M0 / M, tw = Math.round(cw * sc), th = Math.round(ch * sc); if (tw < 20 || th < 20 || tw >= Wg || th >= Hg) continue
      const rs = new cv.Mat(); cv.resize(cm, rs, new cv.Size(tw, th), 0, 0, cv.INTER_AREA)
      const tpl = blur(rs.data as Uint8Array, tw, th, g >= 1 ? 7 : 5), out = new cv.Mat()
      cv.matchTemplate(img, tpl, out, cv.TM_CCOEFF_NORMED); const mm = cv.minMaxLoc(out)
      if (mm.maxVal > best.score) best = { score: mm.maxVal, M, x: mm.maxLoc.x / g - (bb.x0 * sc) / g, y: mm.maxLoc.y / g - (bb.y0 * sc) / g }
      rs.delete(); tpl.delete(); out.delete()
    }
    img.delete(); cm.delete()
    return best
  }
  const grid = (a: number, b: number, r: number) => { const o: number[] = []; for (let M = a; M <= b; M *= 1 + r) o.push(M); return o }
  let best = search(0.5, grid(60, 150, 0.015))
  best = search(1, grid(best.M * 0.975, best.M * 1.025, 0.003))
  const M = best.M, k = dxfMm / M
  // tinh dịch chuyển ở 4 px/pt với đúng tỉ lệ
  const f = 4, Wf = Math.ceil(pdf.w * f), Hf = Math.ceil(pdf.h * f)
  const Pf = wallMaskCanvas(pdf, selP, f, Wf, Hf), Df = rasterWalls(dxf, selD, k * f, [], false, 0.03528), bbf = dense(Df.mask, Df.W, Df.H, 0.2, 0.8)
  const tw = bbf.x1 - bbf.x0, th = bbf.y1 - bbf.y0, ta = new Uint8Array(tw * th)
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) ta[y * tw + x] = Df.mask[(y + bbf.y0) * Df.W + x + bbf.x0]
  const R = 4 * f, ex = Math.round(best.x * f) + bbf.x0, ey = Math.round(best.y * f) + bbf.y0
  const rx0 = Math.max(0, ex - R), ry0 = Math.max(0, ey - R), rw = Math.min(Wf - rx0, tw + 2 * R), rh = Math.min(Hf - ry0, th + 2 * R)
  const sub = new Uint8Array(rw * rh); for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) sub[y * rw + x] = Pf[(y + ry0) * Wf + x + rx0]
  const img2 = blur(sub, rw, rh, 5), tpl2 = blur(ta, tw, th, 5), res2 = new cv.Mat()
  cv.matchTemplate(img2, tpl2, res2, cv.TM_CCOEFF_NORMED); const m2 = cv.minMaxLoc(res2)
  const dx = (rx0 + m2.maxLoc.x - bbf.x0) / f, dy = (ry0 + m2.maxLoc.y - bbf.y0) / f
  img2.delete(); tpl2.delete(); res2.delete()
  onLog(`Khớp DXF: ${M.toFixed(1)} mm/pt (≈ 1:${Math.round(M / PT_MM)}), dịch (${dx.toFixed(1)}, ${dy.toFixed(1)}) pt, độ khớp ${(m2.maxVal * 100).toFixed(0)}%`)
  // gộp: nét/tô/chữ của DXF quy về toạ độ PDF, layer gắn tiền tố "[DXF] "
  const nClsBase = pdf.classes.length
  const classes = [...pdf.classes, ...dxf.classes.map(c => ({ ...c, layer: '[DXF] ' + c.layer, key: '[DXF] ' + c.key }))]
  const segs = new Float32Array(pdf.segs.length + dxf.segs.length), cls = new Uint16Array(pdf.nSeg + dxf.nSeg)
  segs.set(pdf.segs.subarray(0, pdf.nSeg * 4)); cls.set(pdf.cls.subarray(0, pdf.nSeg))
  for (let i = 0; i < dxf.nSeg; i++) { for (let j = 0; j < 4; j += 2) { segs[(pdf.nSeg + i) * 4 + j] = dxf.segs[i * 4 + j] * k + dx; segs[(pdf.nSeg + i) * 4 + j + 1] = dxf.segs[i * 4 + j + 1] * k + dy } cls[pdf.nSeg + i] = dxf.cls[i] + nClsBase }
  const fills = [...pdf.fills, ...dxf.fills.map(fl => { const p = new Float32Array(fl.pts.length); for (let i = 0; i < p.length; i += 2) { p[i] = fl.pts[i] * k + dx; p[i + 1] = fl.pts[i + 1] * k + dy } return { cls: fl.cls + nClsBase, pts: p } })]
  const merged: VecPage = { ...pdf, segs, cls, nSeg: pdf.nSeg + dxf.nSeg, fills, classes, arcs: pdf.arcs }
  // so sánh tường: chỗ chỉ một bên có → nghi vấn (người xem quyết định)
  const g = 2, Wg = Math.ceil(pdf.w * g), Hg = Math.ceil(pdf.h * g)
  const selD2 = new Set<number>(); classes.forEach((c, i) => { if (i >= nClsBase && dRoles[c.layer] === 'wall') selD2.add(i) })
  const MP = wallMaskCanvas(merged, selP, g, Wg, Hg), MD = wallMaskCanvas(merged, selD2, g, Wg, Hg)
  const diffs: DxfMerge['diffs'] = []
  const dil = (a: Uint8Array) => { const m = new cv.Mat(Hg, Wg, cv.CV_8UC1); m.data.set(a); const o = new cv.Mat(); cv.dilate(m, o, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9))); const r = (o.data as Uint8Array).slice(); m.delete(); o.delete(); return r }
  const comps = (a: Uint8Array, kind: 'dxfOnly' | 'pdfOnly') => {
    const m = new cv.Mat(Hg, Wg, cv.CV_8UC1); m.data.set(a); const o = new cv.Mat(); cv.erode(m, o, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)))
    const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat(); const n = cv.connectedComponentsWithStats(o, lab, st, ce, 8, cv.CV_32S); const S = (st.data32S as Int32Array).slice()
    let cnt = 0
    for (let i = 1; i < n; i++) { const w = S[i * 5 + 2], h = S[i * 5 + 3]; if (S[i * 5 + 4] < 14 || Math.max(w, h) < 0.5 * g * 14.17 * 0.5) continue; if (S[i * 5] / g < 12 || S[i * 5 + 1] / g < 12 || (S[i * 5] + w) / g > pdf.w - 12 || (S[i * 5 + 1] + h) / g > pdf.h - 12) continue; cnt++; diffs.push({ kind, x: S[i * 5] / g, y: S[i * 5 + 1] / g, w: w / g, h: h / g }) }
    m.delete(); o.delete(); lab.delete(); st.delete(); ce.delete(); return cnt
  }
  const dP = dil(MP), dD = dil(MD)
  const onlyD = new Uint8Array(Wg * Hg), onlyP = new Uint8Array(Wg * Hg)
  for (let i = 0; i < onlyD.length; i++) { if (MD[i] && !dP[i]) onlyD[i] = 255; if (MP[i] && !dD[i]) onlyP[i] = 255 }
  const nDxfOnly = comps(onlyD, 'dxfOnly'), nPdfOnly = comps(onlyP, 'pdfOnly')
  onLog(`Khác biệt tường: chỉ DXF có ${nDxfOnly} chỗ, chỉ PDF có ${nPdfOnly} chỗ`)
  return { merged, dx, dy, score: m2.maxVal, mmPerPt: M, den: M / PT_MM, roles: dRoles, diffs, nDxfOnly, nPdfOnly }
}

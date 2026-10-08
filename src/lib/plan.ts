// Thuật toán đọc MẶT BẰNG từ ảnh trang concept – không dùng AI:
//  1) detectCamera: tìm biểu tượng camera (nón đỏ) trên mặt bằng nhỏ của trang phối cảnh → vị trí + hướng nhìn
//  2) registerThumb: ghép mặt bằng nhỏ vào mặt bằng chi tiết (ORB + RANSAC, dò xoay/tỉ lệ) → camera nằm ở đâu trên mặt bằng chi tiết
//  3) roomLabels + segmentRooms: lấy nhãn "TÊN / S=..M²" (toạ độ từ chữ PDF) rồi tách vùng từng phòng (watershed), hiệu chỉnh tỉ lệ theo diện tích ghi trên nhãn
//  4) countFurniture: đếm ghế / bàn (khối trắng) trong vùng phòng
export type Word = { t: string; x: number; y: number; w: number; h: number } // chuẩn hoá 0..1 theo trang
export type Pt = { x: number; y: number }
export type Camera = { x: number; y: number; dx: number; dy: number; half: number; len: number; thumb: { x: number; y: number; w: number; h: number } } // pixel của ảnh trang
export type Transform = { a: number; b: number; tx: number; ty: number } // p' = [a -b; b a]·p + t  (đồng dạng)
export type Seed = { label: string; x: number; y: number; area: number; box?: [number, number, number, number] } // pixel; box = khung chữ nhãn [x0,y0,x1,y1]
export type RoomRegion = {
  label: string; area_m2: number; seed: Pt; px: number; fit: number; trimmed: boolean
  poly: number[][]; bbox: [number, number, number, number]; counts: { chairs: number; tables: number }
  items: { x: number; y: number; t: 'c' | 't' }[]
}

// ------------------------------------------------------------------ 1. Camera
/** Tất cả biểu tượng camera (hình nón đỏ) trên trang phối cảnh – 1 slide có thể có 2+ camera cho 2+ ảnh */
export function detectCameras(cv: any, img: ImageData): Camera[] {
  const { width: W, height: H, data } = img
  const mask = new cv.Mat(H, W, cv.CV_8UC1)
  const m = mask.data as Uint8Array
  for (let i = 0, p = 0; i < W * H; i++, p += 4) { const r = data[p], g = data[p + 1], b = data[p + 2]; m[i] = r > 140 && r - g > 55 && r - b > 55 ? 255 : 0 }
  const labels = new cv.Mat(), stats = new cv.Mat(), cen = new cv.Mat()
  const n = cv.connectedComponentsWithStats(mask, labels, stats, cen, 8, cv.CV_32S)
  const minA = W * H * 0.00003, maxA = W * H * 0.003
  const cand: { i: number; a: number }[] = []
  for (let i = 1; i < n; i++) {
    const a = stats.data32S[i * 5 + 4], w = stats.data32S[i * 5 + 2], h = stats.data32S[i * 5 + 3]
    if (a < minA || a > maxA || Math.max(w, h) / Math.max(1, Math.min(w, h)) > 4.5) continue
    cand.push({ i, a })
  }
  cand.sort((x, y) => y.a - x.a)
  const L = labels.data32S as Int32Array
  const out: Camera[] = []
  for (const c of cand) {
    if (!out.length || c.a >= cand[0].a * 0.4) { // chỉ nhận các biểu tượng cùng cỡ (loại vết đỏ lẻ)
      const cam = camFromComponent(img, stats, L, c.i)
      if (cam && !out.some(o => Math.hypot(o.x - cam.x, o.y - cam.y) < Math.max(o.len, cam.len) * 1.5)) out.push(cam)
    }
    if (out.length >= 6) break
  }
  for (const cam of out) cam.thumb = thumbRegion(cv, img, cam)
  mask.delete(); labels.delete(); stats.delete(); cen.delete()
  // sắp xếp ổn định: trên → dưới, trái → phải
  return out.sort((p, q) => p.y - q.y || p.x - q.x)
}
export function detectCamera(cv: any, img: ImageData): Camera | null {
  const all = detectCameras(cv, img)
  return all.length ? all.reduce((a, b) => (b.len > a.len ? b : a)) : null
}
function camFromComponent(img: ImageData, stats: any, L: Int32Array, best: number): Camera | null {
  const { width: W } = img
  const bx = stats.data32S[best * 5], by = stats.data32S[best * 5 + 1], bw = stats.data32S[best * 5 + 2], bh = stats.data32S[best * 5 + 3]
  const xs: number[] = [], ys: number[] = []
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (L[y * W + x] === best) { xs.push(x); ys.push(y) }
  const N = xs.length; if (N < 4) return null
  const mx = xs.reduce((s, v) => s + v, 0) / N, my = ys.reduce((s, v) => s + v, 0) / N
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < N; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let ux = Math.cos(th), uy = Math.sin(th)
  const t = xs.map((x, i) => (x - mx) * ux + (ys[i] - my) * uy)
  const tmin = Math.min(...t), tmax = Math.max(...t), mid = (tmin + tmax) / 2
  const mean = t.reduce((s, v) => s + v, 0) / N
  if (mean < mid) { ux = -ux; uy = -uy; for (let i = 0; i < N; i++) t[i] = -t[i] } // hướng về đầu rộng
  const t0 = Math.min(...t), t1 = Math.max(...t), len = t1 - t0
  let apex = 0; for (let i = 0; i < N; i++) if (t[i] < t[apex]) apex = i
  // bề rộng ở 20% xa nhất
  let pmin = 1e9, pmax = -1e9
  for (let i = 0; i < N; i++) if (t[i] > t1 - 0.2 * len) { const pp = -(xs[i] - mx) * uy + (ys[i] - my) * ux; pmin = Math.min(pmin, pp); pmax = Math.max(pmax, pp) }
  const half = Math.min(1.05, Math.max(0.26, Math.atan(((pmax - pmin) / 2) / Math.max(1, len * 0.9))))
  return { x: xs[apex], y: ys[apex], dx: ux, dy: uy, half, len, thumb: { x: 0, y: 0, w: 0, h: 0 } }
}

function thumbRegion(cv: any, img: ImageData, cam: Camera) {
  const { width: W, height: H } = img
  const src = cv.matFromImageData(img), g = new cv.Mat(), bw = new cv.Mat()
  cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY)
  cv.threshold(g, bw, 90, 255, cv.THRESH_BINARY_INV)
  const k = Math.max(9, Math.round(W / 2000 * 17)) | 1
  const d = new cv.Mat(); cv.dilate(bw, d, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k)))
  const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat()
  cv.connectedComponentsWithStats(d, lab, st, ce, 8, cv.CV_32S)
  let id = 0
  for (let r = 0; r < 14 && !id; r++) for (let dy = -r; dy <= r && !id; dy++) for (let dx = -r; dx <= r && !id; dx++) {
    const x = Math.round(cam.x + dx), y = Math.round(cam.y + dy); if (x < 0 || y < 0 || x >= W || y >= H) continue
    id = lab.data32S[y * W + x]
  }
  let out = { x: Math.max(0, cam.x - 0.12 * W), y: Math.max(0, cam.y - 0.3 * H), w: 0.24 * W, h: 0.6 * H }
  if (id) {
    const x = st.data32S[id * 5], y = st.data32S[id * 5 + 1], w = st.data32S[id * 5 + 2], h = st.data32S[id * 5 + 3]
    if (w < 0.45 * W && h < 0.95 * H && w > 0.05 * W) out = { x, y, w, h }
  }
  src.delete(); g.delete(); bw.delete(); d.delete(); lab.delete(); st.delete(); ce.delete()
  out.w = Math.min(out.w, W - out.x); out.h = Math.min(out.h, H - out.y)
  return out
}

// ------------------------------------------------------------------ 2. Ghép mặt bằng nhỏ → mặt bằng chi tiết
export type Feat = { kp: Pt[]; des: any; w: number; h: number }
export function orbFeatures(cv: any, img: ImageData, crop?: { x: number; y: number; w: number; h: number }, n = 5000): Feat {
  const src = cv.matFromImageData(img), g = new cv.Mat()
  cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY)
  let use = g
  const ox = crop ? Math.round(crop.x) : 0, oy = crop ? Math.round(crop.y) : 0
  if (crop) use = g.roi(new cv.Rect(ox, oy, Math.round(crop.w), Math.round(crop.h)))
  const orb = new cv.ORB(n, 1.2, 12), kp = new cv.KeyPointVector(), des = new cv.Mat()
  orb.detectAndCompute(use, new cv.Mat(), kp, des)
  const pts: Pt[] = []
  for (let i = 0; i < kp.size(); i++) { const p = kp.get(i).pt; pts.push({ x: p.x + ox, y: p.y + oy }) }
  kp.delete(); orb.delete(); src.delete(); g.delete(); if (crop) use.delete()
  return { kp: pts, des, w: img.width, h: img.height }
}
export function freeFeat(f: Feat) { try { f.des.delete() } catch { /* */ } }

/** Ghép đặc trưng a (mặt bằng nhỏ) vào b (mặt bằng chi tiết): trả phép đồng dạng a→b */
export function matchSimilarity(cv: any, a: Feat, b: Feat): { T: Transform; inliers: number; total: number } | null {
  if (a.kp.length < 20 || b.kp.length < 20) return null
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false), mm = new cv.DMatchVectorVector()
  bf.knnMatch(a.des, b.des, mm, 2)
  const pairs: [Pt, Pt][] = []
  for (let i = 0; i < mm.size(); i++) {
    const v = mm.get(i); if (v.size() < 2) continue
    const m1 = v.get(0), m2 = v.get(1)
    if (m1.distance < 0.85 * m2.distance) pairs.push([a.kp[m1.queryIdx], b.kp[m1.trainIdx]])
  }
  mm.delete(); bf.delete()
  if (pairs.length < 8) return null
  const sim = (s0: Pt, s1: Pt, d0: Pt, d1: Pt): Transform | null => {
    const sx = s1.x - s0.x, sy = s1.y - s0.y, dx = d1.x - d0.x, dy = d1.y - d0.y
    const den = sx * sx + sy * sy; if (den < 100) return null
    const a_ = (sx * dx + sy * dy) / den, b_ = (sx * dy - sy * dx) / den
    return { a: a_, b: b_, tx: d0.x - (a_ * s0.x - b_ * s0.y), ty: d0.y - (b_ * s0.x + a_ * s0.y) }
  }
  const app = (T: Transform, p: Pt): Pt => ({ x: T.a * p.x - T.b * p.y + T.tx, y: T.b * p.x + T.a * p.y + T.ty })
  let best: Transform | null = null, bestN = 0, seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let it = 0; it < 1500; it++) {
    const i = Math.floor(rnd() * pairs.length); const j = Math.floor(rnd() * pairs.length); if (i === j) continue
    const T = sim(pairs[i][0], pairs[j][0], pairs[i][1], pairs[j][1]); if (!T) continue
    const sc = Math.hypot(T.a, T.b); if (sc < 0.4 || sc > 10) continue
    let n = 0; for (const [p, q] of pairs) { const r = app(T, p); if (Math.hypot(r.x - q.x, r.y - q.y) < 7) n++ }
    if (n > bestN) { bestN = n; best = T }
  }
  if (!best || bestN < 12) return null
  // tinh chỉnh bằng bình phương tối thiểu trên điểm khớp
  const inl = pairs.filter(([p, q]) => { const r = app(best!, p); return Math.hypot(r.x - q.x, r.y - q.y) < 7 })
  const n = inl.length, mpx = inl.reduce((s, [p]) => s + p.x, 0) / n, mpy = inl.reduce((s, [p]) => s + p.y, 0) / n, mqx = inl.reduce((s, [, q]) => s + q.x, 0) / n, mqy = inl.reduce((s, [, q]) => s + q.y, 0) / n
  let num1 = 0, num2 = 0, den = 0
  for (const [p, q] of inl) { const px = p.x - mpx, py = p.y - mpy, qx = q.x - mqx, qy = q.y - mqy; num1 += px * qx + py * qy; num2 += px * qy - py * qx; den += px * px + py * py }
  const a_ = num1 / den, b_ = num2 / den
  const T = { a: a_, b: b_, tx: mqx - (a_ * mpx - b_ * mpy), ty: mqy - (b_ * mpx + a_ * mpy) }
  return { T, inliers: n, total: pairs.length }
}
export const applyT = (T: Transform, p: Pt): Pt => ({ x: T.a * p.x - T.b * p.y + T.tx, y: T.b * p.x + T.a * p.y + T.ty })

// ------------------------------------------------------------------ 3. Nhãn phòng trên mặt bằng (từ chữ PDF)
const AREA_RE = /^S\s*=\s*([\d.,]+)\s*M[²2]$/i
/** Tìm nhãn "TÊN PHÒNG / S=..M²" nằm TRÊN mặt bằng (không phải bảng chú thích bên cạnh): nền quanh nhãn không phải nền trang */
export function roomLabels(words: Word[], img: ImageData): Seed[] {
  const { width: W, height: H, data } = img
  const lum = (x: number, y: number) => { x = Math.min(W - 1, Math.max(0, Math.round(x))); y = Math.min(H - 1, Math.max(0, Math.round(y))); const p = (y * W + x) * 4; return 0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2] }
  const out: Seed[] = []
  for (const w of words) {
    const m = AREA_RE.exec(w.t.replace(/\s+/g, '')); if (!m) continue
    const area = parseFloat(m[1].replace(',', '.')); if (!(area > 0)) continue
    const cx = (w.x + w.w / 2) * W, cy = (w.y + w.h / 2) * H, hw = Math.max(w.w * W, 24) * 0.9, hh = Math.max(w.h * H, 8) * 2.2
    // nền: lấy mẫu vòng quanh nhãn – nhãn trong mặt bằng nằm trên ô màu/nền sàn, tối hơn nền trang (≈ 240+)
    let sum = 0, n = 0
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; sum += lum(cx + Math.cos(a) * hw, cy + Math.sin(a) * hh); n++ }
    if (sum / n > 232) continue
    // tên: các chữ nằm ngay phía trên, cùng cột
    const above = words.filter(o => o !== w && !AREA_RE.test(o.t.replace(/\s+/g, '')) && Math.abs((o.x + o.w / 2) - (w.x + w.w / 2)) < Math.max(w.w, 0.03) * 1.3
      && o.y + o.h <= w.y + w.h * 0.3 && w.y - o.y < w.h * 4.2).sort((p, q) => p.y - q.y || p.x - q.x)
    const all = [w, ...above]
    const box: [number, number, number, number] = [Math.min(...all.map(o => o.x)) * W, Math.min(...all.map(o => o.y)) * H, Math.max(...all.map(o => o.x + o.w)) * W, Math.max(...all.map(o => o.y + o.h)) * H]
    out.push({ label: above.map(o => o.t).join(' ').replace(/\s+/g, ' ').trim(), x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2, area, box })
  }
  return out
}

// ------------------------------------------------------------------ 4. Tách vùng phòng
// Cách làm: tường = nét tối DÀY (mở 5×5 để bỏ chữ, đường kích thước, nét đồ rời). Từ nhãn của mỗi phòng loang ra trong phần sàn không bị tường chặn.
//  - phòng kín: vùng loang xong tự dừng, diện tích ≈ S ghi trên nhãn → tính tỉ lệ pixel/m² từ các phòng kín (trung vị)
//  - phòng mở (open office…): nhiều nhãn loang đồng thời, mỗi nhãn chỉ lấy tối đa ≈ S·k pixel → hình dạng gần đúng quanh nhãn
export function segmentRooms(cv: any, img: ImageData, seeds: Seed[], kOverride?: number): { rooms: RoomRegion[]; k: number; kBasis: 'closed-rooms' | 'fallback' | 'cad' } {
  const { width: W, height: H, data } = img
  const gray = new Uint8Array(W * H)
  for (let i = 0, p = 0; i < W * H; i++, p += 4) gray[i] = (0.3 * data[p] + 0.59 * data[p + 1] + 0.11 * data[p + 2]) | 0
  // ngưỡng tường theo độ sáng sàn: tường (nét đậm/gạch chéo) tối hơn sàn rõ rệt
  const hist = new Uint32Array(256); let tot = 0
  for (let i = 0; i < W * H; i += 3) if (gray[i] < 225) { hist[gray[i]]++; tot++ }
  let acc = 0, med = 160; for (let v = 0; v < 225; v++) { acc += hist[v]; if (acc >= tot / 2) { med = v; break } }
  const th = Math.max(70, Math.min(150, 0.72 * med))
  const gm = new cv.Mat(H, W, cv.CV_8UC1); gm.data.set(gray)
  const bl = new cv.Mat(); cv.GaussianBlur(gm, bl, new cv.Size(0, 0), Math.max(0.8, W / 2000 * 1.2))
  const raw = new cv.Mat(H, W, cv.CV_8UC1)
  for (let i = 0; i < W * H; i++) raw.data[i] = bl.data[i] < th ? 255 : 0
  gm.delete(); bl.delete()
  const ks = Math.max(3, Math.round(W / 2000 * 5)) | 1
  const wallM = new cv.Mat(); cv.morphologyEx(raw, wallM, cv.MORPH_OPEN, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks, ks)))
  const wall = wallM.data as Uint8Array
  // xoá khung/ô viền của chính nhãn (ô oval nét đứt bao quanh chữ) khỏi "tường"
  for (const s of seeds) if (s.box) {
    const px = Math.round(W / 2000 * 26), py = Math.round(W / 2000 * 14)
    for (let y = Math.max(0, Math.floor(s.box[1] - py)); y < Math.min(H, Math.ceil(s.box[3] + py)); y++) for (let x = Math.max(0, Math.floor(s.box[0] - px)); x < Math.min(W, Math.ceil(s.box[2] + px)); x++) wall[y * W + x] = 0
  }
  // ngoài mặt bằng: vùng sáng nối với mép trang
  const ext = new Uint8Array(W * H), q = new Int32Array(W * H); let qh = 0, qt = 0
  const push = (i: number) => { if (!ext[i] && gray[i] > 225 && !wall[i]) { ext[i] = 1; q[qt++] = i } }
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
  while (qh < qt) { const i = q[qh++], x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < W * (H - 1)) push(i + W) }
  const free = (i: number) => !wall[i] && !ext[i]
  const nearestFree = (sx: number, sy: number) => {
    for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = Math.round(sx) + dx, y = Math.round(sy) + dy; if (x >= 0 && y >= 0 && x < W && y < H && free(y * W + x)) return y * W + x }
    return -1
  }
  const starts = seeds.map(s => nearestFree(s.x, s.y))
  const nbrs = (j: number) => { const x = j % W; return [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j >= W ? j - W : -1, j < W * (H - 1) ? j + W : -1] }

  // (a) watershed trên bản đồ khoảng cách tới tường: các phòng bị tách tại "cổ hẹp" (cửa)
  const floorM = new cv.Mat(H, W, cv.CV_8UC1)
  for (let i = 0; i < W * H; i++) floorM.data[i] = free(i) ? 255 : 0
  const dist = new cv.Mat(); cv.distanceTransform(floorM, dist, cv.DIST_L2, 5)
  const land = new cv.Mat(H, W, cv.CV_8UC3)
  for (let i = 0; i < W * H; i++) { const v = 255 - Math.min(255, dist.data32F[i] * 7); land.data[i * 3] = v; land.data[i * 3 + 1] = v; land.data[i * 3 + 2] = v }
  const mk = new cv.Mat(H, W, cv.CV_32SC1, new cv.Scalar(0))
  const Rr = Math.max(3, Math.round(W / 2000 * 6))
  seeds.forEach((s, i) => cv.circle(mk, new cv.Point(Math.round(s.x), Math.round(s.y)), Rr, new cv.Scalar(i + 1), -1))
  const EXT = seeds.length + 1
  for (let i = 0; i < W * H; i++) { if (ext[i]) mk.data32S[i] = EXT; else if (wall[i]) mk.data32S[i] = 0 }
  cv.watershed(land, mk)
  const lab = mk.data32S as Int32Array
  const own = new Int32Array(W * H).fill(-1), cnt = new Int32Array(seeds.length)
  for (let j = 0; j < W * H; j++) { const l = lab[j]; if (l > 0 && l <= seeds.length && free(j)) { own[j] = l - 1; cnt[l - 1]++ } }
  floorM.delete(); dist.delete(); land.delete(); mk.delete()
  // tỉ lệ pixel/m²: phân vị 35% của (diện tích vùng / S) – phòng kín chiếm đa số, phòng bị lan rộng bị loại bớt
  const ratios = seeds.map((s, i) => cnt[i] / s.area).filter(r => r > 0).sort((x, y) => x - y)
  let k = ratios.length ? ratios[Math.floor((ratios.length - 1) * 0.35)] : 0
  let kBasis: 'closed-rooms' | 'fallback' | 'cad' = ratios.length >= 4 ? 'closed-rooms' : 'fallback'
  if (kOverride && kOverride > 0) { k = kOverride; kBasis = 'cad' }
  // (b) phòng lan quá S·k → giữ phần gần nhãn nhất (loang theo khoảng cách đường đi)
  const budget = seeds.map(s => Math.round(s.area * k * 1.1))
  seeds.forEach((s, i) => {
    if (cnt[i] <= budget[i] * 1.15) return
    let st = nearestFree(s.x, s.y); if (st < 0 || own[st] !== i) { st = -1; for (let j = 0; j < W * H; j++) if (own[j] === i) { const x = j % W, y = (j / W) | 0; if (st < 0 || (x - s.x) ** 2 + (y - s.y) ** 2 < ((st % W) - s.x) ** 2 + (((st / W) | 0) - s.y) ** 2) st = j } }
    if (st < 0) return
    const keep = new Uint8Array(W * H); let h = 0, t = 0, a = 0; q[t++] = st; keep[st] = 2
    while (h < t && a < budget[i]) { const j = q[h++]; keep[j] = 1; a++; for (const nb of nbrs(j)) if (nb >= 0 && own[nb] === i && !keep[nb]) { keep[nb] = 2; q[t++] = nb } }
    for (let j = 0; j < W * H; j++) if (own[j] === i && keep[j] !== 1) own[j] = -2
    cnt[i] = a
  })

  const rooms: RoomRegion[] = []
  seeds.forEach((s, i) => {
    const region = new Uint8Array(W * H); let n = 0
    for (let j = 0; j < W * H; j++) if (own[j] === i) { region[j] = 1; n++ }
    const m = new cv.Mat(H, W, cv.CV_8UC1); for (let j = 0; j < W * H; j++) m.data[j] = region[j] ? 255 : 0
    const cl = new cv.Mat(); cv.morphologyEx(m, cl, cv.MORPH_CLOSE, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks * 3, ks * 3)))
    const cs = new cv.MatVector(), hi = new cv.Mat(); cv.findContours(cl, cs, hi, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    let bi = -1, ba = 0; for (let c = 0; c < cs.size(); c++) { const ar = cv.contourArea(cs.get(c)); if (ar > ba) { ba = ar; bi = c } }
    const poly: number[][] = []; let bb: [number, number, number, number] = [s.x / W, s.y / H, 0.01, 0.01]
    if (bi >= 0) {
      const ap = new cv.Mat(); cv.approxPolyDP(cs.get(bi), ap, Math.max(1.5, W / 2000 * 3), true)
      for (let p = 0; p < ap.rows; p++) poly.push([ap.data32S[p * 2] / W, ap.data32S[p * 2 + 1] / H]); ap.delete()
      const r = cv.boundingRect(cs.get(bi)); bb = [r.x / W, r.y / H, r.width / W, r.height / H]
    }
    cs.delete(); hi.delete(); m.delete(); cl.delete()
    const target = s.area * k, ratio = target > 0 ? n / target : 0
    rooms.push({ label: s.label, area_m2: s.area, seed: { x: s.x / W, y: s.y / H }, px: n, fit: Math.min(1, ratio), trimmed: ratios.length > 0 && cnt[i] >= budget[i] * 0.98, poly, bbox: bb, ...countFurniture(cv, gray, W, H, region, k) })
  })
  raw.delete(); wallM.delete()
  return { rooms, k, kBasis }
}

// ------------------------------------------------------------------ 5. Đếm ghế / bàn (khối trắng trong vùng phòng)
export function countFurniture(cv: any, gray: Uint8Array, W: number, H: number, region: Uint8Array, k: number): { counts: { chairs: number; tables: number }; items: { x: number; y: number; t: 'c' | 't' }[] } {
  if (!(k > 0)) return { counts: { chairs: 0, tables: 0 }, items: [] }
  const m = new cv.Mat(H, W, cv.CV_8UC1)
  for (let i = 0; i < W * H; i++) m.data[i] = region[i] && gray[i] >= 238 ? 255 : 0
  const lab = new cv.Mat(), st = new cv.Mat(), ce = new cv.Mat()
  const n = cv.connectedComponentsWithStats(m, lab, st, ce, 4, cv.CV_32S)
  let chairs = 0, tables = 0
  const items: { x: number; y: number; t: 'c' | 't' }[] = []
  for (let i = 1; i < n; i++) {
    const a = st.data32S[i * 5 + 4] / k, w = st.data32S[i * 5 + 2], h = st.data32S[i * 5 + 3], asp = Math.max(w, h) / Math.max(1, Math.min(w, h)), fill = st.data32S[i * 5 + 4] / (w * h)
    const cx = ce.data64F[i * 2] / W, cy = ce.data64F[i * 2 + 1] / H
    if (a >= 0.07 && a <= 0.42 && asp <= 2.2 && fill > 0.45) { chairs++; items.push({ x: +cx.toFixed(4), y: +cy.toFixed(4), t: 'c' }) }
    else if (a > 0.42 && a <= 14 && fill > 0.5) { tables++; items.push({ x: +cx.toFixed(4), y: +cy.toFixed(4), t: 't' }) }
  }
  m.delete(); lab.delete(); st.delete(); ce.delete()
  return { counts: { chairs, tables }, items }
}

/** Mô tả hướng nhìn (theo mặt bằng chi tiết) bằng lời, vd "nhìn lên phía trên của mặt bằng" */
export function dirWords(dx: number, dy: number): string {
  const ang = (Math.atan2(-dy, dx) * 180) / Math.PI // 0 = sang phải, 90 = lên trên
  const names = ['sang phải', 'lên phía phải-trên', 'lên trên', 'lên phía trái-trên', 'sang trái', 'xuống phía trái-dưới', 'xuống dưới', 'xuống phía phải-dưới']
  return names[Math.round((((ang % 360) + 360) % 360) / 45) % 8]
}

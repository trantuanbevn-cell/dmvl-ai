// Đặc trưng ảnh bề mặt vật liệu (v2) – thuần tính toán trên điểm ảnh, không phụ thuộc trình duyệt (để thử nghiệm được).
// Mục tiêu: so ảnh khoanh trong phối cảnh với map thư viện theo VÂN / HOA VĂN / hướng vân / tỷ lệ chi tiết / màu chủ đạo,
// không để màu trung bình (rất dễ lệch do ánh sáng phối cảnh) quyết định tất cả như bản v1.
//
// Bộ mô tả (33 số):  [0..2] L,a,b trung bình · [3] độ tương phản vân (sau khi bỏ chênh sáng) · [4,5] độ lệch a,b
//                    rồi với mỗi trong 3 thang chi tiết (mịn → thô): 8 ô hướng cạnh (chuẩn hoá) + 1 năng lượng cạnh.
export const FEAT_N = 64
export const FEAT_LEN = 33

function lab(r: number, g: number, b: number): [number, number, number] {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const R = f(r), G = f(g), B = f(b)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)
  return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))]
}

/** Các cửa sổ vuông cần lấy trên ảnh w×h: giữ đúng tỉ lệ (không bóp méo vân), ảnh dài thì lấy tối đa 3 cửa sổ rải đều */
export function windowsOf(w: number, h: number): [number, number, number][] {
  const s = Math.min(w, h), long = Math.max(w, h)
  const n = Math.max(1, Math.min(3, Math.round(long / s)))
  const out: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? (long - s) / 2 : ((long - s) * i) / (n - 1)
    out.push(w >= h ? [Math.round(off), 0, s] : [0, Math.round(off), s])
  }
  return out
}

/** Làm mờ hộp (tách trục) với biên kẹp */
function boxBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n), k = 2 * r + 1
  for (let y = 0; y < n; y++) {
    let s = 0; for (let x = -r; x <= r; x++) s += src[y * n + Math.min(n - 1, Math.max(0, x))]
    for (let x = 0; x < n; x++) { tmp[y * n + x] = s / k; s += src[y * n + Math.min(n - 1, x + r + 1)] - src[y * n + Math.max(0, x - r)] }
  }
  for (let x = 0; x < n; x++) {
    let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(n - 1, Math.max(0, y)) * n + x]
    for (let y = 0; y < n; y++) { out[y * n + x] = s / k; s += tmp[Math.min(n - 1, y + r + 1) * n + x] - tmp[Math.max(0, y - r) * n + x] }
  }
  return out
}
function halve(src: Float32Array, n: number): Float32Array {
  const m = n >> 1, out = new Float32Array(m * m)
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) out[y * m + x] = (src[2 * y * n + 2 * x] + src[2 * y * n + 2 * x + 1] + src[(2 * y + 1) * n + 2 * x] + src[(2 * y + 1) * n + 2 * x + 1]) / 4
  return out
}
/** Biểu đồ hướng cạnh (8 ô trên 0..180°, chia mềm 2 ô) + năng lượng cạnh trung bình */
function edges(img: Float32Array, n: number): number[] {
  const h = new Array(8).fill(0); let tot = 0
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = y * n + x
    const gx = (img[i - n + 1] + 2 * img[i + 1] + img[i + n + 1]) - (img[i - n - 1] + 2 * img[i - 1] + img[i + n - 1])
    const gy = (img[i + n - 1] + 2 * img[i + n] + img[i + n + 1]) - (img[i - n - 1] + 2 * img[i - n] + img[i - n + 1])
    const mag = Math.hypot(gx, gy) / 8; if (mag < 1e-6) continue
    let th = Math.atan2(gy, gx); if (th < 0) th += Math.PI; if (th >= Math.PI) th -= Math.PI
    const pos = (th / Math.PI) * 8, b0 = Math.floor(pos) % 8, f = pos - Math.floor(pos)
    h[b0] += mag * (1 - f); h[(b0 + 1) % 8] += mag * f; tot += mag
  }
  const energy = tot / ((n - 2) * (n - 2))
  const s = h.reduce((a, v) => a + v, 0)
  return [...h.map(v => (s > 0 ? v / s : 0.125)), energy]
}

/** Bộ mô tả của MỘT cửa sổ: px = FEAT_N×FEAT_N×4 byte RGBA */
export function descOfWindow(px: ArrayLike<number>): number[] {
  const n = FEAT_N, nn = n * n
  const L = new Float32Array(nn), A = new Float32Array(nn), B = new Float32Array(nn)
  for (let i = 0; i < nn; i++) { const v = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); L[i] = v[0]; A[i] = v[1]; B[i] = v[2] }
  const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / nn
  const mL = mean(L), mA = mean(A), mB = mean(B)
  const sd = (a: Float32Array, mu: number) => Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / nn)
  // bỏ chênh sáng do chiếu sáng/phối cảnh: trừ nền sáng thay đổi chậm
  const lb = boxBlur(L, n, 16), hp = new Float32Array(nn)
  for (let i = 0; i < nn; i++) hp[i] = L[i] - lb[i]
  const out = [mL, mA, mB, sd(hp, 0), sd(A, mA), sd(B, mB)]
  let cur: Float32Array = hp, m = n
  for (let s = 0; s < 3; s++) { out.push(...edges(cur, m)); cur = halve(cur, m); m >>= 1 }
  return out.map(v => Math.round(v * 100) / 100)
}
/** Gộp nhiều cửa sổ của cùng một ảnh (trung bình) */
export function combineDesc(ds: number[][]): number[] {
  if (ds.length === 1) return ds[0]
  return ds[0].map((_, i) => Math.round((ds.reduce((s, d) => s + d[i], 0) / ds.length) * 100) / 100)
}

const sh = (h: number[], k: number) => h.map((_, i) => h[(i + k) % 8])
const inter = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.min(v, b[i]), 0)

export type SimParts = { col: number; lum: number; spread: number; contrast: number; orient: number; scale: number }
export type Weights = { col: number; lum: number; spread: number; contrast: number; orient: number; scale: number }
export const W0: Weights = { col: 0.26, lum: 0.08, spread: 0.05, contrast: 0.1, orient: 0.36, scale: 0.15 }

/** Độ giống 0..1 giữa hai bộ mô tả; trả thêm từng thành phần để giải thích / tinh chỉnh trọng số */
export function sim2(a: number[], b: number[], w: Weights = W0): { score: number; parts: SimParts } {
  const dab = Math.hypot(a[1] - b[1], a[2] - b[2])
  const col = Math.exp(-(dab * dab) / (2 * 9 * 9))
  const lum = Math.exp(-((a[0] - b[0]) ** 2) / (2 * 18 * 18))
  const spread = Math.exp(-(Math.hypot(a[4] - b[4], a[5] - b[5]) ** 2) / (2 * 6 * 6))
  const contrast = Math.max(0, 1 - Math.abs(Math.log((a[3] + 0.5) / (b[3] + 0.5))) / Math.log(3))
  // hướng vân: so từng thang; cho phép xoay 90° (vân ngang/dọc tuỳ cách ốp) với hệ số 0,9
  let orient = 0, wsum = 0, scale = 0
  const SW = [0.3, 0.4, 0.3]
  for (let s = 0; s < 3; s++) {
    const o = 6 + s * 9, ha = a.slice(o, o + 8), hb = b.slice(o, o + 8), ea = a[o + 8], eb = b[o + 8]
    const flatA = ea < 0.25, flatB = eb < 0.25
    let v: number
    if (flatA && flatB) v = 1
    else if (flatA || flatB) v = 0.25
    else v = Math.max(inter(ha, hb), 0.9 * inter(ha, sh(hb, 4)))
    orient += SW[s] * v; wsum += SW[s]
    scale += SW[s] * Math.max(0, 1 - Math.abs(Math.log((ea + 0.3) / (eb + 0.3))) / Math.log(4))
  }
  orient /= wsum; scale /= wsum
  const parts = { col, lum, spread, contrast, orient, scale }
  const tw = w.col + w.lum + w.spread + w.contrast + w.orient + w.scale
  return { score: (w.col * col + w.lum * lum + w.spread * spread + w.contrast * contrast + w.orient * orient + w.scale * scale) / tw, parts }
}

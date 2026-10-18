// Mô hình mặt bằng SỬA ĐƯỢC (đơn vị mét, trục y hướng xuống như bản vẽ). Nhập từ DXF rồi sửa tường · cột · cửa; dựng 3D từ chính mô hình này.
import polygonClipping from 'polygon-clipping'
import type { VecPage } from '../vector'
import { PT_MM } from '../dims'

export type Pt = [number, number]
import { WALL_TYPES, wallTypeOf } from './library'
export const WALL_KINDS = WALL_TYPES
export const kindOf = wallTypeOf

export type Wall = { id: string; role: 'wall' | 'col'; kind: string; finish?: string; h?: number; name?: string; shape: { type: 'poly'; rings: Pt[][] } | { type: 'seg'; a: Pt; b: Pt; t: number; bulge?: number } }
export type DoorKind = 'door' | 'double' | 'window' | 'slide' | 'opening'
export const DOOR_KINDS: { key: DoorKind; label: string; w: number; h: number; sill: number }[] = [
  { key: 'door', label: 'Cửa đi một cánh', w: 0.9, h: 2.1, sill: 0 },
  { key: 'double', label: 'Cửa đi hai cánh', w: 1.6, h: 2.1, sill: 0 },
  { key: 'slide', label: 'Cửa trượt / kính', w: 1.8, h: 2.2, sill: 0 },
  { key: 'window', label: 'Cửa sổ', w: 1.5, h: 1.4, sill: 0.9 },
  { key: 'opening', label: 'Ô trống (không cánh)', w: 1.2, h: 2.4, sill: 0 },
]
/** x,y = tâm cửa trên tường; ang = hướng dọc tường (rad); flip = đảo phía mở */
export type Door = { id: string; kind: DoorKind; lib?: string; finish?: string; frameFinish?: string; x: number; y: number; ang: number; w: number; h: number; sill: number; flip?: boolean; name?: string }
export type Dim = { id: string; a: Pt; b: Pt; off: number }
export type Room = { id: string; name: string; en?: string; poly: Pt[]; area?: number; floor?: string; ceil?: string; ceilH?: number }
export type Model = { v: 1; walls: Wall[]; doors: Door[]; dims?: Dim[]; rooms?: Room[]; hWall: number; hCol: number; mPt: number; w: number; h: number }

let seq = 0
export const uid = (p: string) => p + Date.now().toString(36) + (seq++).toString(36)

/** path "M x y L x y … Z M …" (pt) → các vòng (m) */
function loopsOf(d: string, m: number): Pt[][] {
  const out: Pt[][] = []
  for (const part of d.split('M').slice(1)) {
    const pts = part.replace(/Z/g, '').split('L').map(s => s.trim().split(/\s+/).map(Number)).filter(p => p.length === 2 && isFinite(p[0]) && isFinite(p[1])).map(p => [p[0] * m, p[1] * m] as Pt)
    if (pts.length >= 3) out.push(pts)
  }
  return out
}
export const area = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
export const inside = (p: Pt, l: Pt[]) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > p[1]) !== (l[j][1] > p[1]) && p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c; return c }

/** Nhập từ trang vector DXF (draw runs): mỗi khối hatch tường/cột → một Wall dạng poly (vòng ngoài + lỗ) */
export function modelFromVec(v: VecPage, den: number): Model {
  const m = (PT_MM * den) / 1000, walls: Wall[] = []
  for (const r of v.draw ?? []) {
    if (!r.hp) continue
    const loops = loopsOf(r.d, m).filter(l => Math.abs(area(l)) > 1e-4)
    const depth = loops.map((l, i) => loops.reduce((n, o, j) => n + (j !== i && Math.abs(area(o)) > Math.abs(area(l)) && inside(l[0], o) ? 1 : 0), 0))
    loops.forEach((l, i) => {
      if (depth[i] % 2) return
      const holes = loops.filter((h, j) => depth[j] === depth[i] + 1 && inside(h[0], l))
      const role = r.rl === 'col' ? 'col' : 'wall'
      walls.push({ id: uid('w'), role, kind: role === 'col' ? 'concrete' : 'brick', shape: { type: 'poly', rings: [l, ...holes] } })
    })
  }
  return { v: 1, walls, doors: [], dims: [], rooms: [], hWall: 3.3, hCol: 3.3, mPt: m, w: v.w * m, h: v.h * m }
}

export const wallH = (w: Wall, M: Model) => w.h ?? (w.role === 'col' ? M.hCol : M.hWall)
/** Hình chiếu bằng của tường (polygon-clipping: [vòng ngoài, ...lỗ]) */
/** Đường tim của tường thêm tay: thẳng, hoặc cung (bulge = độ võng giữa dây cung, m; dương = võng về bên trái chiều a→b) */
export function centerline(w: Wall): Pt[] {
  if (w.shape.type !== 'seg') return []
  const { a, b, bulge } = w.shape
  if (!bulge || Math.abs(bulge) < 0.01) return [a, b]
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, sg = bulge, R = (c * c / 4 + sg * sg) / (2 * Math.abs(sg)), ux = (b[0] - a[0]) / c, uy = (b[1] - a[1]) / c
  const nx = -uy, ny = ux, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, k = Math.sign(sg)
  const cx = mx + nx * k * (Math.abs(sg) - R), cy = my + ny * k * (Math.abs(sg) - R)
  const a0 = Math.atan2(a[1] - cy, a[0] - cx), a1 = Math.atan2(b[1] - cy, b[0] - cx), mid = Math.atan2(my + ny * sg - cy, mx + nx * sg - cx)
  let da = a1 - a0; const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x)); da = wrap(da)
  const toMid = wrap(mid - a0); if (Math.abs(toMid) > Math.abs(da) + 1e-6 || Math.sign(toMid) !== Math.sign(da)) da = da > 0 ? da - Math.PI * 2 : da + Math.PI * 2
  const n = Math.max(8, Math.min(48, Math.ceil(Math.abs(da) / (Math.PI / 24)))), out: Pt[] = []
  for (let i = 0; i <= n; i++) { const t = a0 + da * i / n; out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]) }
  return out
}
/** Hình chiếu bằng của tường (polygon-clipping: [vòng ngoài, ...lỗ]) */
export function footprint(w: Wall): Pt[][] {
  if (w.shape.type === 'poly') return w.shape.rings
  const t = w.shape.t, e = t / 2, line = centerline(w).slice()
  const dir = (p: Pt, q: Pt) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / L, (q[1] - p[1]) / L] }
  let d0 = dir(line[0], line[1]), d1 = dir(line[line.length - 2], line[line.length - 1])
  line[0] = [line[0][0] - d0[0] * e, line[0][1] - d0[1] * e]; line[line.length - 1] = [line[line.length - 1][0] + d1[0] * e, line[line.length - 1][1] + d1[1] * e]
  const L: Pt[] = [], R: Pt[] = []
  for (let i = 0; i < line.length; i++) {
    const p = line[i], d = i === 0 ? dir(line[0], line[1]) : i === line.length - 1 ? dir(line[i - 1], line[i]) : dir(line[i - 1], line[i + 1])
    L.push([p[0] - d[1] * e, p[1] + d[0] * e]); R.push([p[0] + d[1] * e, p[1] - d[0] * e])
  }
  void d0; void d1
  return [[...L, ...R.reverse()]]
}
/** Hình chữ nhật ô cửa (dài w dọc tường, sâu "deep" xuyên tường) */
export function doorRect(d: Door, deep = 1.0): Pt[] {
  const ux = Math.cos(d.ang), uy = Math.sin(d.ang), hw = d.w / 2, hd = deep / 2
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([s, t]) => [d.x + ux * s - uy * t, d.y + uy * s + ux * t] as Pt)
}
export const bbox = (rings: Pt[][]) => { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const p of rings[0]) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] } return { x0, y0, x1, y1 } }

export type Part = { poly: Pt[][]; z0: number; z1: number; glass?: boolean }
/** Tách một tường thành các khối 3D sau khi đục cửa: thân (cao đủ) + mảng trên cửa + mảng dưới bệ cửa */
export function wallParts(w: Wall, M: Model): Part[] {
  const H = wallH(w, M), fp = footprint(w), bb = bbox(fp)
  const ds = M.doors.filter(d => { const r = doorRect(d), x0 = Math.min(...r.map(p => p[0])), x1 = Math.max(...r.map(p => p[0])), y0 = Math.min(...r.map(p => p[1])), y1 = Math.max(...r.map(p => p[1])); return x1 >= bb.x0 && x0 <= bb.x1 && y1 >= bb.y0 && y0 <= bb.y1 })
  const toPoly = (mp: any): Pt[][][] => mp as Pt[][][]
  if (!ds.length) return [{ poly: fp, z0: 0, z1: H }]
  const parts: Part[] = []
  const rects = ds.map(d => [doorRect(d)] as any)
  let body: any
  try { body = polygonClipping.difference([fp] as any, ...rects) } catch { return [{ poly: fp, z0: 0, z1: H }] }
  for (const p of toPoly(body)) parts.push({ poly: p, z0: 0, z1: H })
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i]; let cut: any; try { cut = polygonClipping.intersection([fp] as any, rects[i]) } catch { continue }
    const top = Math.min(H, d.sill + d.h)
    for (const p of toPoly(cut)) { if (top < H - 1e-3) parts.push({ poly: p, z0: top, z1: H }); if (d.sill > 1e-3) parts.push({ poly: p, z0: 0, z1: Math.min(d.sill, H) }) }
  }
  return parts
}

/** Gợi ý vị trí đặt cửa: điểm gần nhất trên cạnh tường (kèm hướng cạnh) */
export function snapToWall(M: Model, p: Pt, tol: number): { x: number; y: number; ang: number; thick: number } | null {
  let best: { x: number; y: number; ang: number; thick: number } | null = null, bd = tol
  for (const w of M.walls) {
    if (w.role === 'col') continue
    const rings: Pt[][] = w.shape.type === 'poly' ? w.shape.rings : [centerline(w)]
    for (const r of rings) for (let i = 0; i < (w.shape.type === 'seg' ? r.length - 1 : r.length); i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(p[0] - x, p[1] - y)
      if (d < bd && Math.hypot(dx, dy) > 0.25) { bd = d; best = { x, y, ang: Math.atan2(dy, dx), thick: 0 } }
    }
  }
  return best
}

export const polyArea = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a) / 2 }
export const centroid = (l: Pt[]): Pt => { let x = 0, y = 0, a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c } if (Math.abs(a) < 1e-9) return l[0]; return [x / (3 * a), y / (3 * a)] }

/** Tìm không gian kín quanh điểm bấm: tô đặc tường + cửa lên ảnh 5 cm/pixel, loang từ điểm bấm, lấy đường bao. Trả null nếu hở. */
export function floodRoom(M: Model, p: Pt, closeDoors = true): { poly: Pt[]; leaked: boolean; area?: number } | null {
  const S = 20, pad = 1, x0 = -pad, y0 = -pad, W = Math.ceil((M.w + 2 * pad) * S), H = Math.ceil((M.h + 2 * pad) * S)
  if (W * H > 60e6) return null
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000'; g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S)
  for (const w of M.walls) { const path = new Path2D(footprint(w).map(r => 'M' + r.map(q => q[0] + ' ' + q[1]).join('L') + 'Z').join('')); g.fill(path, 'evenodd') }
  if (closeDoors) for (const d of M.doors) { const r = doorRect({ ...d }, 0.12); g.beginPath(); r.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fill() }
  const img = g.getImageData(0, 0, W, H).data, mask = new Uint8Array(W * H), sx = Math.round((p[0] - x0) * S), sy = Math.round((p[1] - y0) * S)
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || img[(sy * W + sx) * 4] < 128) return null
  const st = [sy * W + sx]; mask[st[0]] = 1; let leaked = false
  while (st.length) { const i = st.pop()!, x = i % W, y = (i / W) | 0
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { leaked = true; continue }
    for (const j of [i - 1, i + 1, i - W, i + W]) if (!mask[j] && img[j * 4] >= 128) { mask[j] = 1; st.push(j) } }
  if (leaked) return { poly: [], leaked: true }
  // đường bao ngoài: đi dọc cạnh pixel (vùng luôn nằm bên phải hướng đi)
  let sx0 = -1, sy0 = -1, count = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) { count++; if (sx0 < 0) { sx0 = i % W; sy0 = (i / W) | 0 } }
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]
  let vx = sx0, vy = sy0, d = 0, ring: Pt[] = [], guard = 0
  do {
    vx += DX[d]; vy += DY[d]
    const ar = d === 0 ? on(vx, vy) : d === 1 ? on(vx - 1, vy) : d === 2 ? on(vx - 1, vy - 1) : on(vx, vy - 1)
    const al = d === 0 ? on(vx, vy - 1) : d === 1 ? on(vx, vy) : d === 2 ? on(vx - 1, vy) : on(vx - 1, vy - 1)
    const nd = al ? (d + 3) % 4 : ar ? d : (d + 1) % 4
    if (nd !== d) ring.push([vx, vy]); d = nd
  } while ((vx !== sx0 || vy !== sy0 || d !== 0) && ++guard < W * H * 4)
  ring = simplify(ring, 1.2).map(q => [q[0] / S + x0, q[1] / S + y0] as Pt)
  return { poly: ring, leaked: false, area: count / (S * S) }
}
function simplify(pts: Pt[], eps: number): Pt[] { // Ramer–Douglas–Peucker
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const rec = (i: number, j: number) => { let md = 0, mi = -1; const a = pts[i], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    for (let k = i + 1; k < j; k++) { const d = Math.abs((pts[k][0] - a[0]) * dy - (pts[k][1] - a[1]) * dx) / L; if (d > md) { md = d; mi = k } }
    if (md > eps && mi > 0) { keep[mi] = 1; rec(i, mi); rec(mi, j) } }
  rec(0, pts.length - 1); return pts.filter((_, i) => keep[i])
}

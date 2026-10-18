// Mô hình mặt bằng SỬA ĐƯỢC (đơn vị mét, trục y hướng xuống như bản vẽ). Nhập từ DXF rồi sửa tường · cột · cửa; dựng 3D từ chính mô hình này.
import polygonClipping from 'polygon-clipping'
import type { VecPage } from '../vector'
import { PT_MM } from '../dims'

export type Pt = [number, number]
export type WallKind = { key: string; label: string; color: string; glass?: boolean }
/** Loại kết cấu (sẽ nối với vật liệu trong danh mục ở bước sau) */
export const WALL_KINDS: WallKind[] = [
  { key: 'brick', label: 'Tường gạch xây', color: '#e4d9c3' },
  { key: 'concrete', label: 'Bê tông cốt thép', color: '#9a9a9a' },
  { key: 'gypsum', label: 'Vách thạch cao', color: '#efece4' },
  { key: 'glass', label: 'Vách kính', color: '#9cc9d6', glass: true },
  { key: 'wood', label: 'Vách gỗ', color: '#b58b5a' },
  { key: 'stone', label: 'Ốp đá', color: '#7d7468' },
]
export const kindOf = (k: string) => WALL_KINDS.find(x => x.key === k) ?? WALL_KINDS[0]

export type Wall = { id: string; role: 'wall' | 'col'; kind: string; h?: number; name?: string; shape: { type: 'poly'; rings: Pt[][] } | { type: 'seg'; a: Pt; b: Pt; t: number } }
export type DoorKind = 'door' | 'double' | 'window' | 'slide' | 'opening'
export const DOOR_KINDS: { key: DoorKind; label: string; w: number; h: number; sill: number }[] = [
  { key: 'door', label: 'Cửa đi một cánh', w: 0.9, h: 2.1, sill: 0 },
  { key: 'double', label: 'Cửa đi hai cánh', w: 1.6, h: 2.1, sill: 0 },
  { key: 'slide', label: 'Cửa trượt / kính', w: 1.8, h: 2.2, sill: 0 },
  { key: 'window', label: 'Cửa sổ', w: 1.5, h: 1.4, sill: 0.9 },
  { key: 'opening', label: 'Ô trống (không cánh)', w: 1.2, h: 2.4, sill: 0 },
]
/** x,y = tâm cửa trên tường; ang = hướng dọc tường (rad); flip = đảo phía mở */
export type Door = { id: string; kind: DoorKind; x: number; y: number; ang: number; w: number; h: number; sill: number; flip?: boolean; name?: string }
export type Model = { v: 1; walls: Wall[]; doors: Door[]; hWall: number; hCol: number; mPt: number; w: number; h: number }

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
  return { v: 1, walls, doors: [], hWall: 3.3, hCol: 3.3, mPt: m, w: v.w * m, h: v.h * m }
}

export const wallH = (w: Wall, M: Model) => w.h ?? (w.role === 'col' ? M.hCol : M.hWall)
/** Hình chiếu bằng của tường (polygon-clipping: [vòng ngoài, ...lỗ]) */
export function footprint(w: Wall): Pt[][] {
  if (w.shape.type === 'poly') return w.shape.rings
  const { a, b, t } = w.shape, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * t / 2, ny = ux * t / 2, e = t / 2
  const a2: Pt = [a[0] - ux * e, a[1] - uy * e], b2: Pt = [b[0] + ux * e, b[1] + uy * e]
  return [[[a2[0] + nx, a2[1] + ny], [b2[0] + nx, b2[1] + ny], [b2[0] - nx, b2[1] - ny], [a2[0] - nx, a2[1] - ny]]]
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
    const rings: Pt[][] = w.shape.type === 'poly' ? w.shape.rings : [[w.shape.a, w.shape.b]]
    for (const r of rings) for (let i = 0; i < (w.shape.type === 'seg' ? 1 : r.length); i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(p[0] - x, p[1] - y)
      if (d < bd && Math.hypot(dx, dy) > 0.25) { bd = d; best = { x, y, ang: Math.atan2(dy, dx), thick: 0 } }
    }
  }
  return best
}

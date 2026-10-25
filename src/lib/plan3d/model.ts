// Mô hình mặt bằng SỬA ĐƯỢC (đơn vị mét, trục y hướng xuống như bản vẽ). Nhập từ DXF rồi sửa tường · cột · cửa; dựng 3D từ chính mô hình này.
import polygonClipping from 'polygon-clipping'
import type { VecPage } from '../vector'
import { classifyFurn, furnTypeOf } from './furn'
import { detectVertical, detectThinPartitions } from './vertical'
import { PT_MM } from '../dims'
import { FURN_LAYER } from '../dxf'

export type Pt = [number, number]
import { WALL_TYPES, wallTypeOf } from './library'
import type { Sec } from './section'
export const WALL_KINDS = WALL_TYPES
export const kindOf = wallTypeOf

export type Wall = { id: string; role: 'wall' | 'col'; kind: string; finish?: string; h?: number; name?: string; /** vách kính: khoảng chia tấm kính (m) */ panel?: number; auto?: boolean; shape: { type: 'poly'; rings: Pt[][] } | { type: 'seg'; a: Pt; b: Pt; t: number; bulge?: number; /** đỉnh gấp khúc giữa a và b (tường chữ L, U… là MỘT đối tượng) */ via?: Pt[] } }
export type DoorKind = 'door' | 'double' | 'window' | 'slide' | 'opening'
export const DOOR_KINDS: { key: DoorKind; label: string; w: number; h: number; sill: number }[] = [
  { key: 'door', label: 'Cửa đi một cánh', w: 0.9, h: 2.1, sill: 0 },
  { key: 'double', label: 'Cửa đi hai cánh', w: 1.6, h: 2.1, sill: 0 },
  { key: 'slide', label: 'Cửa trượt / kính', w: 1.8, h: 2.2, sill: 0 },
  { key: 'window', label: 'Cửa sổ', w: 1.5, h: 1.4, sill: 0.9 },
  { key: 'opening', label: 'Ô trống (không cánh)', w: 1.2, h: 2.4, sill: 0 },
]
/** x,y = tâm cửa trên tường; ang = hướng dọc tường (rad); flip = đảo phía mở */
export type Door = { id: string; kind: DoorKind; lib?: string; finish?: string; frameFinish?: string; x: number; y: number; ang: number; w: number; h: number; sill: number; flip?: boolean; /** bản lề đổi sang bên kia (đảo trái/phải dọc theo tường) */ mir?: boolean; name?: string; /** nhận tự động từ bản vẽ */ auto?: boolean; /** bề dày tường tại cửa (để dựng lanh-tô trên đầu cửa) */ t?: number }
export type Dim = { id: string; a: Pt; b: Pt; off: number; /** chữ ghi đè (thay cho số đo) */ txt?: string }
export type Room = { id: string; name: string; en?: string; poly: Pt[]; area?: number; floor?: string; ceil?: string; /** cốt trần (m, tính từ cốt ±0.00) */ ceilH?: number; /** cốt sàn hoàn thiện (m, so với ±0.00); mặc định 0 */ z?: number }
/** Trục cột: dir 'v' = đường thẳng đứng x = pos; 'h' = đường nằm ngang y = pos */
export type Axis = { id: string; dir: 'v' | 'h'; pos: number; name: string; auto?: boolean; /** khoảng cách riêng của bong bóng tới mép bản vẽ (m) – bỏ trống = theo cả dãy */ off?: number }
/** Đồ nội thất rời: x,y = tâm (m); w theo trục dọc (sau khi xoay ang), d theo trục ngang; h = chiều cao thật theo loại; flip = đảo phía lưng tựa */
export type Furn = { id: string; kind: string; name?: string; x: number; y: number; w: number; d: number; ang: number; h: number; finish?: string; flip?: boolean; auto?: boolean; /** cao độ đáy (m) so với sàn – tủ trên, gương… */ z?: number }
/** chữ trong bản vẽ (tên phòng…) để tự đặt tên phòng */
export type Label = { t: string; x: number; y: number; h: number; pri?: boolean }
export type Model = { v: 1; /** các đường cắt mặt cắt vẽ trên mặt bằng */ sections?: Sec[]; walls: Wall[]; doors: Door[]; furn?: Furn[]; labels?: Label[]; dims?: Dim[]; rooms?: Room[]; axes?: Axis[]; /** khoảng cách bong bóng trục tới mép bản vẽ (m) theo dãy: v = trục dọc (phía trên), h = trục ngang (bên trái) */ axOff?: { v?: number; h?: number }; /** tâm các sàn tự tạo mà người dùng đã xoá – không tự tạo lại */ noAuto?: Pt[]; /** khoảng cách hàng kích thước giữa các trục tới mép bản vẽ (m) */ dimOff?: { v?: number; h?: number }; /** tên trục: true = tự gõ tay (không tự đánh theo thứ tự) */ axMan?: { v?: boolean; h?: boolean }; /** tên trục đầu dãy khi tự đánh (mặc định 1 / A) */ axStart?: { v?: string; h?: string }; /** tự đánh ngược chiều (phải→trái / dưới→trên) */ axRev?: { v?: boolean; h?: boolean }; hWall: number; hCol: number; mPt: number; w: number; h: number }

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
  const m = (PT_MM * den) / 1000, walls: Wall[] = [], hatchFurn: (Obb & { layer: string })[] = []
  for (const r of v.draw ?? []) {
    if (!r.hp) continue
    const loops = loopsOf(r.d, m).filter(l => Math.abs(area(l)) > 1e-4)
    const depth = loops.map((l, i) => loops.reduce((n, o, j) => n + (j !== i && Math.abs(area(o)) > Math.abs(area(l)) && inside(l[0], o) ? 1 : 0), 0))
    const ly = (v.classes[r.cls]?.layer ?? '').replace(/^.*\$/, '')
    const wallish = /tuong|wall|cot|column|be.?tong|concrete|vach|struct/i.test(ly)
    loops.forEach((l, i) => {
      if (depth[i] % 2) return
      const holes = loops.filter((h, j) => depth[j] === depth[i] + 1 && inside(h[0], l))
      const role = r.rl === 'col' ? 'col' : 'wall'
      if (role === 'wall') { // hatch nội thất / thiết bị (ghế, sofa, bàn, bồn cầu…) KHÔNG phải tường: chuyển thành đồ rời, không đùn cao bằng tường
        const o = obb(l), thin = Math.min(o.w, o.d) < 0.32
        if (l.length <= 4 && Math.abs(area(l)) / Math.max(1e-6, o.w * o.d) < 0.7) return   // tam giác chéo: ký hiệu, bỏ
        if (FURN_LAYER.test(ly) || (!wallish && !thin && Math.max(o.w, o.d) <= 3.5)) { hatchFurn.push({ ...o, layer: ly }); return }
      }
      if (role === 'wall') { // mảng tô đặc chéo / tam giác (ký hiệu thang, hatch trang trí) không phải tường: tường luôn mảnh (kể cả chữ L/U, vòng kín có lỗ)
        const o = obb(l), perim = (q: Pt[]) => q.reduce((n, a, k) => n + Math.hypot(q[(k + 1) % q.length][0] - a[0], q[(k + 1) % q.length][1] - a[1]), 0)
        const A = Math.abs(area(l)), Ah = holes.reduce((n, h) => n + Math.abs(area(h)), 0), Ae = A - Ah, P = perim(l) + holes.reduce((n, h) => n + perim(h), 0)
        if ((2 * Ae) / Math.max(P, 1e-6) > 0.5 && A / Math.max(1e-6, o.w * o.d) < 0.7 && Ae > 1) return
      }
      walls.push({ id: uid('w'), role, kind: role === 'col' ? 'concrete' : 'brick', shape: { type: 'poly', rings: [l, ...holes] } })
    })
  }
  const glass = detectGlass(v, m); walls.push(...glass)
  const doors = detectDoors(v.arcs ?? [], m, walls)
  for (let i = 0; i < doors.length; i++) doors[i] = centerDoor(walls, doors[i])
  const vert = detectVertical(v, m)
  // vách ngăn mỏng (WC…) vẽ bằng hai nét song song, không có hatch → thêm thành tường mỏng, cao 1.9 m
  { const rings = walls.filter(k => k.role !== 'col').map(k => ({ rs: footprint(k), bb: bbox(footprint(k)) }))
    const covered = (x: number, y: number) => rings.some(k => x >= k.bb.x0 - 0.02 && x <= k.bb.x1 + 0.02 && y >= k.bb.y0 - 0.02 && y <= k.bb.y1 + 0.02 && k.rs.reduce((n, r) => n + (inside([x, y], r) ? 1 : 0), 0) % 2 === 1)
    const inVert = (x: number, y: number) => vert.some(t => Math.abs(x - t.x) < t.w / 2 + 0.4 && Math.abs(y - t.y) < t.d / 2 + 0.4)
    for (const p of detectThinPartitions(v, m, (x, y) => covered(x, y) || inVert(x, y))) walls.push({ id: uid('w'), role: 'wall', kind: 'partition', h: 1.9, auto: true, shape: { type: 'seg', a: p.a, b: p.b, t: Math.max(0.03, p.t) } }) }
  // cửa nằm trong vách kính → dùng cửa kính (khung nhôm / không khung) thay cho cửa gỗ
  for (const dr of doors) { const gl = glass.some(g => { const cl = centerline(g); for (let i = 0; i + 1 < cl.length; i++) { const a = cl[i], b = cl[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((dr.x - a[0]) * dx + (dr.y - a[1]) * dy) / L2)); if (Math.hypot(dr.x - (a[0] + t * dx), dr.y - (a[1] + t * dy)) < 0.25) return true } return false })
    if (gl) { dr.lib = dr.kind === 'double' ? (dr.w < 1.5 ? 'dg-glass12' : 'dg-glass18') : 'dg-glass09'; dr.h = 2.2 } }
  const furn: Furn[] = (v.furn ?? []).map(f => {
    const w = f.w * m, d = f.d * m, nm = f.name.replace(/^.*\$/, '').trim(), name = !nm || /^\*/.test(nm) ? undefined : nm.slice(0, 48)
    const kind = classifyFurn(name ?? '', f.layer, w, d)
    return { id: uid('f'), kind, name, x: f.cx * m, y: f.cy * m, w, d, ang: f.rot, h: furnTypeOf(kind).h, auto: true }
  })
  // thang máy / thang bộ / thang xoắn nhận từ nét vẽ (thay cho khối hatch nội thất nhận nhầm tại chỗ đó)
  for (let i = furn.length - 1; i >= 0; i--) { const f = furn[i]; if (vert.some(t => Math.abs(f.x - t.x) < t.w / 2 + 0.3 && Math.abs(f.y - t.y) < t.d / 2 + 0.3 && ['group', 'generic', 'table', 'cabinet', 'side', 'stage'].includes(f.kind))) furn.splice(i, 1) }
  for (const t of vert) { for (let i = furn.length - 1; i >= 0; i--) { const f = furn[i]; if (Math.abs(f.x - t.x) < t.w / 2 && Math.abs(f.y - t.y) < t.d / 2 && Math.max(f.w, f.d) < Math.max(t.w, t.d) * 1.1) furn.splice(i, 1) } if (!furn.some(f => (f.kind === t.kind) && Math.hypot(f.x - t.x, f.y - t.y) < 0.8)) furn.push(t) }
  // đồ rời từ hatch: bỏ nếu đã có đồ rời cùng chỗ (từ khối/nét rời)
  const inRect = (f: Furn, x: number, y: number) => { const c = Math.cos(f.ang), s = Math.sin(f.ang), dx = x - f.x, dy = y - f.y; return Math.abs(dx * c + dy * s) <= f.w / 2 + 0.05 && Math.abs(-dx * s + dy * c) <= f.d / 2 + 0.05 }
  for (const o of hatchFurn) { if (furn.some(f => inRect(f, o.cx, o.cy))) continue
    const kind = classifyFurn('', o.layer, o.w, o.d); furn.push({ id: uid('f'), kind, x: o.cx, y: o.cy, w: o.w, d: o.d, ang: o.rot, h: furnTypeOf(kind).h, auto: true }) }
  for (let i = furn.length - 1; i >= 0; i--) { const a = furn[i]; if (furn.some((b, j) => j < i && Math.hypot(a.x - b.x, a.y - b.y) < 0.08 && Math.abs(Math.max(a.w, a.d) - Math.max(b.w, b.d)) < 0.1 && Math.abs(Math.min(a.w, a.d) - Math.min(b.w, b.d)) < 0.1)) furn.splice(i, 1) } // bỏ món trùng hệt
  const labels: Label[] = (v.texts ?? []).slice(0, 600).map(t => ({ t: t.t.replace(/\s+/g, ' ').trim(), x: t.x * m, y: t.y * m, h: t.h * m, pri: /ten.?phong|room|space|name/i.test(t.ly ?? '') })).filter(t => t.t && t.t.length <= 60)
  return { v: 1, walls, doors, furn, labels, dims: [], rooms: [], hWall: 3.3, hCol: 3.3, mPt: m, w: v.w * m, h: v.h * m }
}

// ---------- Hình học phụ ----------
type Obb = { cx: number; cy: number; w: number; d: number; rot: number }
/** hộp bao nhỏ nhất theo hướng cạnh (xoay được): w theo hướng rot, d vuông góc */
export function obb(l: Pt[]): Obb {
  const n = l.length, angs = new Set<number>(); const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.hypot(l[(b + 1) % n][0] - l[b][0], l[(b + 1) % n][1] - l[b][1]) - Math.hypot(l[(a + 1) % n][0] - l[a][0], l[(a + 1) % n][1] - l[a][1])).slice(0, 12)
  for (const i of idx) { const j = (i + 1) % n; let a = Math.atan2(l[j][1] - l[i][1], l[j][0] - l[i][0]); a = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); angs.add(Math.round(a * 1e4) / 1e4) }
  let best: Obb | null = null, ba = 1e18
  for (const a of angs.size ? angs : new Set([0])) { const c = Math.cos(a), s = Math.sin(a); let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18
    for (const p of l) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v) }
    const ar = (x1 - x0) * (y1 - y0); if (ar < ba) { ba = ar; const mu = (x0 + x1) / 2, mv = (y0 + y1) / 2; best = { cx: mu * c - mv * s, cy: mu * s + mv * c, w: x1 - x0, d: y1 - y0, rot: a } } }
  return best!
}
/** Đo tường tại vị trí cửa (vuông góc với tường): bề dày th và độ lệch off của TIM tường so với điểm (x,y) theo pháp tuyến (-sin,cos) */
export function wallAt(walls: Wall[], x: number, y: number, ang: number, w: number): { th: number; off: number } | null {
  const rings = walls.filter(k => k.role !== 'col').map(k => ({ rs: footprint(k), bb: bbox(footprint(k)) }))
  const hit = (px: number, py: number) => rings.some(k => px >= k.bb.x0 && px <= k.bb.x1 && py >= k.bb.y0 && py <= k.bb.y1 && (k.rs.reduce((n, r) => n + (inside([px, py], r) ? 1 : 0), 0) % 2 === 1))
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, out: { th: number; off: number }[] = []
  for (const sgn of [-1, 1]) for (const gap of [0.05, 0.1, 0.18]) { const cx = x + ux * sgn * (w / 2 + gap), cy = y + uy * sgn * (w / 2 + gap); let a = 0, b = 0
    // đứng từ tâm cột bề dày: tìm đoạn liên tục chứa điểm sát mép lỗ cửa (có thể lệch tim, nên dò rộng ±0.5)
    const start = hit(cx, cy) ? 0 : (() => { for (let t = 0.01; t <= 0.5; t += 0.01) { if (hit(cx + nx * t, cy + ny * t)) return t; if (hit(cx - nx * t, cy - ny * t)) return -t } return NaN })()
    if (Number.isNaN(start)) continue
    for (let t = 0; t <= 0.8; t += 0.01) { if (!hit(cx + nx * (start + t), cy + ny * (start + t))) break; a = t }
    for (let t = 0; t <= 0.8; t += 0.01) { if (!hit(cx + nx * (start - t), cy + ny * (start - t))) break; b = t }
    const th = a + b; if (th >= 0.06 && th <= 0.7) out.push({ th, off: start + (a - b) / 2 }) }
  if (!out.length) return null
  out.sort((p, q) => p.th - q.th); const m = out[Math.floor(out.length / 2)]; return { th: Math.round(m.th * 100) / 100, off: m.off }
}
/** Bề dày tường tại cửa: đo bề dày khối tường ngay sát hai mép lỗ cửa (đo vuông góc với tường) */
export function wallThickAt(walls: Wall[], x: number, y: number, ang: number, w: number): number { return wallAt(walls, x, y, ang, w)?.th ?? 0.2 }
/** Đưa cửa vào đúng TIM tường và khớp bề dày khung = bề dày tường */
export function centerDoor<T extends { x: number; y: number; ang: number; w: number }>(walls: Wall[], d: T): T & { t: number } {
  const r = wallAt(walls, d.x, d.y, d.ang, d.w); if (!r) return { ...d, t: 0.2 }
  return { ...d, x: d.x - Math.sin(d.ang) * r.off, y: d.y + Math.cos(d.ang) * r.off, t: r.th }
}

// ---------- Nhận diện cửa từ cung quét cánh ----------
type EdgeQ = (p: Pt, r: number) => { d: number; ang: number } | null
function edgeIndex(walls: Wall[]): EdgeQ {
  const cell = 0.5, grid = new Map<string, number[]>(), E: number[] = []
  const put = (a: Pt, b: Pt) => { const i = E.length / 4; E.push(a[0], a[1], b[0], b[1]); const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell), y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i) } }
  for (const w of walls) { if (w.role === 'col') continue; for (const r of footprint(w)) for (let i = 0; i < r.length; i++) put(r[i], r[(i + 1) % r.length]) }
  return (p, rad) => {
    let best: { d: number; ang: number } | null = null; const n = Math.ceil(rad / cell), cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), seen = new Set<number>()
    for (let x = cx - n; x <= cx + n; x++) for (let y = cy - n; y <= cy + n; y++) for (const i of grid.get(x + ',' + y) ?? []) {
      if (seen.has(i)) continue; seen.add(i)
      const ax = E[i * 4], ay = E[i * 4 + 1], bx = E[i * 4 + 2], by = E[i * 4 + 3], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L2)), d = Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)
      if (d <= rad && (!best || d < best.d)) best = { d, ang: Math.atan2(dy, dx) }
    }
    return best
  }
}
/** Mỗi cung ~90° trên layer cửa = một cánh cửa: bản lề = tâm cung, đầu cánh đóng nằm dọc tường. Hai cánh đối xứng chạm nhau ở giữa = cửa hai cánh. */
export function detectDoors(arcs: VecPage['arcs'], m: number, walls: Wall[]): Door[] {
  if (!arcs.length || !walls.length) return []
  const near = edgeIndex(walls), cands: { H: Pt; C: Pt; O: Pt; R: number }[] = []
  for (const a of arcs) {
    const A: Pt = [a.a[0] * m, a.a[1] * m], B: Pt = [a.b[0] * m, a.b[1] * m], Mi: Pt = [a.m[0] * m, a.m[1] * m]
    const dd = 2 * (A[0] * (B[1] - Mi[1]) + B[0] * (Mi[1] - A[1]) + Mi[0] * (A[1] - B[1])); if (Math.abs(dd) < 1e-9) continue
    const sq = (p: Pt) => p[0] * p[0] + p[1] * p[1]
    const H: Pt = [(sq(A) * (B[1] - Mi[1]) + sq(B) * (Mi[1] - A[1]) + sq(Mi) * (A[1] - B[1])) / dd, (sq(A) * (Mi[0] - B[0]) + sq(B) * (A[0] - Mi[0]) + sq(Mi) * (B[0] - A[0])) / dd]
    const R = Math.hypot(A[0] - H[0], A[1] - H[1]); if (R < 0.45 || R > 1.5) continue
    const cos = ((A[0] - H[0]) * (B[0] - H[0]) + (A[1] - H[1]) * (B[1] - H[1])) / (R * R); if (Math.abs(cos) > 0.4) continue // không phải cung ~90°
    const score = (X: Pt) => { const q = near(X, 0.4); if (!q) return null; const hx = X[0] - H[0], hy = X[1] - H[1], c = Math.abs(Math.cos(Math.atan2(hy, hx) - q.ang)); return q.d + 0.5 * (1 - c) }
    const sA = score(A), sB = score(B); if (sA === null && sB === null) continue
    const useA = sB === null || (sA !== null && sA <= sB), C = useA ? A : B, O = useA ? B : A
    if (cands.some(o => Math.hypot(o.H[0] - H[0], o.H[1] - H[1]) < 0.08 && Math.hypot(o.C[0] - C[0], o.C[1] - C[1]) < 0.08)) continue
    cands.push({ H, C, O, R })
  }
  const used = new Set<number>(), out: Door[] = []
  const side = (H: Pt, C: Pt, O: Pt) => { const ux = C[0] - H[0], uy = C[1] - H[1]; return ((O[0] - H[0]) * -uy + (O[1] - H[1]) * ux) > 0 ? 1 : -1 }
  const mk = (kind: 'door' | 'double', H: Pt, C: Pt, O: Pt, w: number): Door => {
    const ang = Math.atan2(C[1] - H[1], C[0] - H[0]), lib = kind === 'double' ? (w < 1.4 ? 'dr-dbl12' : w < 1.7 ? 'dr-dbl16' : 'dr-dbl18') : (w < 0.85 ? 'dr-flush08' : 'dr-flush09')
    return { id: uid('d'), kind, lib, x: (H[0] + C[0]) / 2, y: (H[1] + C[1]) / 2, ang, w: Math.round(w * 100) / 100, h: 2.1, sill: 0, flip: side(H, C, O) < 0, auto: true, t: 0.2 }
  }
  for (let i = 0; i < cands.length; i++) {
    if (used.has(i)) continue
    const a = cands[i]; let pair = -1
    for (let j = i + 1; j < cands.length; j++) { if (used.has(j)) continue; const b = cands[j]
      // hai cánh: bản lề hai phía, đầu đóng gặp nhau ở giữa, cùng mở về một phía
      const dir = Math.hypot(b.H[0] - a.H[0], b.H[1] - a.H[1])
      if (Math.hypot(a.C[0] - b.C[0], a.C[1] - b.C[1]) < 0.3 && dir > (a.R + b.R) * 0.7 && dir < (a.R + b.R) * 1.3 && side(a.H, b.H, a.O) === side(a.H, b.H, b.O)) { pair = j; break } }
    if (pair >= 0) { const b = cands[pair]; used.add(i); used.add(pair); out.push(mk('double', a.H, b.H, a.O, Math.hypot(b.H[0] - a.H[0], b.H[1] - a.H[1]))) }
    else { used.add(i); out.push(mk('door', a.H, a.C, a.O, Math.hypot(a.C[0] - a.H[0], a.C[1] - a.H[1]))) }
  }
  return out
}

// ---------- Nhận diện vách kính từ nét trên layer kính ----------
export const GLASS_LAYER = /kinh|glass|glaz|curtain|storefront|mat.?dung/i
/** Nét song song gần nhau (≤ 0,4 m) trên layer kính = hai mặt của vách kính → đường tim + độ dày; nét đơn dài = vách kính mỏng. Gộp các đoạn thẳng hàng. */
export function detectGlass(v: VecPage, m: number): Wall[] {
  const seg: { a: Pt; b: Pt; L: number; ang: number }[] = []
  for (let i = 0; i < v.nSeg; i++) {
    const c = v.classes[v.cls[i]]; if (!c || c.fill || !GLASS_LAYER.test(c.layer)) continue
    const a: Pt = [v.segs[i * 4] * m, v.segs[i * 4 + 1] * m], b: Pt = [v.segs[i * 4 + 2] * m, v.segs[i * 4 + 3] * m], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.15) continue
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI
    seg.push({ a, b, L, ang })
  }
  if (!seg.length) return []
  seg.sort((p, q) => q.L - p.L)
  type Line = { ang: number; off: number; s0: number; s1: number; t: number }
  const lines: Line[] = [], used = new Uint8Array(seg.length)
  const proj = (p: Pt, ang: number) => ({ s: p[0] * Math.cos(ang) + p[1] * Math.sin(ang), o: -p[0] * Math.sin(ang) + p[1] * Math.cos(ang) })
  for (let i = 0; i < seg.length; i++) {
    if (used[i]) continue; used[i] = 1; const a = seg[i], pa = proj(a.a, a.ang), pb = proj(a.b, a.ang); const as0 = Math.min(pa.s, pb.s), as1 = Math.max(pa.s, pb.s)
    let best = -1, bd = 1e9, bs0 = 0, bs1 = 0, bo = 0
    for (let j = i + 1; j < seg.length; j++) {
      if (used[j]) continue; const b = seg[j]; let da = Math.abs(a.ang - b.ang); da = Math.min(da, Math.PI - da); if (da > 0.05) continue
      const qa = proj(b.a, a.ang), qb = proj(b.b, a.ang), o = (qa.o + qb.o) / 2, dist = Math.abs(o - pa.o); if (dist < 0.005 || dist > 0.4) continue
      const s0 = Math.max(as0, Math.min(qa.s, qb.s)), s1 = Math.min(as1, Math.max(qa.s, qb.s)); if (s1 - s0 < 0.4 * Math.min(a.L, b.L)) continue
      if (dist < bd) { bd = dist; best = j; bs0 = s0; bs1 = s1; bo = o }
    }
    if (best >= 0) { used[best] = 1; lines.push({ ang: a.ang, off: (pa.o + bo) / 2, s0: bs0, s1: bs1, t: bd }) }
    else lines.push({ ang: a.ang, off: pa.o, s0: as0, s1: as1, t: 0.02 })
  }
  // gộp các đoạn thẳng hàng cùng hướng / cùng đường
  lines.sort((p, q) => p.ang - q.ang || p.off - q.off || p.s0 - q.s0)
  const merged: Line[] = []
  for (const l of lines) { const o = merged[merged.length - 1]
    if (o && Math.abs(o.ang - l.ang) < 0.03 && Math.abs(o.off - l.off) < 0.05 && Math.abs(o.t - l.t) < 0.04 && l.s0 <= o.s1 + 0.06) o.s1 = Math.max(o.s1, l.s1); else merged.push({ ...l }) }
  return merged.filter(l => l.s1 - l.s0 >= 0.3).map(l => {
    const c = Math.cos(l.ang), s = Math.sin(l.ang), P = (t: number): Pt => [t * c - l.off * s, t * s + l.off * c]
    const thick = l.t >= 0.04
    return { id: uid('w'), role: 'wall' as const, kind: thick ? 'curtain' : 'glass', name: 'Vách kính', panel: 1.2, auto: true, shape: { type: 'seg' as const, a: P(l.s0), b: P(l.s1), t: Math.max(0.012, l.t) } }
  })
}

export const wallH = (w: Wall, M: Model) => w.h ?? (w.role === 'col' ? M.hCol : M.hWall)
/** Hình chiếu bằng của tường (polygon-clipping: [vòng ngoài, ...lỗ]) */
/** Đường tim của tường thêm tay: thẳng, hoặc cung (bulge = độ võng giữa dây cung, m; dương = võng về bên trái chiều a→b) */
export function centerline(w: Wall): Pt[] {
  if (w.shape.type !== 'seg') return []
  const { a, b, bulge, via } = w.shape
  if (via && via.length) return [a, ...via, b]
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
    const p = line[i]; let nx: number, ny: number, k = 1
    if (i === 0) { const d = dir(line[0], line[1]); nx = -d[1]; ny = d[0] }
    else if (i === line.length - 1) { const d = dir(line[i - 1], line[i]); nx = -d[1]; ny = d[0] }
    else { const d1 = dir(line[i - 1], line[i]), d2 = dir(line[i], line[i + 1]); let mx = -(d1[1] + d2[1]), my = d1[0] + d2[0]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml; k = 1 / Math.max(0.3, mx * -d1[1] + my * d1[0]); nx = mx; ny = my }
    L.push([p[0] + nx * e * k, p[1] + ny * e * k]); R.push([p[0] - nx * e * k, p[1] - ny * e * k])
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

/** Phần tường tự thêm cho cửa nằm ở chỗ hở (không có tường): lanh-tô trên đầu cửa (đến cao độ tường) và đoạn dưới bệ cửa sổ. Trả về tường gần nhất để lấy vật liệu. */
export function doorGapParts(d: Door, M: Model): { parts: Part[]; wall?: Wall } {
  const t = Math.max(d.t ?? 0.2, 0.08), rect = doorRect(d, t), bb = bbox([rect])
  let wall: Wall | undefined, bd = 1e9; const fps: Pt[][][] = []
  for (const w of M.walls) {
    if (w.role === 'col') continue
    const fp = footprint(w), b = bbox(fp), dx = Math.max(b.x0 - d.x, 0, d.x - b.x1), dy = Math.max(b.y0 - d.y, 0, d.y - b.y1), dist = Math.hypot(dx, dy)
    if (dist < bd) { bd = dist; wall = w }
    if (b.x1 >= bb.x0 && b.x0 <= bb.x1 && b.y1 >= bb.y0 && b.y0 <= bb.y1) fps.push(fp)
  }
  let gap: Pt[][][]; try { gap = (fps.length ? polygonClipping.difference([rect] as any, ...fps.map(f => f as any)) : [[rect]]) as unknown as Pt[][][] } catch { return { parts: [], wall } }
  const H = wall ? wallH(wall, M) : M.hWall, top = Math.min(H, d.sill + d.h), parts: Part[] = []
  for (const poly of gap) { if (polyArea(poly[0]) < 0.003) continue; if (top < H - 1e-3) parts.push({ poly, z0: top, z1: H }); if (d.sill > 1e-3) parts.push({ poly, z0: 0, z1: Math.min(d.sill, H) }) }
  return { parts, wall }
}

/** Gợi ý vị trí đặt cửa: điểm gần nhất trên cạnh tường (kèm hướng cạnh) */
export function snapToWall(M: Model, p: Pt, tol: number, w = 0.9): { x: number; y: number; ang: number; thick: number } | null {
  let best: { x: number; y: number; ang: number; thick: number } | null = null, bd = tol, ends: Pt[] = [], edge: [Pt, Pt] | null = null
  for (const wl of M.walls) {
    if (wl.role === 'col') continue
    const rings: Pt[][] = wl.shape.type === 'poly' ? wl.shape.rings : [centerline(wl)]
    for (const r of rings) for (let i = 0; i < (wl.shape.type === 'seg' ? r.length - 1 : r.length); i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(p[0] - x, p[1] - y)
      if (d < bd && Math.hypot(dx, dy) > 0.25) { bd = d; best = { x, y, ang: Math.atan2(dy, dx), thick: 0 }; edge = [a, b] }
    }
  }
  if (!best) return null
  // bắt dọc tường: mép khuông chạm đầu đoạn / tim cửa trùng giữa đoạn
  const e = edge as [Pt, Pt] | null
  if (e) { const [a, b] = e, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, s = (best.x - a[0]) * ux + (best.y - a[1]) * uy, k = 0.12
    const cand = [w / 2, L - w / 2, L / 2]; let bs = s, bb = k; for (const c of cand) if (Math.abs(s - c) < bb) { bb = Math.abs(s - c); bs = c }
    if (L >= w) { best = { ...best, x: a[0] + ux * bs, y: a[1] + uy * bs } }; void ends }
  const c = centerDoor(M.walls, { x: best.x, y: best.y, ang: best.ang, w })
  return { x: c.x, y: c.y, ang: best.ang, thick: c.t }
}

export const polyArea = (l: Pt[]) => { let a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1] } return Math.abs(a) / 2 }
export const centroid = (l: Pt[]): Pt => { let x = 0, y = 0, a = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c } if (Math.abs(a) < 1e-9) return l[0]; return [x / (3 * a), y / (3 * a)] }

type Raster = { img: Uint8ClampedArray; W: number; H: number; S: number; x0: number; y0: number }
/** Tô đặc tường + cửa lên ảnh 5 cm/pixel (đen = vật cản) */
function raster(M: Model, closeDoors: boolean): Raster | null {
  const S = 20, pad = 1, x0 = -pad, y0 = -pad, W = Math.ceil((M.w + 2 * pad) * S), H = Math.ceil((M.h + 2 * pad) * S)
  if (W * H > 60e6) return null
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000'; g.setTransform(S, 0, 0, S, -x0 * S, -y0 * S)
  for (const w of M.walls) { const path = new Path2D(footprint(w).map(r => 'M' + r.map(q => q[0] + ' ' + q[1]).join('L') + 'Z').join('')); g.fill(path, 'evenodd') }
  if (closeDoors) for (const d of M.doors) { const r = doorRect({ ...d }, 0.12); g.beginPath(); r.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fill() }
  return { img: g.getImageData(0, 0, W, H).data, W, H, S, x0, y0 }
}
/** Đường bao ngoài của một vùng pixel (đi dọc cạnh pixel, vùng luôn nằm bên phải hướng đi) → đa giác (m) */
function traceRing(R: Raster, on: (x: number, y: number) => boolean, sx0: number, sy0: number): Pt[] {
  const { W, H, S, x0, y0 } = R, DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]
  let vx = sx0, vy = sy0, d = 0, ring: Pt[] = [], guard = 0
  do {
    vx += DX[d]; vy += DY[d]
    const ar = d === 0 ? on(vx, vy) : d === 1 ? on(vx - 1, vy) : d === 2 ? on(vx - 1, vy - 1) : on(vx, vy - 1)
    const al = d === 0 ? on(vx, vy - 1) : d === 1 ? on(vx, vy) : d === 2 ? on(vx - 1, vy) : on(vx - 1, vy - 1)
    const nd = al ? (d + 3) % 4 : ar ? d : (d + 1) % 4
    if (nd !== d) ring.push([vx, vy]); d = nd
  } while ((vx !== sx0 || vy !== sy0 || d !== 0) && ++guard < W * H * 4)
  return simplify(ring, 1.2).map(q => [q[0] / S + x0, q[1] / S + y0] as Pt)
}
/** Tìm không gian kín quanh điểm bấm: loang từ điểm bấm trên ảnh tường, lấy đường bao. Trả leaked nếu hở. */
export function floodRoom(M: Model, p: Pt, closeDoors = true): { poly: Pt[]; leaked: boolean; area?: number } | null {
  const R = raster(M, closeDoors); if (!R) return null
  const { img, W, H, S, x0, y0 } = R, mask = new Uint8Array(W * H), sx = Math.round((p[0] - x0) * S), sy = Math.round((p[1] - y0) * S)
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || img[(sy * W + sx) * 4] < 128) return null
  const st = [sy * W + sx]; mask[st[0]] = 1; let leaked = false
  while (st.length) { const i = st.pop()!, x = i % W, y = (i / W) | 0
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { leaked = true; continue }
    for (const j of [i - 1, i + 1, i - W, i + W]) if (!mask[j] && img[j * 4] >= 128) { mask[j] = 1; st.push(j) } }
  if (leaked) return { poly: [], leaked: true }
  let sx0 = -1, sy0 = -1, count = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) { count++; if (sx0 < 0) { sx0 = i % W; sy0 = (i / W) | 0 } }
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1
  return { poly: traceRing(R, on, sx0, sy0), leaked: false, area: count / (S * S) }
}
const NOT_NAME = /^[\d\s.,:x×m²㎡-]+$|^(\+|-)?\d/
/** Nhận diện TẤT CẢ không gian kín (mọi vùng trống bị tường/cửa khép kín bao quanh) rồi tự đặt tên theo chữ trong bản vẽ. Bỏ qua vùng đã có phòng. */
export function autoRooms(M: Model, minArea = 1.5): { rooms: Room[]; skipped: number } | null {
  const R = raster(M, true); if (!R) return null
  const { img, W, H, S } = R, lab = new Int32Array(W * H), have = M.rooms ?? [], out: Room[] = []; let nid = 0, skipped = 0
  const free = (i: number) => img[i * 4] >= 128
  for (let s0 = 0; s0 < W * H; s0++) {
    if (lab[s0] || !free(s0)) continue
    const id = ++nid, st = [s0]; lab[s0] = id; let count = 0, border = false
    while (st.length) { const i = st.pop()!, x = i % W, y = (i / W) | 0; count++
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true
      if (x > 0 && !lab[i - 1] && free(i - 1)) { lab[i - 1] = id; st.push(i - 1) }
      if (x < W - 1 && !lab[i + 1] && free(i + 1)) { lab[i + 1] = id; st.push(i + 1) }
      if (y > 0 && !lab[i - W] && free(i - W)) { lab[i - W] = id; st.push(i - W) }
      if (y < H - 1 && !lab[i + W] && free(i + W)) { lab[i + W] = id; st.push(i + W) } }
    const area = count / (S * S); if (border || area < minArea) { if (!border) skipped++; continue }
    const poly = traceRing(R, (x, y) => x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === id, s0 % W, (s0 / W) | 0)
    if (poly.length < 3) continue
    const c = centroid(poly), pin = inside(c, poly) ? c : poly[0]
    if (have.some(r => inside(pin, r.poly))) { skipped++; continue }
    const names = (M.labels ?? []).filter(l => inside([l.x, l.y], poly) && !NOT_NAME.test(l.t) && /[A-Za-zÀ-ỹ]/.test(l.t)).sort((a, b) => Number(!!b.pri) - Number(!!a.pri) || b.h - a.h)
    out.push({ id: uid('r'), name: names[0]?.t ?? 'Phòng ' + (have.length + out.length + 1), en: names[1] && names[1].t !== names[0].t ? names[1].t : undefined, poly, area })
  }
  return { rooms: out, skipped }
}
function simplify(pts: Pt[], eps: number): Pt[] { // Ramer–Douglas–Peucker
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const rec = (i: number, j: number) => { let md = 0, mi = -1; const a = pts[i], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    for (let k = i + 1; k < j; k++) { const d = Math.abs((pts[k][0] - a[0]) * dy - (pts[k][1] - a[1]) * dx) / L; if (d > md) { md = d; mi = k } }
    if (md > eps && mi > 0) { keep[mi] = 1; rec(i, mi); rec(mi, j) } }
  rec(0, pts.length - 1); return pts.filter((_, i) => keep[i])
}

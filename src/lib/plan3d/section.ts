// Bộ dựng MẶT CẮT từ mô hình mặt bằng: cắt tường · sàn · trần theo một đường cắt, thấy tiếp các phần phía sau (lập mặt đứng).
// Thuần tính toán (không giao diện) – SectionView.tsx vẽ kết quả. Hệ toạ độ ra: x = khoảng cách dọc đường cắt a→b (m), z = cao độ (m, hướng lên).
import { footprint, wallParts, wallH, doorRect, type Model, type Pt, type Wall } from './model'
import { wallTypeOf, finishOf, type Layer } from './library'
import { furnRect } from './xform'
import { furnTypeOf } from './furn'

export type Sec = { id: string; name: string; a: Pt; b: Pt; /** đảo hướng nhìn sang phía bên kia đường cắt */ flip?: boolean; /** chỉ lấy các vật thể trong khoảng này phía sau mặt cắt (m); bỏ trống = hết */ depth?: number }
export type Hatch = Layer['hatch'] | 'none'
/** Vật liệu do danh mục (hoặc thư viện) cấp cho một vị trí: tên, màu, các lớp cấu tạo (nếu danh mục khai đủ) */
export type MatInfo = { name: string; color?: string; code?: string; layers?: string[]; full?: boolean; src: 'catalog' | 'lib' }
export type MatFor = (role: 'floor' | 'wall' | 'ceil', roomName?: string) => MatInfo | undefined

export type SecShape = {
  kind: 'cut' | 'slab' | 'beyond' | 'door' | 'furn' | 'cutfurn' | 'glass'
  x0: number; x1: number; z0: number; z1: number
  fill: string; hatch: Hatch; depth: number
  /** số thứ tự vật liệu trong chú thích (nếu có) */
  mat?: number
}
export type SecLegend = { n: number; name: string; color: string; hatch: Hatch; src: 'catalog' | 'lib'; code?: string; note?: string; at: [number, number] }
export type SecResult = { L: number; zMin: number; zMax: number; shapes: SecShape[]; legend: SecLegend[]; levels: { z: number; text: string }[]; rooms: { x0: number; x1: number; name: string; z: number; ceil: number }[]; empty: boolean }

const EPS = 1e-6
/** Các đoạn [s0,s1] mà đường a→b nằm TRONG vùng (quy tắc chẵn–lẻ qua mọi vòng, kể cả lỗ) */
export function lineIntervals(a: Pt, u: Pt, L: number, rings: Pt[][]): [number, number][] {
  const xs: number[] = []
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length]
    const dp = u[0] * (p[1] - a[1]) - u[1] * (p[0] - a[0]), dq = u[0] * (q[1] - a[1]) - u[1] * (q[0] - a[0])
    if ((dp >= 0) === (dq >= 0)) continue
    const t = dp / (dp - dq), x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t
    xs.push(u[0] * (x - a[0]) + u[1] * (y - a[1]))
  }
  xs.sort((m, n) => m - n)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < xs.length; i += 2) { const s0 = Math.max(0, xs[i]), s1 = Math.min(L, xs[i + 1]); if (s1 - s0 > EPS) out.push([s0, s1]) }
  return out
}
const inPoly = (p: Pt, l: Pt[]) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > p[1]) !== (l[j][1] > p[1]) && p[0] < (l[j][0] - l[i][0]) * (p[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c; return c }

const mix = (c: string, t: string, k: number) => {
  const h = (s: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [200, 200, 200] }
  const x = h(c), y = h(t); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')
}
const HATCH_COLOR: Record<string, string> = { plaster: '#efe9dc', brick: '#d9b8a0', concrete: '#bdbdbd', gypsum: '#ecebe6', glass: '#bfe3ec', wood: '#cfa876', air: '#f6f6f2', stone: '#c9c2b6', steel: '#9aa0a6', insul: '#f2dd8a', none: '#e8e8e8' }

export function buildSection(M: Model, sec: Sec, mat?: MatFor): SecResult {
  const dx = sec.b[0] - sec.a[0], dy = sec.b[1] - sec.a[1], L = Math.hypot(dx, dy)
  const shapes: SecShape[] = [], legend: SecLegend[] = []
  const res: SecResult = { L, zMin: -0.4, zMax: 3, shapes, legend, levels: [], rooms: [], empty: true }
  if (L < 0.2) return res
  const a = sec.a, u: Pt = [dx / L, dy / L]
  // hướng nhìn: mặc định nhìn về phía v=(uy,-ux) (nhìn "lên" trang khi a→b chạy sang phải); flip = phía ngược lại
  const sg = sec.flip ? -1 : 1, v: Pt = [u[1] * sg, -u[0] * sg]
  /** s thuận chiều a→b khi không flip; khi flip, đảo để bản vẽ vẫn đọc trái→phải đúng với hướng nhìn */
  const sx = (s: number) => (sec.flip ? L - s : s)
  const maxD = sec.depth && sec.depth > 0 ? sec.depth : 1e9
  const mid = (x0: number, x1: number): [number, number] => { const lo = Math.min(sx(x0), sx(x1)), hi = Math.max(sx(x0), sx(x1)); return [lo, hi] }
  const add = (s: Omit<SecShape, 'x0' | 'x1'> & { s0: number; s1: number }) => { const [x0, x1] = mid(s.s0, s.s1); const { s0, s1, ...r } = s; void s0; void s1; shapes.push({ ...r, x0, x1 }) }

  const roomAt = (s: number) => (M.rooms ?? []).find(r => inPoly([a[0] + u[0] * s, a[1] + u[1] * s], r.poly))
  const keyOf = (name: string, hatch: Hatch, color: string, src: 'catalog' | 'lib', at: [number, number], code?: string, note?: string) => {
    const f = legend.find(l => l.name === name && l.hatch === hatch && l.color === color)
    if (f) return f.n
    const n = legend.length + 1; legend.push({ n, name, hatch, color, src, code, note, at }); return n
  }

  let zTop = M.hWall
  // ── 1. tường bị cắt + tường/cửa/đồ phía sau
  const cutWalls: { w: Wall; ivs: [number, number, number, number][] }[] = []
  for (const w of M.walls) {
    const H = wallH(w, M)
    if (H > zTop) zTop = H
    const wt = wallTypeOf(w.kind)
    const parts = wallParts(w, M)
    const fp = footprint(w)
    let cutAny = false
    for (const p of parts) {
      for (const [s0, s1] of lineIntervals(a, u, L, p.poly)) {
        cutAny = true
        const narrow = s1 - s0 <= Math.max(wt.t * 2.4, 0.5) && wt.layers.length > 0
        const ex = narrow ? wt.layers : []
        if (!ex.length) {
          const f = finishOf(w.finish)
          const col = f?.color ?? wt.color
          const hatch: Hatch = wt.layers[0]?.hatch ?? 'concrete'
          const n = keyOf(wt.label.replace(/\s*\(.*$/, ''), hatch, col, 'lib', [(s0 + s1) / 2, (p.z0 + p.z1) / 2])
          add({ kind: 'cut', s0, s1, z0: p.z0, z1: p.z1, fill: col, hatch, depth: 0, mat: n })
          continue
        }
        // chia các lớp theo tỉ lệ bề dày thư viện trên bề rộng thật của lát cắt; hai mặt ngoài lấy vật liệu hoàn thiện từ danh mục
        const tot = ex.reduce((s, l) => s + l.t, 0) || 1, W = s1 - s0
        const rL = roomAt(Math.max(0, s0 - 0.25)), rR = roomAt(Math.min(L, s1 + 0.25))
        let x = s0
        ex.forEach((l, i) => {
          const xe = i === ex.length - 1 ? s1 : x + W * l.t / tot
          const side = i === 0 ? rL : i === ex.length - 1 && ex.length > 1 ? rR : undefined
          const cm = side && l.hatch !== 'concrete' && l.hatch !== 'glass' ? mat?.('wall', side.name) : undefined
          const name = cm ? cm.name : l.name, col = cm?.color ?? HATCH_COLOR[l.hatch]
          const n = keyOf(name, cm ? 'none' : l.hatch, col, cm ? 'catalog' : 'lib', [(x + xe) / 2, (p.z0 + p.z1) / 2], cm?.code, cm ? (cm.full ? cm.layers?.join(' + ') : 'danh mục chưa khai đủ cấu tạo lớp') : undefined)
          add({ kind: 'cut', s0: x, s1: xe, z0: p.z0, z1: p.z1, fill: col, hatch: cm ? 'none' : l.hatch, depth: 0, mat: n })
          x = xe
        })
      }
    }
    if (cutAny) { cutWalls.push({ w, ivs: [] }); continue }
    // tường phía sau mặt cắt
    for (const p of parts) {
      const o = p.poly[0]; if (!o || !o.length) continue
      let sMin = 1e9, sMax = -1e9, dMin = 1e9, dMax = -1e9
      for (const q of o) { const s = u[0] * (q[0] - a[0]) + u[1] * (q[1] - a[1]), d = v[0] * (q[0] - a[0]) + v[1] * (q[1] - a[1]); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); dMin = Math.min(dMin, d); dMax = Math.max(dMax, d) }
      if (dMin < -EPS && dMax > EPS) continue            // cắt qua mà không có đoạn nào nằm trong → bỏ
      if (dMax <= EPS || dMin > maxD) continue            // nằm phía trước (sau lưng người nhìn) hoặc quá xa
      const s0 = Math.max(0, sMin), s1 = Math.min(L, sMax); if (s1 - s0 < 0.01) continue
      const f = finishOf(w.finish), col = f?.color ?? wt.color
      add({ kind: wt.glass ? 'glass' : 'beyond', s0, s1, z0: p.z0, z1: p.z1, fill: col, hatch: 'none', depth: dMin })
    }
    void fp
  }
  // cửa: nếu đường cắt đi qua ô cửa → vẽ cánh/kính mỏng trong lỗ; nếu ở phía sau → vẽ lên tường
  for (const d of M.doors) {
    const r = doorRect(d, Math.max(d.t ?? 0.2, 0.08))
    const z0 = d.sill, z1 = d.sill + d.h
    const iv = lineIntervals(a, u, L, [r])
    const col = d.kind === 'window' || d.kind === 'slide' ? '#bfe3ec' : (finishOf(d.finish)?.color ?? '#a8865f')
    if (iv.length) { for (const [s0, s1] of iv) add({ kind: 'door', s0, s1, z0, z1, fill: col, hatch: d.kind === 'window' || d.kind === 'slide' ? 'glass' : 'wood', depth: 0 }); continue }
    let sMin = 1e9, sMax = -1e9, dMin = 1e9, dMax = -1e9
    for (const q of r) { const s = u[0] * (q[0] - a[0]) + u[1] * (q[1] - a[1]), dd = v[0] * (q[0] - a[0]) + v[1] * (q[1] - a[1]); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); dMin = Math.min(dMin, dd); dMax = Math.max(dMax, dd) }
    if (dMax <= EPS || dMin > maxD) continue
    const s0 = Math.max(0, sMin), s1 = Math.min(L, sMax); if (s1 - s0 < 0.01) continue
    add({ kind: 'door', s0, s1, z0, z1, fill: col, hatch: 'none', depth: dMin - 0.001 })
  }
  // nội thất
  for (const f of M.furn ?? []) {
    const r = furnRect(f), ft = furnTypeOf(f.kind), col = finishOf(f.finish)?.color ?? ft.color
    const z0 = f.z ?? ft.z ?? 0, z1 = z0 + f.h
    const iv = lineIntervals(a, u, L, [r])
    if (iv.length) { for (const [s0, s1] of iv) add({ kind: 'cutfurn', s0, s1, z0, z1, fill: col, hatch: 'none', depth: 0 }); continue }
    let sMin = 1e9, sMax = -1e9, dMin = 1e9, dMax = -1e9
    for (const q of r) { const s = u[0] * (q[0] - a[0]) + u[1] * (q[1] - a[1]), dd = v[0] * (q[0] - a[0]) + v[1] * (q[1] - a[1]); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); dMin = Math.min(dMin, dd); dMax = Math.max(dMax, dd) }
    if (dMax <= EPS || dMin > maxD) continue
    const s0 = Math.max(0, sMin), s1 = Math.min(L, sMax); if (s1 - s0 < 0.01) continue
    add({ kind: 'furn', s0, s1, z0, z1, fill: col, hatch: 'none', depth: dMin })
  }
  // ── 2. sàn · trần theo từng phòng bị cắt
  let zLo = 0
  const covered: [number, number][] = []
  for (const r of M.rooms ?? []) {
    const ivs = lineIntervals(a, u, L, [r.poly]); if (!ivs.length) continue
    const zf = r.z ?? 0, zc = r.ceilH ?? M.hWall
    if (zc > zTop) zTop = zc
    for (const [s0, s1] of ivs) {
      covered.push([s0, s1])
      const fm = mat?.('floor', r.name), fcol = fm?.color ?? finishOf(r.floor)?.color ?? '#d6c7ad'
      const fn = keyOf(fm?.name ?? finishOf(r.floor)?.name ?? 'Lớp hoàn thiện sàn', 'none', fcol, fm ? 'catalog' : 'lib', [(s0 + s1) / 2, zf - 0.015], fm?.code, fm ? (fm.full ? fm.layers?.join(' + ') : 'danh mục chưa khai đủ cấu tạo lớp') : undefined)
      add({ kind: 'slab', s0, s1, z0: zf - 0.03, z1: zf, fill: fcol, hatch: 'none', depth: 0, mat: fn })
      const cm = mat?.('ceil', r.name), ccol = cm?.color ?? finishOf(r.ceil)?.color ?? '#f1efe9'
      const cn = keyOf(cm?.name ?? finishOf(r.ceil)?.name ?? 'Trần thạch cao', cm ? 'none' : 'gypsum', ccol, cm ? 'catalog' : 'lib', [(s0 + s1) / 2, zc + 0.02], cm?.code, cm ? (cm.full ? cm.layers?.join(' + ') : 'danh mục chưa khai đủ cấu tạo lớp') : undefined)
      add({ kind: 'slab', s0, s1, z0: zc, z1: zc + 0.04, fill: ccol, hatch: cm ? 'none' : 'gypsum', depth: 0, mat: cn })
      res.rooms.push({ x0: Math.min(sx(s0), sx(s1)), x1: Math.max(sx(s0), sx(s1)), name: r.name, z: zf, ceil: zc })
      zLo = Math.min(zLo, zf)
    }
  }
  // bản sàn · mái bê tông trên toàn bề rộng phần công trình bị cắt
  const sAll = [...shapes.filter(s => s.kind === 'cut').flatMap(s => [s.x0, s.x1]), ...covered.flatMap(([p, q]) => [sx(p), sx(q)])]
  if (sAll.length) {
    const x0 = Math.min(...sAll), x1 = Math.max(...sAll)
    const n = keyOf('Bản bê tông cốt thép', 'concrete', '#a9a9a9', 'lib', [(x0 + x1) / 2, zLo - 0.1])
    shapes.push({ kind: 'cut', x0, x1, z0: zLo - 0.2, z1: zLo - 0.03, fill: '#a9a9a9', hatch: 'concrete', depth: 0, mat: n })
    shapes.push({ kind: 'cut', x0, x1, z0: zTop + 0.1, z1: zTop + 0.3, fill: '#a9a9a9', hatch: 'concrete', depth: 0, mat: n })
    res.zMin = zLo - 0.45; res.zMax = zTop + 0.55
    res.levels.push({ z: 0, text: '±0.00' })
    for (const r of M.rooms ?? []) { if (r.z) res.levels.push({ z: r.z, text: `${r.z > 0 ? '+' : ''}${r.z.toFixed(2)}` }) }
    res.levels.push({ z: zTop, text: `+${zTop.toFixed(2)}` })
    res.empty = false
  }
  void cutWalls
  // vẽ xa trước, gần sau; mảng cắt luôn nằm trên cùng
  const order = { beyond: 0, glass: 0, furn: 0, door: 0, slab: 3, cutfurn: 4, cut: 5 } as const
  shapes.sort((p, q) => (order[p.kind] - order[q.kind]) || (q.depth - p.depth))
  // vị trí chú thích (theo toạ độ đã lật nếu cần)
  for (const l of legend) l.at = [sx(l.at[0]), l.at[1]]
  return res
}

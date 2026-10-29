// Đọc bản vẽ DXF (AutoCAD) → cùng cấu trúc VecPage như PDF: layer thật, cung/cửa thật, đơn vị thật. Không dùng AI.
import DxfParser from 'dxf-parser'
import { asArc, type VecPage, type VecClass, type VecText, type DrawRun } from './vector'
import { PT_MM, STD_DEN } from './dims'
import { CTB_LW } from './ctbDefault'
import { decodeDxf, rawExtras, splinePts, type RawExtras } from './dxfRaw'
import { classifyBlocks, type BlkRaw, type BlkObj } from './dxfObjects'

/** File có phải PDF không (nếu không → coi là DXF) */
export const isPdfBuf = (b: ArrayBuffer) => { const u = new Uint8Array(b, 0, Math.min(1024, b.byteLength)); for (let i = 0; i + 4 <= u.length; i++) if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46) return true; return false }

type M = [number, number, number, number, number, number] // x' = a x + c y + e ; y' = b x + d y + f
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]]
const ID: M = [1, 0, 0, 1, 0, 0]
const MIRX: M = [-1, 0, 0, 1, 0, 0]
/** đối tượng có toạ độ trong hệ OCS (phụ thuộc pháp tuyến); LINE, SPLINE, MTEXT, ELLIPSE, MLINE dùng toạ độ thế giới */
const OCS_TYPES = new Set(['ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'TEXT', 'ATTRIB', 'INSERT', 'SOLID', 'TRACE'])
const MM_PER_UNIT: Record<number, number> = { 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 0.0000254, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100, 15: 1e4, 16: 1e5 }

function aciHex(i: number): string {
  const base: Record<number, string> = { 1: '#ff0000', 2: '#c8a000', 3: '#00a000', 4: '#00a0a0', 5: '#0000ff', 6: '#c000c0', 7: '#000000', 8: '#808080', 9: '#b0b0b0' }
  if (base[i]) return base[i]
  if (i >= 250) { const g = 51 + (i - 250) * 40; return '#' + [g, g, g].map(v => Math.min(200, v).toString(16).padStart(2, '0')).join('') }
  if (i < 10) return '#000000'
  const h = (Math.floor((i - 10) / 10) * 15) % 360, r = (i - 10) % 10
  const s = [1, .5, 1, .5, 1, .5, 1, .5, 1, .5][r], v = [1, 1, .65, .65, .5, .5, .3, .3, .15, .15][r] * 0.85
  const f = (n: number) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255) }
  return '#' + [f(5), f(3), f(1)].map(x => x.toString(16).padStart(2, '0')).join('')
}

function cleanMtext(s: string): string {
  return s.replace(/\\P/g, ' ').replace(/\\[ACFfHQTW][^;]*;/g, '').replace(/\\[Ll~Oo]/g, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').trim()
}

type Pt = [number, number]
type HatchLoop = Pt[]
/** HATCH không có trong dxf-parser → đọc thô từ text DXF: trả về hatch (theo ENTITIES / theo tên block) với các đường biên */
function rawHatches(L: string[]): { model: any[]; blocks: Record<string, any[]> } {
  const model: any[] = [], blocks: Record<string, any[]> = {}
  let sec = '', blk = ''
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim()
    if (c === '0' && v === 'SECTION') { sec = (L[i + 3] ?? '').trim(); continue }
    if (c === '0' && v === 'BLOCK') { for (let j = i + 2; j < Math.min(L.length, i + 40); j += 2) if (L[j].trim() === '2') { blk = L[j + 1].trim(); break } continue }
    if (c === '0' && v === 'ENDBLK') { blk = ''; continue }
    if (c !== '0' || v !== 'HATCH' || (sec !== 'ENTITIES' && sec !== 'BLOCKS')) continue
    let j = i + 2, layer = '0', solid = 0, pat = '', negZ = false, hidden = false
    const loops: HatchLoop[] = []
    let cur: HatchLoop | null = null, mode: 'poly' | 'edge' | '' = '', edge = 0, nv = 0, bul = 0
    const pts: number[][] = []
    let edges: Pt[][] = [], bl: number[] = []
    const flush = () => {
      if (mode === 'poly' && cur && bl.some(b => b)) { // đỉnh có bulge → cung tròn giữa hai đỉnh (không được nối thẳng thành dây cung)
        const o: Pt[] = [], n = cur.length
        for (let q = 0; q < n; q++) {
          const a = cur[q], b = cur[(q + 1) % n], g = bl[q] || 0; o.push(a)
          if (g && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) {
            const th = 4 * Math.atan(g), ch = Math.hypot(b[0] - a[0], b[1] - a[1]), rr = ch / (2 * Math.sin(Math.abs(th) / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
            const h = rr * Math.cos(th / 2), ux = -(b[1] - a[1]) / ch, uy = (b[0] - a[0]) / ch, sg = g > 0 ? 1 : -1
            const cx = mx + sg * ux * h, cy = my + sg * uy * h
            const a0 = Math.atan2(a[1] - cy, a[0] - cx), m = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 24)))
            for (let k = 1; k < m; k++) { const f = a0 + th * k / m; o.push([cx + rr * Math.cos(f), cy + rr * Math.sin(f)]) }
          }
        }
        cur = o
      }
      bl = []
      if (mode === 'edge' && edges.length) { // nối các cạnh rời thành đường khép kín (cạnh có thể đảo chiều/không theo thứ tự)
        const used = new Array(edges.length).fill(false), out: Pt[] = [...edges[0]]; used[0] = true
        for (let n = 1; n < edges.length; n++) {
          const end = out[out.length - 1]; let bi = -1, brev = false, bd = 1e18
          for (let k = 0; k < edges.length; k++) if (!used[k]) { const e = edges[k], d0 = Math.hypot(e[0][0] - end[0], e[0][1] - end[1]), d1 = Math.hypot(e[e.length - 1][0] - end[0], e[e.length - 1][1] - end[1]); if (d0 < bd) { bd = d0; bi = k; brev = false } if (d1 < bd) { bd = d1; bi = k; brev = true } }
          if (bi < 0) break
          used[bi] = true; const e = brev ? [...edges[bi]].reverse() : edges[bi]; out.push(...e)
        }
        if (out.length >= 3) loops.push(out)
      } else if (cur && cur.length >= 3) loops.push(cur)
      edges = []; cur = null
    }
    for (; j + 1 < L.length; j += 2) {
      const cc = +L[j], vv = L[j + 1].trim()
      if (cc === 0) break
      if (cc === 230 && !cur && !edges.length) { negZ = +vv < -0.5; continue }
      if (cc === 60 && !cur && !edges.length && +vv === 1) hidden = true
      if (cc === 8) layer = vv; else if (cc === 70 && !pat) solid = +vv; else if (cc === 2) pat = vv
      else if (cc === 75 || cc === 98) { flush(); mode = '' } // hết phần đường biên (sau đó là điểm hạt/mẫu – không phải đỉnh)
      else if (cc === 92) { flush(); cur = []; mode = (+vv & 2) ? 'poly' : 'edge'; edge = 0; nv = 0; pts.length = 0 }
      else if (cur && mode === 'poly') {
        if (cc === 72) bul = +vv
        else if (cc === 42) bl[cur.length - 1] = +vv
        else if (cc === 10) { cur.push([+vv, 0]); bl.push(0) }
        else if (cc === 20 && cur.length) cur[cur.length - 1][1] = +vv
      } else if (cur && mode === 'edge') {
        if (cc === 72) { edge = +vv; pts.length = 0 }
        else if (edge === 1) { if (cc === 10) pts[0] = [+vv, 0]; else if (cc === 20 && pts[0]) pts[0][1] = +vv; else if (cc === 11) pts[1] = [+vv, 0]; else if (cc === 21 && pts[1]) { pts[1][1] = +vv; edges.push([pts[0] as Pt, pts[1] as Pt]); pts.length = 0 } }
        else if (edge === 2) { if (cc === 10) pts[0] = [+vv, 0]; else if (cc === 20 && pts[0]) pts[0][1] = +vv; else if (cc === 40) pts[1] = [+vv, 0]; else if (cc === 50) pts[2] = [+vv, 0]; else if (cc === 51) pts[3] = [+vv, 0]; else if (cc === 73 && pts[0] && pts[1] && pts[2] && pts[3]) {
          const r = pts[1][0], a0 = (pts[2][0] * Math.PI) / 180, a1 = (pts[3][0] * Math.PI) / 180, ccw = +vv !== 0
          let sw = a1 - a0; while (sw <= 0) sw += Math.PI * 2 // ccw=0: góc đo theo chiều kim đồng hồ (đảo dấu) – quy ước DXF HATCH
          const n = Math.max(2, Math.ceil(sw / (Math.PI / 18)))
          const ar: Pt[] = []; for (let k = 0; k <= n; k++) { const f = a0 + (sw * k) / n, an = ccw ? f : -f; ar.push([pts[0][0] + r * Math.cos(an), pts[0][1] + r * Math.sin(an)]) } edges.push(ar)
          pts.length = 0 } }
        else if (edge === 3) { if (cc === 10) pts[0] = [+vv, 0]; else if (cc === 20 && pts[0]) pts[0][1] = +vv; else if (cc === 11) pts[1] = [+vv, 0]; else if (cc === 21 && pts[1]) pts[1][1] = +vv; else if (cc === 40) pts[2] = [+vv, 0]; else if (cc === 50) pts[3] = [+vv, 0]; else if (cc === 51) pts[4] = [+vv, 0]; else if (cc === 73 && pts[0] && pts[1] && pts[2] && pts[3] && pts[4]) {
          const ccw = +vv !== 0, mx = pts[1][0], my = pts[1][1], ra = pts[2][0], a0 = (pts[3][0] * Math.PI) / 180, a1 = (pts[4][0] * Math.PI) / 180, rot = Math.atan2(my, mx), A = Math.hypot(mx, my), B = A * ra
          let sw = a1 - a0; while (sw <= 0) sw += Math.PI * 2
          const n = Math.max(8, Math.ceil(sw / (Math.PI / 24))), ar: Pt[] = []
          for (let k = 0; k <= n; k++) { const f = a0 + (sw * k) / n, t = ccw ? f : -f, ex = A * Math.cos(t), ey = B * Math.sin(t); ar.push([pts[0][0] + ex * Math.cos(rot) - ey * Math.sin(rot), pts[0][1] + ex * Math.sin(rot) + ey * Math.cos(rot)]) }
          edges.push(ar); pts.length = 0 } }
      }
    }
    void bul; void nv
    flush()
    if (loops.length && !hidden) { const e = { type: 'HATCH', layer, loops: negZ ? loops.map(lp => lp.map(p => [-p[0], p[1]] as Pt)) : loops, solid, pat }; if (sec === 'ENTITIES') model.push(e); else if (blk) (blocks[blk] ??= []).push(e) }
  }
  return { model, blocks }
}
function bulgePts(p: Pt, q: Pt, b: number): Pt[] {
  const th = 4 * Math.atan(b), dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy)
  if (!d || !isFinite(th) || Math.abs(th) < 1e-6) return [q]
  const h = (d / 2) / Math.tan(th / 2), cx = (p[0] + q[0]) / 2 + (-dy / d) * h, cy = (p[1] + q[1]) / 2 + (dx / d) * h
  const r = Math.hypot(p[0] - cx, p[1] - cy), a0 = Math.atan2(p[1] - cy, p[0] - cx), n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 18)))
  const out: Pt[] = []; for (let i = 1; i <= n; i++) out.push([cx + r * Math.cos(a0 + (th * i) / n), cy + r * Math.sin(a0 + (th * i) / n)]); return out
}
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let sw = a1 - a0; while (sw <= 0) sw += Math.PI * 2; if (sw > Math.PI * 2) sw = Math.PI * 2
  const n = Math.max(4, Math.ceil(sw / (Math.PI / 18))), out: Pt[] = []
  for (let i = 0; i <= n; i++) out.push([cx + r * Math.cos(a0 + (sw * i) / n), cy + r * Math.sin(a0 + (sw * i) / n)]); return out
}

type Path = { pts: Pt[]; layer: string; color?: number; lw?: number; closed?: boolean; fill?: boolean; hatch?: boolean; loops?: Pt[][]; /** đảo tách từ hatch đặc lớn ở mặt bằng (không nằm trong khối đồ) → chắc là thân tường */ isl?: boolean }
type Txt = { t: string; x: number; y: number; h: number; rot: number; ly: string }
/** layer nhiễu (đường ống, cơ điện, tâm…) – ẩn đi */
const NOISE = /defpoints|xref- ?ps|(^|\$)(m|p)-|g-impt|a-genm|dwatcopi|fitting|pipe|(^|\$)center$|s-dim|淘宝|balloon|xr_(?!b2)[^$]*plan|net.?khuat|net.?thay|(^|\$)i_thay|(^|\$)defpoints/i
/** layer ranh giới không gian khép kín (có sẵn trong bản vẽ) */
/** layer của cửa đi/cửa sổ – chỉ cung ở các layer này mới được coi là cung quét cánh cửa (không lẫn với ghế, bàn, thiết bị) */
export const DOOR_LAYER = /door|(^|\$)cua|cua ?di|cua ?so|(^|\$)dr[_ -]|window/i
/** layer đồ nội thất / thiết bị rời (chỉ để dựng khối 3D đúng độ cao, không phải tường) */
export const FURN_LAYER = /noi.?that|furn|loose.?fur|equip|k-general|interior|fixture|sanitary|thiet.?bi|stair|thang|lift|elev|toilet|basin|lavabo|urinal|(^|\$)wc|(^|\$)fur(\$|$)|(^|\$)(chair|table|sofa|bed|ghe|ban|giuong)/i
const OBJ_VN: Record<string, string> = { door: 'cửa 1 cánh', double: 'cửa 2 cánh', slide: 'cửa trượt', glass: 'vách kính', window: 'cửa sổ', lift: 'thang máy', stair: 'thang bộ', spiral: 'thang xoắn' }
export type FurnRaw = { name: string; layer: string; cx: number; cy: number; w: number; d: number; rot: number; src: 'block' | 'loose' }
export const ZONE_LAYER = /(^|\$)area$|ranh.?gioi|dien.?tich|room.?bound|space.?bound/i

/** DXF → các đường (toạ độ bản vẽ, đơn vị gốc) + chữ */
function collect(dxf: any, hatches?: ReturnType<typeof rawHatches>, extra?: RawExtras): { paths: Path[]; texts: Txt[]; layers: Record<string, { color: number; off: boolean }>; insts: { name: string; layer: string; cx: number; cy: number; w: number; d: number; rot: number }[]; loose: { x0: number; y0: number; x1: number; y1: number; layer: string }[]; blk: BlkRaw[] } {
  const layers: Record<string, { color: number; off: boolean }> = {}
  for (const [k, l] of Object.entries<any>(dxf.tables?.layer?.layers ?? {})) layers[k] = { color: Math.abs(l.colorIndex ?? l.color ?? 7) || 7, off: l.visible === false || l.frozen === true }
  const blocks: Record<string, any> = dxf.blocks ?? {}
  const paths: Path[] = [], texts: Txt[] = []
  const blk: BlkRaw[] = []
  const insts: { name: string; layer: string; cx: number; cy: number; w: number; d: number; rot: number }[] = [], loose: { x0: number; y0: number; x1: number; y1: number; layer: string }[] = []
  let inFurn = 0
  const apT = (m: M, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
  const walk = (ents: any[], m0: M, inherit: { layer?: string; color?: number }, depth: number, paper: boolean) => {
    for (const e of ents) {
      let m = m0
      if (!e || (paper !== !!e.inPaperSpace && depth === 0)) continue
      if (e.visible === false) continue   // đối tượng ẩn (trạng thái ẩn của block động…) – AutoCAD không vẽ thì mình cũng bỏ
      const own = e.layer ?? '0', layer = own === '0' && inherit.layer ? inherit.layer : own
      if (layers[layer]?.off) continue
      // layer nhiễu (kích thước, kết cấu…): bỏ nét; riêng chữ số bậc thang (1, 2… 18) vẫn giữ để biết bậc đầu tiên
      if (NOISE.test(layer) && !((e.type === 'TEXT' || e.type === 'MTEXT') && /^\s*\d{1,2}\s*$/.test(cleanMtext(String(e.text ?? ''))))) continue
      let color: number | undefined = typeof e.colorIndex === 'number' && e.colorIndex > 0 && e.colorIndex < 256 ? e.colorIndex : undefined
      if (color === undefined && inherit.color) color = inherit.color
      const lw = typeof e.lineweight === 'number' && e.lineweight > 0 ? e.lineweight / 100 : undefined
      // hệ toạ độ đối tượng lật (pháp tuyến −Z): toạ độ OCS → WCS = lật trục X (thuật toán trục tuỳ ý của DXF, trường hợp mặt phẳng XY)
      const flipZ = !!e.negZ || (!!e.handle && !!extra?.negZ.has(e.handle))
      if (flipZ && OCS_TYPES.has(e.type)) m = mul(m, MIRX)
      const add = (pts: Pt[], closed = false, fill = false) => {
        if (pts.length < 2) return
        const tp = pts.map(p => apT(m, p)); paths.push({ pts: tp, layer, color, lw, closed, fill })
        if (!inFurn && FURN_LAYER.test(layer)) { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const t of tp) { x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]); y0 = Math.min(y0, t[1]); y1 = Math.max(y1, t[1]) } loose.push({ x0, y0, x1, y1, layer }) }
      }
      switch (e.type) {
        case 'HATCH': {
          // chỉ tô hatch của tường/cột/bê tông (nhận theo layer); lấy đường biên ngoài (lớn nhất)
          if (!/hatch|wall|tuong|column|btct|be ?tong/i.test(layer)) break
          const lps = (e.loops as HatchLoop[]).filter(lp => lp.length >= 3).map(lp => [...lp, lp[0]].map(p => apT(m, p)))
          // cột (hatch BTCT): các đường biên con chỉ là nét của mẫu hatch → chỉ lấy biên ngoài; tường/sàn: giữ lỗ (even-odd)
          const ar = (lp: Pt[]) => { let a = 0; for (let i = 0; i + 1 < lp.length; i++) a += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1]; return Math.abs(a) }
          if (lps.length) { const big = lps.reduce((b, l) => (ar(l) > ar(b) ? l : b)), use = /column|btct/i.test(layer + ' ' + (e.pat ?? '')) ? lps.filter(l => l === big || ar(l) > ar(big) * 0.4) : lps; /* cột: bỏ nét nhỏ của mẫu; vòng tường BTCT (có lỗ lớn) giữ cả lỗ */ paths.push({ pts: use[0], layer, closed: true, fill: true, hatch: true, loops: use }) }
          break
        }
        case '_POLY': add(e.pts, e.closed); break   // MLINE đã tách thành nét (dxfRaw)
        case 'LINE': if (e.vertices?.length >= 2) add([[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]]); break
        case 'LWPOLYLINE': case 'POLYLINE': {
          const v: any[] = e.vertices ?? []; if (v.length < 2) break
          const pts: Pt[] = [[v[0].x, v[0].y]]
          for (let i = 1; i < v.length; i++) { const b = v[i - 1].bulge; if (b) pts.push(...bulgePts([v[i - 1].x, v[i - 1].y], [v[i].x, v[i].y], b)); else pts.push([v[i].x, v[i].y]) }
          if (e.shape) { const b = v[v.length - 1].bulge; if (b) pts.push(...bulgePts([v[v.length - 1].x, v[v.length - 1].y], [v[0].x, v[0].y], b)); else pts.push([v[0].x, v[0].y]) }
          add(pts, !!e.shape); break
        }
        case 'ARC': add(arcPts(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle)); break
        case 'CIRCLE': add(arcPts(e.center.x, e.center.y, e.radius, 0, Math.PI * 2), true); break
        case 'ELLIPSE': {
          const c = e.center, a = e.majorAxisEndPoint, rt = e.axisRatio ?? 1, rot = Math.atan2(a.y, a.x), ra = Math.hypot(a.x, a.y)
          const s0 = e.startAngle ?? 0, s1 = e.endAngle ?? Math.PI * 2, pts: Pt[] = []
          const sg = flipZ ? -1 : 1   // pháp tuyến −Z: trục phụ = N × trục chính → đảo chiều
          for (let i = 0; i <= 36; i++) { const t = s0 + ((s1 - s0) * i) / 36, x = ra * Math.cos(t), y = sg * ra * rt * Math.sin(t); pts.push([c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot)]) }
          add(pts); break
        }
        case 'SPLINE': { // đường cong B-spline thật; thiếu dữ liệu nút → nối qua điểm đi qua (fit) hoặc điểm điều khiển như cũ
          const cp: Pt[] = (e.controlPoints ?? []).map((p: any) => [p.x, p.y] as Pt)
          const cur = cp.length ? splinePts(cp, e.knotValues ?? [], e.degreeOfSplineCurve ?? 3, e.weights) : null
          const src: any[] = e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? []
          add(cur ?? src.map(p => [p.x, p.y] as Pt), !!e.closed); break }
        case 'SOLID': { const v: any[] = e.points ?? []; if (v.length >= 3) { const q = v.map(p => [p.x, p.y] as Pt); if (v.length === 4) [q[2], q[3]] = [q[3], q[2]]; add([...q, q[0]], true, true) } break }
        case 'TEXT': case 'MTEXT': case 'ATTRIB': {
          // chữ căn giữa / phải / trên…: AutoCAD lưu vị trí thật ở ĐIỂM CĂN (nhóm 11); căn đều (aligned/fit) → giữa hai điểm
          const ha = e.halign ?? 0, va = e.valign ?? 0, sp = e.startPoint ?? e.position, ep = e.endPoint
          const p = e.type !== 'MTEXT' && ep && (ha || va) ? (ha === 3 || ha === 5 ? { x: (sp.x + ep.x) / 2, y: (sp.y + ep.y) / 2 } : ep) : sp
          const raw = String(e.text ?? ''); const t = cleanMtext(raw)
          if (p && t) { const [x, y] = apT(m, [p.x, p.y]); texts.push({ t, x, y, h: (e.textHeight ?? e.height ?? 1) * Math.hypot(m[0], m[1]), rot: (e.rotation ?? 0) + (Math.atan2(m[1], m[0]) * 180) / Math.PI, ly: layer }) }
          break
        }
        case 'INSERT': {
          const b = blocks[e.name]; if (!b?.entities?.length || depth > 6) break
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = ((e.rotation ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
          const bp = b.position ?? { x: 0, y: 0 }
          const ins: M = mul([c * sx, s * sx, -s * sy, c * sy, e.position?.x ?? 0, e.position?.y ?? 0], [1, 0, 0, 1, -bp.x, -bp.y])
          const cols = e.columnCount > 1 || e.rowCount > 1 ? { c: e.columnCount ?? 1, r: e.rowCount ?? 1, dc: e.columnSpacing ?? 0, dr: e.rowSpacing ?? 0 } : { c: 1, r: 1, dc: 0, dr: 0 }
          const isF = depth === 0 && FURN_LAYER.test(layer) && !inFurn
          for (let i = 0; i < Math.min(cols.c, 200); i++) for (let j = 0; j < Math.min(cols.r, 200); j++) {
            const n0 = paths.length; if (isF) inFurn++
            walk(b.entities, mul(m, mul([1, 0, 0, 1, i * cols.dc * c - j * cols.dr * s, i * cols.dc * s + j * cols.dr * c], ins)), { layer, color }, depth + 1, paper)
            if (isF) { inFurn--
              // khung bao theo hướng chèn khối (xoay theo góc INSERT) → kích thước thật của món đồ
              const co = Math.cos(-r), si = Math.sin(-r); let a0 = 1e18, b0 = 1e18, a1 = -1e18, b1 = -1e18
              for (let q = n0; q < paths.length; q++) for (const t of paths[q].pts) { const u = t[0] * co - t[1] * si, v2 = t[0] * si + t[1] * co; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v2); b1 = Math.max(b1, v2) }
              if (a1 > a0 && b1 > b0) { const cu = (a0 + a1) / 2, cv = (b0 + b1) / 2; insts.push({ name: extra?.dynName.get(String(e.name ?? '')) ?? String(e.name ?? ''), layer, cx: cu * Math.cos(r) - cv * Math.sin(r), cy: cu * Math.sin(r) + cv * Math.cos(r), w: a1 - a0, d: b1 - b0, rot: r }) } }
            // khối không phải đồ rời (cửa, vách kính, thang…) → giữ lại nguyên nét để nhận đối tượng (dxfObjects)
            else if (depth === 0 && paths.length > n0) { const ps = paths.slice(n0); blk.push({ name: extra?.dynName.get(String(e.name ?? '')) ?? String(e.name ?? ''), layer, layers: [...new Set(ps.map(q => q.layer))], paths: ps.map(q => ({ pts: q.pts, closed: q.closed })), rot: Math.atan2(mul(m, ins)[1], mul(m, ins)[0]) }) }
          }
          break
        }
      }
    }
  }
  const ents: any[] = [...(dxf.entities ?? []), ...(hatches?.model ?? []), ...(extra?.model ?? [])]
  if (hatches) for (const [n, hs] of Object.entries(hatches.blocks)) if (blocks[n]) blocks[n] = { ...blocks[n], entities: [...(blocks[n].entities ?? []), ...hs] }
  if (extra) for (const [n, xs] of Object.entries(extra.blocks)) if (blocks[n]) blocks[n] = { ...blocks[n], entities: [...(blocks[n].entities ?? []), ...xs] }
  const hasModel = ents.some(e => !e.inPaperSpace)
  walk(ents, ID, {}, 0, !hasModel)
  return { paths, texts, layers, insts, loose, blk }
}

const q = (a: number[], p: number) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] }

export type DxfInfo = { unit: string; mmPerUnit: number; den: number; extentM: [number, number]; /** số bản vẽ tách rời trong file (>1: có nhiều mặt bằng đặt cạnh nhau) */ sheets?: number }

/** DXF → VecPage. Tỉ lệ (den) được chọn theo kích thước bản vẽ thật nên m/pt chính xác tuyệt đối theo đơn vị của file. */
export async function readDxfPage(data: ArrayBuffer, onLog?: (s: string) => void, opt: { draw?: boolean } = {}): Promise<VecPage & { dxf: DxfInfo; zones: { layer: string; pts: number[] }[] }> {
  onLog?.('Đang đọc DXF...')
  let dxf: any
  let hatches: ReturnType<typeof rawHatches> | undefined, extra: RawExtras | undefined
  try {
    const txt = decodeDxf(data)   // ASCII hoặc nhị phân; đúng bảng mã file đời cũ; giải \U+XXXX
    dxf = new DxfParser().parseSync(txt)
    const L = txt.split(/\r?\n/)
    try { hatches = rawHatches(L) } catch { /* bỏ hatch */ }
    try { extra = rawExtras(L) } catch { /* bỏ phần bổ sung */ }
  } catch (e) { throw new Error('Không đọc được DXF: ' + String(e)) }
  const { paths, texts: rawT, layers, insts, loose, blk } = collect(dxf, hatches, extra)
  if (paths.length < 20) throw new Error('DXF gần như không có nét vẽ trong Model space.')
  const xs: number[] = [], ys: number[] = []
  // khung bản vẽ: ưu tiên nét tường / ô diện tích (bản vẽ hay có vật thể lạc rất xa), không có thì lấy mọi nét trừ Defpoints
  const core = /tuong|wall|\$area$/i
  const pick = (f: (l: string) => boolean) => { xs.length = 0; ys.length = 0; for (const p of paths) if (f(p.layer)) for (const pt of p.pts) { xs.push(pt[0]); ys.push(pt[1]) } }
  pick(l => core.test(l) && !/dim/i.test(l)); if (xs.length < 400) pick(l => !/defpoints/i.test(l))
  const insu = +(dxf.header?.$INSUNITS ?? 0)
  let x0 = q(xs, 0.02), x1 = q(xs, 0.98), y0 = q(ys, 0.02), y1 = q(ys, 0.98)
  let tight = false, nSheets = 1
  { // vật thể lạc xa (xref, khối ngoại lai) làm khung phình to → mặt bằng nhỏ lại: chia lưới 120×120 trên mọi nét, giữ cụm ô liền nhau (cho phép hở 2 ô) có nhiều điểm nhất
    const ax: number[] = [], ay: number[] = []; for (const p of paths) if (!/defpoints/i.test(p.layer)) for (const pt of p.pts) { ax.push(pt[0]); ay.push(pt[1]) }
    if (ax.length > 2000) {
      const N = 120, gx0 = q(ax, 0), gx1 = q(ax, 1), gy0 = q(ay, 0), gy1 = q(ay, 1), cw = (gx1 - gx0) / N || 1, ch = (gy1 - gy0) / N || 1
      const cnt = new Array<number>(N * N).fill(0)
      for (let i = 0; i < ax.length; i++) cnt[Math.min(N - 1, ((ax[i] - gx0) / cw) | 0) * N + Math.min(N - 1, ((ay[i] - gy0) / ch) | 0)]++
      const comp = new Array<number>(N * N).fill(-1), compTot: number[] = []; let best = -1, bestN = 0, nc = 0
      for (let s0 = 0; s0 < N * N; s0++) {
        if (!cnt[s0] || comp[s0] >= 0) continue
        let tot = 0; const st = [s0]; comp[s0] = nc
        while (st.length) { const c = st.pop()!, ci = (c / N) | 0, cj = c % N; tot += cnt[c]
          for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue; const n = i * N + j; if (cnt[n] && comp[n] < 0) { comp[n] = nc; st.push(n) } } }
        compTot.push(tot); if (tot > bestN) { bestN = tot; best = nc } nc++
      }
      // nhiều bản vẽ trong cùng file (vd 2 phương án mặt bằng đặt cạnh nhau): báo cho người dùng biết đang đọc bản nào
      { // lưới thô trên vùng 0,2–99,8% điểm; độ lớn mỗi cụm = số ô có nét (diện tích), không phải số nét (bỏ vật thể lạc rất xa), khe trống ≥ 2 ô (~3% bề rộng) = hai bản vẽ tách rời
        const M2 = 60, qx0 = q(ax, 0.002), qx1 = q(ax, 0.998), qy0 = q(ay, 0.002), qy1 = q(ay, 0.998), cw2 = (qx1 - qx0) / M2 || 1, ch2 = (qy1 - qy0) / M2 || 1
        const c2 = new Array<number>(M2 * M2).fill(0), mark = (x: number, y: number) => { const gi = Math.floor((x - qx0) / cw2), gj = Math.floor((y - qy0) / ch2); if (gi >= 0 && gj >= 0 && gi < M2 && gj < M2) c2[gi * M2 + gj]++ }
        // tô ô dọc theo từng đoạn nét (không chỉ đỉnh) để tường dài / khoảng sảnh rộng vẫn liền một bản vẽ
        for (const p of paths) { if (/defpoints/i.test(p.layer)) continue; for (let i = 0; i + 1 < p.pts.length; i++) { const [xa, ya] = p.pts[i], [xb, yb] = p.pts[i + 1], n = Math.min(400, Math.ceil(Math.max(Math.abs(xb - xa) / cw2, Math.abs(yb - ya) / ch2)) + 1); for (let k = 0; k <= n; k++) mark(xa + ((xb - xa) * k) / n, ya + ((yb - ya) * k) / n) } }
        const lab2 = new Array<number>(M2 * M2).fill(-1), tots: number[] = [], bbs: number[][] = []
        for (let s0 = 0; s0 < M2 * M2; s0++) { if (!c2[s0] || lab2[s0] >= 0) continue; let tot = 0; const st = [s0]; lab2[s0] = tots.length; const bb = [M2, M2, -1, -1]; bbs.push(bb)
          while (st.length) { const c = st.pop()!, ci = (c / M2) | 0, cj = c % M2; tot += 1; bb[0] = Math.min(bb[0], ci); bb[1] = Math.min(bb[1], cj); bb[2] = Math.max(bb[2], ci); bb[3] = Math.max(bb[3], cj); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const i2 = ci + di, j2 = cj + dj; if (i2 < 0 || j2 < 0 || i2 >= M2 || j2 >= M2) continue; const n2 = i2 * M2 + j2; if (c2[n2] && lab2[n2] < 0) { lab2[n2] = tots.length; st.push(n2) } } }
          tots.push(tot) }
        const top = Math.max(...tots), bigI = tots.map((t, i) => i).filter(i => tots[i] >= top * 0.35)
        // khung tên / khung giấy bao quanh một bản vẽ khác → không tính là bản vẽ riêng
        const big = bigI.filter(i => !bigI.some(j => j !== i && bbs[i][0] <= bbs[j][0] && bbs[i][1] <= bbs[j][1] && bbs[i][2] >= bbs[j][2] && bbs[i][3] >= bbs[j][3])).length
        if (big > 1) { nSheets = big; onLog?.(`  ⚠ File có ${big} bản vẽ đặt cạnh nhau – đang đọc bản nhiều nét nhất. Muốn đọc bản khác: tách bản đó ra file DXF riêng.`) } }
      if (best >= 0) { let a0 = N, a1 = 0, b0 = N, b1 = 0; for (let c = 0; c < N * N; c++) if (comp[c] === best) { const i = (c / N) | 0, j = c % N; a0 = Math.min(a0, i); a1 = Math.max(a1, i + 1); b0 = Math.min(b0, j); b1 = Math.max(b1, j + 1) }
        const nx0 = gx0 + a0 * cw, nx1 = gx0 + a1 * cw, ny0 = gy0 + b0 * ch, ny1 = gy0 + b1 * ch
        if ((nx1 - nx0) * (ny1 - ny0) < (x1 - x0) * (y1 - y0) * 1.5) { x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1; tight = true } }
    }
  }
  const mx = (x1 - x0) * (tight ? 0.05 : 0.25), my = (y1 - y0) * (tight ? 0.05 : 0.25); x0 -= mx; x1 += mx; y0 -= my; y1 += my
  let mmU = MM_PER_UNIT[insu] ?? 0, unit = ['', 'inch', 'feet', 'dặm', 'mm', 'cm', 'm'][insu] ?? `mã ${insu}`
  const span = Math.max(x1 - x0, y1 - y0)
  // $INSUNITS trong file thường sai (vd. để inch dù vẽ bằng mm) → kiểm tra bằng kích thước toà nhà thật (8–400 m), sai thì đoán lại
  const okSpan = (u: number) => { const m = (span * u) / 1000; return m >= 8 && m <= 400 }
  if (!mmU || !okSpan(mmU)) { const g = [1, 10, 1000].find(okSpan) ?? 1; if (g !== mmU) { mmU = g; unit = g === 1 ? 'mm (đoán)' : g === 10 ? 'cm (đoán)' : 'm (đoán)' } }
  const spanMm = span * mmU
  // tỉ lệ chuẩn gần nhất sao cho cạnh dài ≈ 1500–3500 pt
  const target = spanMm / PT_MM / 2400
  const den = STD_DEN.reduce((b, d) => (Math.abs(Math.log(d / target)) < Math.abs(Math.log(b / target)) ? d : b), STD_DEN[0])
  const k = (PT_MM * den) / mmU // đơn vị bản vẽ trên 1 pt
  const W = (x1 - x0) / k, H = (y1 - y0) / k
  const X = (x: number) => (x - x0) / k, Y = (y: number) => (y1 - y) / k
  const classIdx = new Map<string, number>(), classes: VecClass[] = []
  const clsOf = (layer: string, lw: number, fill: boolean) => {
    const w = fill ? -1 : Math.round(lw * 20) / 20, key = `${layer}|${fill ? 'fill' : w}`
    let i = classIdx.get(key); if (i === undefined) { i = classes.length; classIdx.set(key, i); classes.push({ key, layer, lw: w, fill, len: 0, n: 0 }) } return i
  }
  const zones: { layer: string; pts: number[] }[] = []
  const segs: number[] = [], segCls: number[] = [], fills: VecPage['fills'] = [], arcs: VecPage['arcs'] = [], runs: DrawRun[] = []
  const f2 = (n: number) => (Math.round(n * 100) / 100).toString()
  const seenP = new Set<string>(), seenS = new Set<string>(), hatchRuns: DrawRun[] = []
  let nCol = 0, nWall = 0
  const allArcs: VecPage['arcs'] = []
  // cung cửa vẽ chồng nhiều lớp (đồng tâm, cùng góc quét): chỉ giữ cung lớn nhất của mỗi cánh cửa
  const dropArc = new Set<Path>()
  {
    const maxR = 1500 / (PT_MM * den), cand: { p: Path; cx: number; cy: number; R: number; a0: number; a1: number }[] = []
    for (const p of paths) {
      const n = p.pts.length; if (p.closed || n < 4 || n > 40 || /defpoints/i.test(p.layer)) continue
      const A = p.pts[0], B = p.pts[n - 1], M = p.pts[n >> 1]
      const ax = X(A[0]), ay = Y(A[1]), bx = X(B[0]), by = Y(B[1]), mx = X(M[0]), my = Y(M[1])
      const d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by)); if (Math.abs(d) < 1e-6) continue
      const cx = ((ax * ax + ay * ay) * (by - my) + (bx * bx + by * by) * (my - ay) + (mx * mx + my * my) * (ay - by)) / d
      const cy = ((ax * ax + ay * ay) * (mx - bx) + (bx * bx + by * by) * (ax - mx) + (mx * mx + my * my) * (bx - ax)) / d
      const R = Math.hypot(ax - cx, ay - cy); if (!(R > 2 && R < maxR)) continue
      const a0 = Math.atan2(ay - cy, ax - cx), a1 = Math.atan2(by - cy, bx - cx)
      cand.push({ p, cx, cy, R, a0: Math.min(a0, a1) === a0 ? a0 : a1, a1: Math.min(a0, a1) === a0 ? a1 : a0 })
    }
    cand.sort((u, v) => v.R - u.R)
    const kept: typeof cand = [], da = (u: number, v: number) => { let t = Math.abs(u - v) % (Math.PI * 2); if (t > Math.PI) t = Math.PI * 2 - t; return t }
    for (const c of cand) {
      if (kept.some(o => Math.hypot(o.cx - c.cx, o.cy - c.cy) < 1.5 && ((da(o.a0, c.a0) < 0.15 && da(o.a1, c.a1) < 0.15) || (da(o.a0, c.a1) < 0.15 && da(o.a1, c.a0) < 0.15)))) dropArc.add(c.p)
      else kept.push(c)
    }
  }
  const roleCol = (_l: string) => '#000000' // bản in của công ty: nét đen
  // MỘT hatch đặc lớn thường gồm nhiều "đảo" rời nhau (mỗi mảng tường / tường chéo là một đảo, có lỗ bên trong).
  // Người đọc nhìn từng mảng → tách hatch lớn (> 3 m) thành từng đảo (vòng ngoài + các lỗ của nó) rồi xét riêng từng mảng.
  {
    const ar = (lp: Pt[]) => { let a = 0; for (let i = 0; i + 1 < lp.length; i++) a += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1]; return Math.abs(a) / 2 }
    const inP = (pt: Pt, lp: Pt[]) => { let c = false; for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) if ((lp[i][1] > pt[1]) !== (lp[j][1] > pt[1]) && pt[0] < ((lp[j][0] - lp[i][0]) * (pt[1] - lp[i][1])) / (lp[j][1] - lp[i][1]) + lp[i][0]) c = !c; return c }
    for (let i = paths.length - 1; i >= 0; i--) {
      const p = paths[i]; if (!p.hatch || !p.loops || p.loops.length < 2) continue
      let bx0 = 1e18, by0 = 1e18, bx1 = -1e18, by1 = -1e18; for (const lp of p.loops) for (const t of lp) { bx0 = Math.min(bx0, t[0]); bx1 = Math.max(bx1, t[0]); by0 = Math.min(by0, t[1]); by1 = Math.max(by1, t[1]) }
      if (Math.max(bx1 - bx0, by1 - by0) * mmU < 3000) continue   // cột nhỏ (vd ký hiệu chéo 4 tam giác) giữ nguyên
      const A = p.loops.map(ar), dep = p.loops.map((lp, a) => p.loops!.reduce((n, o, b) => n + (b !== a && A[b] > A[a] && inP(lp[0], o) ? 1 : 0), 0))
      const isl: Path[] = []
      p.loops.forEach((lp, a) => { if (dep[a] % 2) return
        const holes = p.loops!.filter((h, b) => dep[b] === dep[a] + 1 && inP(h[0], lp))
        isl.push({ ...p, pts: lp, loops: [lp, ...holes], isl: true }) })
      if (isl.length > 1) paths.splice(i, 1, ...isl)
    }
  }
  for (const p of paths) {
    if (dropArc.has(p) || /defpoints/i.test(p.layer) || p.pts.every(t => t[0] < x0 || t[0] > x1 || t[1] < y0 || t[1] > y1)) continue
    const pts: number[] = []
    for (const t of p.pts) pts.push(X(t[0]), Y(t[1]))
    if (p.hatch && p.loops) {
      { // hatch phủ gần cả bản vẽ (vùng nền/ranh giới lớn) không phải thân tường → bỏ
        // diện tích THỰC (even-odd): vòng nằm trong vòng khác thì trừ đi (vòng tường bao quanh toàn nhà có lỗ rất lớn, chỉ là dải mỏng)
        const L2 = p.loops.map(lp => lp.map(t => [X(t[0]), Y(t[1])] as Pt)), ar2 = (lp: Pt[]) => { let a = 0; for (let i = 0; i + 1 < lp.length; i++) a += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1]; return Math.abs(a) / 2 }
        const inPoly = (pt: Pt, lp: Pt[]) => { let c = false; for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) if ((lp[i][1] > pt[1]) !== (lp[j][1] > pt[1]) && pt[0] < ((lp[j][0] - lp[i][0]) * (pt[1] - lp[i][1])) / (lp[j][1] - lp[i][1]) + lp[i][0]) c = !c; return c }
        const areas = L2.map(ar2); let tot = 0
        L2.forEach((lp, i) => { let depth = 0; L2.forEach((o, j) => { if (j !== i && areas[j] > areas[i] && inPoly(lp[0], o)) depth++ }); tot += depth % 2 ? 0 : areas[i]; if (depth % 2) tot -= areas[i] })
        tot = Math.max(0, tot)
        if (tot > 0.04 * W * H) continue
      }
      if (opt.draw) { let d = ''; for (const lp of p.loops) { lp.forEach((t, i) => { d += (i ? 'L' : 'M') + f2(X(t[0])) + ' ' + f2(Y(t[1])) }); d += 'Z' } // phân loại: cột = một vòng đơn, cạnh 0,15–1,6 m, gần vuông/tròn; còn lại (dải dài, vòng tường, lõi) = tường
        const ar3 = (lp: Pt[]) => { let a = 0; for (let i = 0; i + 1 < lp.length; i++) a += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1]; return Math.abs(a) / 2 }
        const LP = p.loops.map(lp => lp.map(t => [X(t[0]), Y(t[1])] as Pt))
        let bx0 = 1e18, by0 = 1e18, bx1 = -1e18, by1 = -1e18, sumA = 0; for (const lp of LP) { sumA += ar3(lp); for (const t of lp) { bx0 = Math.min(bx0, t[0]); bx1 = Math.max(bx1, t[0]); by0 = Math.min(by0, t[1]); by1 = Math.max(by1, t[1]) } }
        const mPt = (PT_MM * den) / 1000, wm = (bx1 - bx0) * mPt, hm = (by1 - by0) * mPt
        // cột có thể gồm 4 tam giác (ký hiệu chéo X): gộp tất cả vòng; cột vuông/tròn lấp đầy khung bao ≥ 0,7, mẩu tường chữ T/L thì thấp hơn
        const fillR = sumA / Math.max(1e-6, (bx1 - bx0) * (by1 - by0))
        const isCol = p.loops.length <= 8 && Math.min(wm, hm) >= 0.25 && Math.max(wm, hm) <= 1.6 && Math.max(wm, hm) / Math.max(0.01, Math.min(wm, hm)) <= 1.8 && fillR >= 0.7
        if (isCol) nCol++; else nWall++
        hatchRuns.push({ cls: clsOf(p.layer, 0, true), fc: '#d0d0d0', lw: 0, d, eo: true, hp: true, rl: isCol ? 'col' : 'wall', ...(p.isl ? { sure: true } : {}) }) }
      continue
    }
    // tường vẽ bằng đường bao kín (không có hatch): vòng mảnh (bề dày ≤ 0,5 m) trên layer tường → coi là thân tường, tô như hatch
    if (opt.draw && p.closed && !p.fill && /tuong|wall/i.test(p.layer) && !ZONE_LAYER.test(p.layer) && !DOOR_LAYER.test(p.layer) && pts.length >= 8) {
      let a = 0, per = 0; for (let i = 0; i + 3 < pts.length; i += 2) { a += pts[i] * pts[i + 3] - pts[i + 2] * pts[i + 1]; per += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]) }
      a = Math.abs(a) / 2; const mPt = (PT_MM * den) / 1000
      if (a > 0 && (2 * a) / per * mPt <= 0.5 && a < 0.04 * W * H) { let d = ''; for (let i = 0; i < pts.length; i += 2) d += (i ? 'L' : 'M') + f2(pts[i]) + ' ' + f2(pts[i + 1]); nWall++; hatchRuns.push({ cls: clsOf(p.layer, 0, true), fc: '#d0d0d0', lw: 0, d: d + 'Z', eo: true, hp: true, rl: 'wall' }) }
    }
    // bỏ nét trùng hệt (cùng một đường được vẽ nhiều lần / nhiều xref)
    const pk = pts.length <= 40 ? Array.from(pts, v => Math.round(v * 20)).join(',') : ''
    if (pk) { const rk = Array.from(pts.length > 4 ? [] : [pts[2], pts[3], pts[0], pts[1]], v => Math.round(v * 20)).join(','); if (seenP.has(pk) || (rk && seenP.has(rk))) continue; seenP.add(pk) }
    // độ dày nét in đúng theo bảng nét in của công ty (theo màu AutoCAD hiệu lực)
    const aci = p.color ?? layers[p.layer]?.color ?? 7
    const lwPt = Math.max(0.1, ((CTB_LW[aci - 1] ?? 0.09) / PT_MM) * 0.5)
    const ci = clsOf(p.layer, lwPt, false), c = classes[ci]
    const isZone = ZONE_LAYER.test(p.layer)
    if (p.closed && isZone && pts.length >= 6) zones.push({ layer: p.layer, pts })
    if (isZone) continue // ranh giới không gian chỉ để tính diện tích, không vẽ lên mặt bằng
    const arc = asArc(pts); if (arc && arcs.length < 20000) { allArcs.push(arc); if (DOOR_LAYER.test(p.layer)) arcs.push(arc) }
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const L = Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]); if (L < 0.05) continue
      const a = Math.round(pts[i] * 20) + ',' + Math.round(pts[i + 1] * 20), b = Math.round(pts[i + 2] * 20) + ',' + Math.round(pts[i + 3] * 20), k2 = a < b ? a + '|' + b : b + '|' + a
      if (seenS.has(k2)) continue; seenS.add(k2)
      segs.push(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); segCls.push(ci); c.len += L; c.n++
    }
    if (p.fill && pts.length >= 6) { const fi = clsOf(p.layer, 0, true); fills.push({ cls: fi, pts: new Float32Array(pts) }); classes[fi].n++; classes[fi].len += pts.length / 2 }
    if (opt.draw) {
      const col = roleCol(p.layer)
      let d = 'M' + f2(pts[0]) + ' ' + f2(pts[1]); for (let i = 2; i < pts.length; i += 2) d += 'L' + f2(pts[i]) + ' ' + f2(pts[i + 1]); if (p.closed) d += 'Z'
      const last = runs[runs.length - 1]
      if (last && last.cls === ci && last.sc === col && last.fc === (p.fill ? col : undefined) && last.d.length < 150000) last.d += d
      else runs.push({ cls: ci, sc: col, fc: p.fill ? col : undefined, lw: lwPt, d })
    }
  }
  const seenT = new Set<string>()
  const texts: VecText[] = rawT.filter(t => { const tk = t.t + '|' + Math.round(t.x / (4 * k)) + '|' + Math.round(t.y / (4 * k)); if (seenT.has(tk)) return false; seenT.add(tk); return true }).filter(t => t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1).map(t => ({ t: t.t, x: X(t.x), y: Y(t.y), h: Math.max(1, t.h / k), rot: Math.round(-t.rot * 10) / 10, ly: t.ly }))
  if (arcs.length < 8) arcs.splice(0, arcs.length, ...allArcs) // file không đặt layer cửa rõ ràng → dò theo hình học như PDF
  onLog?.(`  DXF: ${nWall} khối tường + ${nCol} cột (hatch), ${arcs.length} cung cửa; ${segs.length / 4} đoạn nét, ${classes.length} nhóm layer/nét, ${texts.length} chữ, đơn vị ${unit}, tỉ lệ 1:${den}`)
  // đồ nội thất rời: khối INSERT (có tên) + cụm nét rời trên layer nội thất (gom các nét chạm nhau)
  const furn: FurnRaw[] = []
  {
    const mPt = (PT_MM * den) / 1000, mU = mmU / 1000   // m / pt, m / đơn vị bản vẽ
    const ok = (wm: number, dm: number) => Math.min(wm, dm) >= 0.12 && Math.max(wm, dm) <= 8 && wm * dm <= 40
    for (const it of insts) { const wm = it.w * mU, dm = it.d * mU; if (!ok(wm, dm) || it.cx < x0 || it.cx > x1 || it.cy < y0 || it.cy > y1) continue
      furn.push({ name: it.name, layer: it.layer, cx: X(it.cx), cy: Y(it.cy), w: wm / mPt, d: dm / mPt, rot: -it.rot, src: 'block' }) }
    const tol = 0.03 / mU, L = loose.slice(0, 20000), par = L.map((_, i) => i), find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])))
    const order = L.map((_, i) => i).sort((a, b) => L[a].x0 - L[b].x0)
    for (let ai = 0; ai < order.length; ai++) { const a = L[order[ai]]; for (let bi = ai + 1; bi < order.length; bi++) { const b = L[order[bi]]; if (b.x0 > a.x1 + tol) break
      if (b.y0 <= a.y1 + tol && b.y1 >= a.y0 - tol) par[find(order[bi])] = find(order[ai]) } }
    const cl = new Map<number, { x0: number; y0: number; x1: number; y1: number; layer: string }>()
    L.forEach((b, i) => { const r = find(i), c = cl.get(r); if (!c) cl.set(r, { ...b }); else { c.x0 = Math.min(c.x0, b.x0); c.y0 = Math.min(c.y0, b.y0); c.x1 = Math.max(c.x1, b.x1); c.y1 = Math.max(c.y1, b.y1) } })
    for (const c of cl.values()) { const wm = (c.x1 - c.x0) * mU, dm = (c.y1 - c.y0) * mU, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2
      if (!ok(wm, dm) || cx < x0 || cx > x1 || cy < y0 || cy > y1) continue
      furn.push({ name: '', layer: c.layer, cx: X(cx), cy: Y(cy), w: wm / mPt, d: dm / mPt, rot: 0, src: 'loose' }) }
  }
  // vật thể nhận từ khối (cửa 1/2 cánh, vách kính, thang…) → toạ độ trang (pt, y xuống)
  const P = (q?: Pt): [number, number] | undefined => (q ? [X(q[0]), Y(q[1])] : undefined)
  const objs = classifyBlocks(blk, mmU).filter(o => o.cx >= x0 && o.cx <= x1 && o.cy >= y0 && o.cy <= y1)
    .map(o => ({ ...o, cx: X(o.cx), cy: Y(o.cy), w: o.w / k, d: o.d / k, t: o.t !== undefined ? o.t / k : undefined, rot: -o.rot, H1: P(o.H1), H2: P(o.H2), O: P(o.O) }))
  if (objs.length) onLog?.(`  Khối nhận được: ${Object.entries(objs.reduce((a: Record<string, number>, o) => { a[o.kind] = (a[o.kind] ?? 0) + 1; return a }, {})).map(([kk, n]) => `${n} ${OBJ_VN[kk] ?? kk}`).join(', ')}`)
  return { ...(opt.draw ? { draw: [...hatchRuns, ...runs] } : {}), objs, furn, arcs, w: W, h: H, segs: new Float32Array(segs), cls: new Uint16Array(segCls), fills, classes, texts, nSeg: segs.length / 4, zones, dxf: { unit, mmPerUnit: mmU, den, sheets: nSheets, extentM: [(x1 - x0) * mmU / 1000, (y1 - y0) * mmU / 1000] } }
}

/** Ảnh xem trước từ DXF (JPEG) */
export async function renderDxfPreview(data: ArrayBuffer, longEdge = 2000): Promise<{ blob: Blob; width: number; height: number }> {
  const v = await readDxfPage(data, undefined, { draw: true })
  const sc = longEdge / Math.max(v.w, v.h), c = document.createElement('canvas'); c.width = Math.round(v.w * sc); c.height = Math.round(v.h * sc)
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(sc, 0, 0, sc, 0, 0); g.lineJoin = g.lineCap = 'round'
  for (const r of v.draw ?? []) { const p = new Path2D(r.d); if (r.fc) { g.fillStyle = r.fc; g.fill(p, r.eo ? 'evenodd' : 'nonzero') } if (r.sc) { g.strokeStyle = r.sc; g.lineWidth = Math.max(r.lw, 0.18); g.stroke(p) } }
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Không tạo được ảnh'))), 'image/jpeg', 0.85))
  return { blob, width: c.width, height: c.height }
}

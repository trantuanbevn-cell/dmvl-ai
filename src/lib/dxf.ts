// Đọc bản vẽ DXF (AutoCAD) → cùng cấu trúc VecPage như PDF: layer thật, cung/cửa thật, đơn vị thật. Không dùng AI.
import DxfParser from 'dxf-parser'
import { asArc, type VecPage, type VecClass, type VecText, type DrawRun } from './vector'
import { PT_MM, STD_DEN } from './dims'
import { CTB_LW } from './ctbDefault'

/** File có phải PDF không (nếu không → coi là DXF) */
export const isPdfBuf = (b: ArrayBuffer) => { const u = new Uint8Array(b, 0, Math.min(1024, b.byteLength)); for (let i = 0; i + 4 <= u.length; i++) if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46) return true; return false }

type M = [number, number, number, number, number, number] // x' = a x + c y + e ; y' = b x + d y + f
const mul = (p: M, q: M): M => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]]
const ID: M = [1, 0, 0, 1, 0, 0]
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

function decode(data: ArrayBuffer): string {
  let s = new TextDecoder('utf-8').decode(data)
  if ((s.match(/\uFFFD/g)?.length ?? 0) > 3) s = new TextDecoder('windows-1252').decode(data)
  return s
}

type Pt = [number, number]
type HatchLoop = Pt[]
/** HATCH không có trong dxf-parser → đọc thô từ text DXF: trả về hatch (theo ENTITIES / theo tên block) với các đường biên */
function rawHatches(txt: string): { model: any[]; blocks: Record<string, any[]> } {
  const L = txt.split(/\r?\n/), model: any[] = [], blocks: Record<string, any[]> = {}
  let sec = '', blk = ''
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = L[i].trim(), v = L[i + 1].trim()
    if (c === '0' && v === 'SECTION') { sec = (L[i + 3] ?? '').trim(); continue }
    if (c === '0' && v === 'BLOCK') { for (let j = i + 2; j < Math.min(L.length, i + 40); j += 2) if (L[j].trim() === '2') { blk = L[j + 1].trim(); break } continue }
    if (c === '0' && v === 'ENDBLK') { blk = ''; continue }
    if (c !== '0' || v !== 'HATCH' || (sec !== 'ENTITIES' && sec !== 'BLOCKS')) continue
    let j = i + 2, layer = '0', solid = 0, pat = ''
    const loops: HatchLoop[] = []
    let cur: HatchLoop | null = null, mode: 'poly' | 'edge' | '' = '', edge = 0, nv = 0, bul = 0
    const pts: number[][] = []
    let edges: Pt[][] = []
    const flush = () => {
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
      if (cc === 8) layer = vv; else if (cc === 70 && !pat) solid = +vv; else if (cc === 2) pat = vv
      else if (cc === 92) { flush(); cur = []; mode = (+vv & 2) ? 'poly' : 'edge'; edge = 0; nv = 0; pts.length = 0 }
      else if (cur && mode === 'poly') {
        if (cc === 72) bul = +vv
        else if (cc === 10) cur.push([+vv, 0])
        else if (cc === 20 && cur.length) cur[cur.length - 1][1] = +vv
      } else if (cur && mode === 'edge') {
        if (cc === 72) { edge = +vv; pts.length = 0 }
        else if (edge === 1) { if (cc === 10) pts[0] = [+vv, 0]; else if (cc === 20 && pts[0]) pts[0][1] = +vv; else if (cc === 11) pts[1] = [+vv, 0]; else if (cc === 21 && pts[1]) { pts[1][1] = +vv; edges.push([pts[0] as Pt, pts[1] as Pt]); pts.length = 0 } }
        else if (edge === 2) { if (cc === 10) pts[0] = [+vv, 0]; else if (cc === 20 && pts[0]) pts[0][1] = +vv; else if (cc === 40) pts[1] = [+vv, 0]; else if (cc === 50) pts[2] = [+vv, 0]; else if (cc === 51) pts[3] = [+vv, 0]; else if (cc === 73 && pts[0] && pts[1] && pts[2] && pts[3]) {
          const r = pts[1][0], a0 = (pts[2][0] * Math.PI) / 180; let a1 = (pts[3][0] * Math.PI) / 180; const ccw = +vv !== 0
          if (!ccw) { const t0 = a0, t1 = a1; ; void t0; void t1 }
          let sw = ccw ? a1 - a0 : a0 - a1; while (sw <= 0) sw += Math.PI * 2; a1 = ccw ? a0 + sw : a0 - sw
          const n = Math.max(2, Math.ceil(sw / (Math.PI / 18)))
          const ar: Pt[] = []; for (let k = 0; k <= n; k++) ar.push([pts[0][0] + r * Math.cos(a0 + ((a1 - a0) * k) / n), pts[0][1] + r * Math.sin(a0 + ((a1 - a0) * k) / n)]); edges.push(ar)
          pts.length = 0 } }
      }
    }
    void bul; void nv
    flush()
    if (loops.length) { const e = { type: 'HATCH', layer, loops, solid, pat }; if (sec === 'ENTITIES') model.push(e); else if (blk) (blocks[blk] ??= []).push(e) }
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

type Path = { pts: Pt[]; layer: string; color?: number; lw?: number; closed?: boolean; fill?: boolean; hatch?: boolean; loops?: Pt[][] }
type Txt = { t: string; x: number; y: number; h: number; rot: number; ly: string }
/** layer nhiễu (đường ống, cơ điện, tâm…) – ẩn đi */
const NOISE = /defpoints|xref- ?ps|(^|\$)(m|p)-|g-impt|a-genm|dwatcopi|fitting|pipe|(^|\$)center$|s-dim|淘宝|balloon|xr_(?!b2)[^$]*plan|net.?khuat|net.?thay|(^|\$)i_thay|(^|\$)defpoints/i
/** layer ranh giới không gian khép kín (có sẵn trong bản vẽ) */
export const ZONE_LAYER = /(^|\$)area$|ranh.?gioi|dien.?tich|room.?bound|space.?bound/i

/** DXF → các đường (toạ độ bản vẽ, đơn vị gốc) + chữ */
function collect(dxf: any, hatches?: ReturnType<typeof rawHatches>): { paths: Path[]; texts: Txt[]; layers: Record<string, { color: number; off: boolean }> } {
  const layers: Record<string, { color: number; off: boolean }> = {}
  for (const [k, l] of Object.entries<any>(dxf.tables?.layer?.layers ?? {})) layers[k] = { color: Math.abs(l.colorIndex ?? l.color ?? 7) || 7, off: l.visible === false || l.frozen === true }
  const blocks: Record<string, any> = dxf.blocks ?? {}
  const paths: Path[] = [], texts: Txt[] = []
  const apT = (m: M, p: Pt): Pt => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
  const walk = (ents: any[], m: M, inherit: { layer?: string; color?: number }, depth: number, paper: boolean) => {
    for (const e of ents) {
      if (!e || (paper !== !!e.inPaperSpace && depth === 0)) continue
      const own = e.layer ?? '0', layer = own === '0' && inherit.layer ? inherit.layer : own
      if (layers[layer]?.off || NOISE.test(layer)) continue
      let color: number | undefined = typeof e.colorIndex === 'number' && e.colorIndex > 0 && e.colorIndex < 256 ? e.colorIndex : undefined
      if (color === undefined && inherit.color) color = inherit.color
      const lw = typeof e.lineweight === 'number' && e.lineweight > 0 ? e.lineweight / 100 : undefined
      const add = (pts: Pt[], closed = false, fill = false) => { if (pts.length >= 2) paths.push({ pts: pts.map(p => apT(m, p)), layer, color, lw, closed, fill }) }
      switch (e.type) {
        case 'HATCH': {
          // chỉ tô hatch của tường/cột/bê tông (nhận theo layer); lấy đường biên ngoài (lớn nhất)
          if (!/hatch|wall|tuong|column|btct|be ?tong/i.test(layer)) break
          const lps = (e.loops as HatchLoop[]).filter(lp => lp.length >= 3).map(lp => [...lp, lp[0]].map(p => apT(m, p)))
          // cột (hatch BTCT): các đường biên con chỉ là nét của mẫu hatch → chỉ lấy biên ngoài; tường/sàn: giữ lỗ (even-odd)
          const ar = (lp: Pt[]) => { let a = 0; for (let i = 0; i + 1 < lp.length; i++) a += lp[i][0] * lp[i + 1][1] - lp[i + 1][0] * lp[i][1]; return Math.abs(a) }
          if (lps.length) { const use = /column|btct/i.test(layer + ' ' + (e.pat ?? '')) ? [lps.reduce((b, l) => (ar(l) > ar(b) ? l : b))] : lps; paths.push({ pts: use[0], layer, closed: true, fill: true, hatch: true, loops: use }) }
          break
        }
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
          for (let i = 0; i <= 36; i++) { const t = s0 + ((s1 - s0) * i) / 36, x = ra * Math.cos(t), y = ra * rt * Math.sin(t); pts.push([c.x + x * Math.cos(rot) - y * Math.sin(rot), c.y + x * Math.sin(rot) + y * Math.cos(rot)]) }
          add(pts); break
        }
        case 'SPLINE': { const src: any[] = e.fitPoints?.length ? e.fitPoints : e.controlPoints ?? []; add(src.map(p => [p.x, p.y] as Pt)); break }
        case 'SOLID': { const v: any[] = e.points ?? []; if (v.length >= 3) { const q = v.map(p => [p.x, p.y] as Pt); if (v.length === 4) [q[2], q[3]] = [q[3], q[2]]; add([...q, q[0]], true, true) } break }
        case 'TEXT': case 'MTEXT': case 'ATTRIB': {
          const p = e.startPoint ?? e.position; const raw = String(e.text ?? ''); const t = cleanMtext(raw)
          if (p && t) { const [x, y] = apT(m, [p.x, p.y]); texts.push({ t, x, y, h: (e.textHeight ?? e.height ?? 1) * Math.hypot(m[0], m[1]), rot: (e.rotation ?? 0) + (Math.atan2(m[1], m[0]) * 180) / Math.PI, ly: layer }) }
          break
        }
        case 'INSERT': {
          const b = blocks[e.name]; if (!b?.entities?.length || depth > 6) break
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, r = ((e.rotation ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
          const bp = b.position ?? { x: 0, y: 0 }
          const ins: M = mul([c * sx, s * sx, -s * sy, c * sy, e.position?.x ?? 0, e.position?.y ?? 0], [1, 0, 0, 1, -bp.x, -bp.y])
          const cols = e.columnCount > 1 || e.rowCount > 1 ? { c: e.columnCount ?? 1, r: e.rowCount ?? 1, dc: e.columnSpacing ?? 0, dr: e.rowSpacing ?? 0 } : { c: 1, r: 1, dc: 0, dr: 0 }
          for (let i = 0; i < Math.min(cols.c, 200); i++) for (let j = 0; j < Math.min(cols.r, 200); j++) walk(b.entities, mul(m, mul([1, 0, 0, 1, i * cols.dc * c - j * cols.dr * s, i * cols.dc * s + j * cols.dr * c], ins)), { layer, color }, depth + 1, paper)
          break
        }
      }
    }
  }
  const ents: any[] = [...(dxf.entities ?? []), ...(hatches?.model ?? [])]
  if (hatches) for (const [n, hs] of Object.entries(hatches.blocks)) if (blocks[n]) blocks[n] = { ...blocks[n], entities: [...(blocks[n].entities ?? []), ...hs] }
  const hasModel = ents.some(e => !e.inPaperSpace)
  walk(ents, ID, {}, 0, !hasModel)
  return { paths, texts, layers }
}

const q = (a: number[], p: number) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] }

export type DxfInfo = { unit: string; mmPerUnit: number; den: number; extentM: [number, number] }

/** DXF → VecPage. Tỉ lệ (den) được chọn theo kích thước bản vẽ thật nên m/pt chính xác tuyệt đối theo đơn vị của file. */
export async function readDxfPage(data: ArrayBuffer, onLog?: (s: string) => void, opt: { draw?: boolean } = {}): Promise<VecPage & { dxf: DxfInfo; zones: { layer: string; pts: number[] }[] }> {
  onLog?.('Đang đọc DXF...')
  const head = new Uint8Array(data, 0, Math.min(22, data.byteLength)); if (String.fromCharCode(...head).startsWith('AutoCAD Binary DXF')) throw new Error('DXF dạng nhị phân – hãy lưu lại ở dạng DXF ASCII (SAVEAS → DXF → "AutoCAD 2018 DXF").')
  let dxf: any
  let hatches: ReturnType<typeof rawHatches> | undefined
  try { const txt = decode(data); dxf = new DxfParser().parseSync(txt); try { hatches = rawHatches(txt) } catch { /* bỏ hatch */ } } catch (e) { throw new Error('Không đọc được DXF: ' + String(e)) }
  const { paths, texts: rawT, layers } = collect(dxf, hatches)
  if (paths.length < 20) throw new Error('DXF gần như không có nét vẽ trong Model space.')
  const xs: number[] = [], ys: number[] = []
  // khung bản vẽ: ưu tiên nét tường / ô diện tích (bản vẽ hay có vật thể lạc rất xa), không có thì lấy mọi nét trừ Defpoints
  const core = /tuong|wall|\$area$/i
  const pick = (f: (l: string) => boolean) => { xs.length = 0; ys.length = 0; for (const p of paths) if (f(p.layer)) for (const pt of p.pts) { xs.push(pt[0]); ys.push(pt[1]) } }
  pick(l => core.test(l) && !/dim/i.test(l)); if (xs.length < 400) pick(l => !/defpoints/i.test(l))
  const insu = +(dxf.header?.$INSUNITS ?? 0)
  let x0 = q(xs, 0.02), x1 = q(xs, 0.98), y0 = q(ys, 0.02), y1 = q(ys, 0.98)
  const mx = (x1 - x0) * 0.25, my = (y1 - y0) * 0.25; x0 -= mx; x1 += mx; y0 -= my; y1 += my
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
  const roleCol = (l: string) => (/tuong|wall|column|(^|[^a-z])cot([^a-z]|$)|be ?tong/i.test(l) ? '#1a1a1a' : /door|cua|window/i.test(l) ? '#4d4d4d' : '#6e6e6e')
  for (const p of paths) {
    if (/defpoints/i.test(p.layer) || p.pts.every(t => t[0] < x0 || t[0] > x1 || t[1] < y0 || t[1] > y1)) continue
    const pts: number[] = []
    for (const t of p.pts) pts.push(X(t[0]), Y(t[1]))
    if (p.hatch && p.loops) {
      if (opt.draw) { let d = ''; for (const lp of p.loops) { lp.forEach((t, i) => { d += (i ? 'L' : 'M') + f2(X(t[0])) + ' ' + f2(Y(t[1])) }); d += 'Z' } hatchRuns.push({ cls: clsOf(p.layer, 0, true), fc: '#c4c4c4', lw: 0, d, eo: true }) }
      continue
    }
    // bỏ nét trùng hệt (cùng một đường được vẽ nhiều lần / nhiều xref)
    const pk = pts.length <= 40 ? Array.from(pts, v => Math.round(v * 20)).join(',') : ''
    if (pk) { const rk = Array.from(pts.length > 4 ? [] : [pts[2], pts[3], pts[0], pts[1]], v => Math.round(v * 20)).join(','); if (seenP.has(pk) || (rk && seenP.has(rk))) continue; seenP.add(pk) }
    // độ dày nét in theo bảng nét in của công ty (theo màu AutoCAD hiệu lực); tường tối thiểu 0,35 mm để dễ nhìn
    const aci = p.color ?? layers[p.layer]?.color ?? 7, wall = /tuong|wall|column|(^|[^a-z])cot([^a-z]|$)|be ?tong/i.test(p.layer)
    const lwPt = Math.max(0.2, ((CTB_LW[aci - 1] ?? 0.09) * (wall ? 0 : 1) + (wall ? Math.max(0.35, CTB_LW[aci - 1] ?? 0.09) : 0)) / PT_MM)
    const ci = clsOf(p.layer, lwPt, false), c = classes[ci]
    const isZone = ZONE_LAYER.test(p.layer)
    if (p.closed && isZone && pts.length >= 6) zones.push({ layer: p.layer, pts })
    if (isZone) continue // ranh giới không gian chỉ để tính diện tích, không vẽ lên mặt bằng
    const arc = asArc(pts); if (arc && arcs.length < 20000) arcs.push(arc)
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
  onLog?.(`  DXF: ${segs.length / 4} đoạn nét, ${classes.length} nhóm layer/nét, ${texts.length} chữ, đơn vị ${unit}, tỉ lệ 1:${den}`)
  return { ...(opt.draw ? { draw: [...hatchRuns, ...runs] } : {}), arcs, w: W, h: H, segs: new Float32Array(segs), cls: new Uint16Array(segCls), fills, classes, texts, nSeg: segs.length / 4, zones, dxf: { unit, mmPerUnit: mmU, den, extentM: [(x1 - x0) * mmU / 1000, (y1 - y0) * mmU / 1000] } }
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

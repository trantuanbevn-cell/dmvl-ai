// Bố cục trang dàn mặt bằng tổng: ô tên + diện tích xếp thẳng hàng ở các cạnh, nét đứt nối tới tâm phòng, không chồng chéo.
import type { FloorGeom, FloorRoom, SheetLayout } from './types'
import { roomPolys } from './cadZones'

// Trang theo tỉ lệ giấy A (1 : √2): in A3 là chuẩn, tối đa A2
export const PW = 1920, PH = 1080
export type Rect = { x: number; y: number; w: number; h: number }
export type Side = 'l' | 'r' | 't' | 'b'
export type Callout = { key: string; roomId: number; en: string; vn: string; area: number; lines: { t: string; bold: boolean; size: number }[]; w: number; h: number; x: number; y: number; ax: number; ay: number; auto: boolean }

export const CW = 214, GAP = 26, TOP = 158, BOT = PH - 44, LEFT = 40, RIGHT = 1880
export const roomKey = (r: FloorRoom) => `${Math.round(r.cx * 1000)},${Math.round(r.cy * 1000)}`

let ctx: CanvasRenderingContext2D | null = null
const FONT = 'Arial, Helvetica, sans-serif'
export const fontOf = (size: number, bold: boolean) => `${bold ? 'bold ' : ''}${size}px ${FONT}`
export function measureFont(font: string, t: string) { ctx ??= document.createElement('canvas').getContext('2d')!; ctx.font = font; return ctx.measureText(t).width }
export function measure(t: string, size: number, bold: boolean) { ctx ??= document.createElement('canvas').getContext('2d')!; ctx.font = fontOf(size, bold); return ctx.measureText(t).width }
function wrap(t: string, size: number, bold: boolean, maxW: number, maxLines: number): string[] {
  const words = t.split(/\s+/).filter(Boolean), out: string[] = []; let cur = ''
  for (const w of words) { const n = cur ? cur + ' ' + w : w; if (measure(n, size, bold) <= maxW || !cur) cur = n; else { out.push(cur); cur = w } }
  if (cur) out.push(cur)
  if (out.length > maxLines) { const keep = out.slice(0, maxLines); keep[maxLines - 1] += '…'; return keep }
  return out
}

/** Điểm "đẹp" nhất trong phòng để đặt đầu nét đứt: điểm bên trong xa mép nhất (tâm thật sự nằm trong phòng, kể cả phòng chữ L) */
export function pole(r: FloorRoom): [number, number] {
  const polys = roomPolys(r)
  const area = (p: number[][]) => Math.abs(p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + q[0] * n[1] - n[0] * q[1] }, 0)) / 2
  const poly = polys.reduce((a, b) => (area(b) > area(a) ? b : a))
  const inside = (x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c }
  const dist = (x: number, y: number) => { let m = 1e9; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)) } return m }
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  let best: [number, number] = [r.cx, r.cy], bd = inside(r.cx, r.cy) ? dist(r.cx, r.cy) * 1.15 : -1   // ưu tiên tâm hình học nếu đã nằm trong phòng
  for (let k = 0; k < 2; k++) {
    const n = 22, sx = (x1 - x0) / n, sy = (y1 - y0) / n
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { const x = x0 + i * sx, y = y0 + j * sy; if (!inside(x, y)) continue; const dd = dist(x, y); if (dd > bd) { bd = dd; best = [x, y] } }
    const wx = (x1 - x0) / 10, wy = (y1 - y0) / 10; x0 = best[0] - wx; x1 = best[0] + wx; y0 = best[1] - wy; y1 = best[1] + wy
  }
  return best
}

export type Spec = { key: string; roomId: number; en: string; vn: string; area: number; u: number; v: number }
export function buildCallout(s: Spec, showVn: boolean): Pick<Callout, 'lines' | 'w' | 'h'> {
  const lines: Callout['lines'] = [], inner = CW - 20
  const main = (s.en || s.vn).toUpperCase()
  wrap(main, 14, true, inner, 2).forEach(t => lines.push({ t, bold: true, size: 14 }))
  if (showVn && s.en && s.vn) wrap(`(${s.vn.toUpperCase()})`, 12, false, inner, 2).forEach(t => lines.push({ t, bold: false, size: 12 }))
  lines.push({ t: `S=${fmtArea(s.area)}m²`, bold: true, size: 14 })
  return { lines, w: CW, h: 18 + lines.reduce((a, l) => a + l.size + 4, 0) }
}
export const fmtArea = (a: number) => (Math.abs(a - Math.round(a)) < 0.05 ? String(Math.round(a)) : a.toFixed(1))

const hit = (a: Rect, b: Rect, pad = 8) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
const HEADER: Rect = { x: 0, y: 0, w: PW, h: 146 }
const inPage = (r: Rect) => r.x >= 12 && r.y >= 12 && r.x + r.w <= PW - 12 && r.y + r.h <= PH - 12

/** Đặt ô vào chỗ trống gần nhất (không chồng ô khác, không đè phần tiêu đề, không ra ngoài trang) */
export function freeSpot(r: Rect, others: Rect[]): Rect {
  const bad = (q: Rect) => !inPage(q) || hit(q, HEADER, 0) || others.some(o => hit(q, o))
  if (!bad(r)) return r
  const offs: [number, number][] = []
  for (let dx = -600; dx <= 600; dx += 6) for (let dy = -500; dy <= 500; dy += 6) offs.push([dx, dy])
  offs.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]))
  for (const [dx, dy] of offs) { const q = { ...r, x: r.x + dx, y: r.y + dy }; if (!bad(q)) return q }
  return r
}
/** Hút thẳng hàng với các ô khác (mép trái/phải/trên/dưới/tâm) trong ngưỡng nhỏ */
export function snapAlign(r: Rect, others: Rect[], th = 10): Rect {
  let { x, y } = r, bx = th + 1, by = th + 1
  for (const o of others) {
    for (const c of [o.x - r.x, o.x + o.w - (r.x + r.w), o.x + o.w / 2 - (r.x + r.w / 2)]) if (Math.abs(c) < Math.abs(bx)) bx = c
    for (const c of [o.y - r.y, o.y + o.h - (r.y + r.h), o.y + o.h / 2 - (r.y + r.h / 2)]) if (Math.abs(c) < Math.abs(by)) by = c
  }
  if (Math.abs(bx) <= th) x = r.x + bx; if (Math.abs(by) <= th) y = r.y + by
  return { ...r, x: Math.round(x), y: Math.round(y) }
}

export type Layout = { plan: Rect; callouts: Callout[] }
/** Bố trí tự động. ar = tỉ lệ rộng/cao của mặt bằng đã cắt. saved: vị trí đã chỉnh tay (khoá ngay từ lần kéo đầu: lưu cả bố cục) */
export function layoutSheet(specs: Spec[], ar: number, sheet: SheetLayout, showVn: boolean): Layout {
  const boxes = specs.map(s => ({ s, ...buildCallout(s, showVn) }))
  const manual = boxes.filter(b => sheet.items[b.s.key]?.x != null)
  const autoB = boxes.filter(b => sheet.items[b.s.key]?.x == null)
  const maxH = Math.max(60, ...boxes.map(b => b.h))
  // 1) chọn cạnh theo khoảng cách tới mép mặt bằng (ưu tiên 2 cột trái/phải như file Canva)
  const fit = (w: number, h: number) => (w / h > ar ? { w: h * ar, h } : { w, h: w / ar })
  const est = fit(RIGHT - LEFT - 2 * (CW + GAP), BOT - TOP)
  const capLR = Math.max(1, Math.floor((BOT - TOP + 8) / (maxH + 8))), capTB = Math.max(1, Math.floor((est.w + 8) / (CW + 8)))
  const cap: Record<Side, number> = { l: capLR, r: capLR, t: capTB, b: capTB }
  const dists = (s: Spec): Record<Side, number> => ({ l: s.u * est.w, r: (1 - s.u) * est.w, t: s.v * est.h * 1.8, b: (1 - s.v) * est.h * 1.8 })
  const sides: Record<Side, typeof boxes> = { l: [], r: [], t: [], b: [] }
  const order = [...autoB].sort((a, b) => Math.min(...Object.values(dists(a.s))) - Math.min(...Object.values(dists(b.s))))
  for (const b of order) { const dd = dists(b.s), pref = (Object.keys(dd) as Side[]).sort((p, q) => dd[p] - dd[q]); const sd = pref.find(k => sides[k].length < cap[k]) ?? pref[0]; sides[sd].push(b) }
  // 2) khung mặt bằng sau khi chừa chỗ cho các cạnh có ô
  const rl = sides.l.length ? CW + GAP : 0, rr = sides.r.length ? CW + GAP : 0, rt = sides.t.length ? maxH + GAP : 0, rb = sides.b.length ? maxH + GAP : 0
  const area: Rect = { x: LEFT + rl, y: TOP + rt, w: RIGHT - LEFT - rl - rr, h: BOT - TOP - rt - rb }
  const f = fit(area.w, area.h)
  let plan: Rect = { x: area.x + (area.w - f.w) / 2, y: area.y + (area.h - f.h) / 2, w: f.w, h: f.h }
  if (sheet.plan && manual.length) plan = sheet.plan
  // 3) xếp thẳng hàng, chia đều dọc/ngang theo thứ tự vị trí tâm phòng (ít cắt nhau nhất)
  const out: Callout[] = []
  const anchorOf = (s: Spec) => { const it = sheet.items[s.key]; return { ax: it?.ax ?? s.u, ay: it?.ay ?? s.v } }
  const mk = (b: (typeof boxes)[number], x: number, y: number, auto: boolean): Callout => { const a = anchorOf(b.s); return { key: b.s.key, roomId: b.s.roomId, en: b.s.en, vn: b.s.vn, area: b.s.area, lines: b.lines, w: b.w, h: b.h, x, y, ax: a.ax, ay: a.ay, auto } }
  for (const k of ['l', 'r'] as Side[]) {
    const list = sides[k].sort((a, b) => anchorOf(a.s).ay - anchorOf(b.s).ay), n = list.length; if (!n) continue
    const pitch = Math.max(maxH + 8, Math.min(plan.h / n, maxH + 60)), span = pitch * n
    const start = Math.max(TOP, Math.min(plan.y + plan.h / 2 - span / 2, BOT - span))
    list.forEach((b, i) => out.push(mk(b, k === 'l' ? LEFT : RIGHT - CW, Math.round(start + i * pitch + (pitch - b.h) / 2), true)))
  }
  for (const k of ['t', 'b'] as Side[]) {
    const list = sides[k].sort((a, b) => anchorOf(a.s).ax - anchorOf(b.s).ax), n = list.length; if (!n) continue
    const pitch = Math.max(CW + 10, Math.min(plan.w / n, CW + 80)), span = pitch * n
    const start = Math.max(LEFT, Math.min(plan.x + plan.w / 2 - span / 2, RIGHT - span))
    list.forEach((b, i) => out.push(mk(b, Math.round(start + i * pitch + (pitch - CW) / 2), k === 't' ? TOP : BOT - b.h, true)))
  }
  for (const b of manual) { const it = sheet.items[b.s.key]; out.push(mk(b, it.x!, it.y!, false)) }
  // 4) bảo đảm không chồng nhau (ô mới thêm sau khi đã chỉnh tay sẽ tự tìm chỗ trống)
  const placed: Rect[] = out.filter(c => !c.auto).map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
  for (const c of out) if (c.auto) { const r = freeSpot({ x: c.x, y: c.y, w: c.w, h: c.h }, placed); c.x = r.x; c.y = r.y; placed.push(r) }
  return { plan, callouts: out }
}

/** Đường nét đứt: ra khỏi cạnh ô gần phòng nhất, đi ngang/dọc vuông góc tới điểm trong phòng */
export function leader(c: Rect, ax: number, ay: number): string {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2
  if (ax >= c.x + c.w) return `M${c.x + c.w},${cy} H${ax} V${ay}`
  if (ax <= c.x) return `M${c.x},${cy} H${ax} V${ay}`
  if (ay >= c.y + c.h) return `M${cx},${c.y + c.h} V${ay} H${ax}`
  return `M${cx},${c.y} V${ay} H${ax}`
}
export type { FloorGeom }

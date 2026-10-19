// Soạn mặt bằng & dựng 3D: nhập DXF → sửa tường · cột · cửa trên mặt bằng → xem 3D. (Thử nghiệm, chỉ admin.)
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readDxfPage } from '../lib/dxf'
import type { VecPage } from '../lib/vector'
import { LinesCanvas } from './PlanView'
import Scene3D from './Scene3D'
import LibraryBrowser from './LibraryBrowser'
import { DoorElevSection, DoorPlanSection, WallLayerSection } from './Sections'
import { COL_LIB, DOOR_LIB, FINISHES, WALL_TYPES, doorSpec, finishOf, type DoorSpec, type Finish } from '../lib/plan3d/library'
import { WALL_KINDS, autoRooms, centerline, centroid, doorRect, floodRoom, footprint, inside, kindOf, modelFromVec, polyArea, snapToWall, uid, type Dim, type Door, type Furn, type Model, type Pt, type Room, type Wall } from '../lib/plan3d/model'
import { FURN_TYPES, furnTypeOf } from '../lib/plan3d/furn'

type Box = { x: number; y: number; w: number; h: number }
type Tool = 'select' | 'wall' | 'dim' | 'room' | 'roomPoly' | 'door' | 'col' | 'furn'
type Sel = { t: 'wall' | 'door' | 'room' | 'dim' | 'furn'; id: string } | null
const KEY = 'plan3d-model-v1'
const ringPath = (r: Pt[]) => 'M' + r.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z'

const WallPath = memo(function WallPath({ w, sel, onDown }: { w: Wall; sel: boolean; onDown: (e: React.PointerEvent, w: Wall) => void }) {
  const d = useMemo(() => footprint(w).map(ringPath).join(''), [w])
  const k = kindOf(w.kind)
  return <path d={d} fill={k.color} fillOpacity={k.glass ? 0.55 : 0.92} fillRule="evenodd" stroke={sel ? '#e07000' : '#222'} strokeWidth={sel ? 2.4 : 1} vectorEffect="non-scaling-stroke" onPointerDown={e => onDown(e, w)} style={{ cursor: 'pointer' }} />
})

function DoorGlyph({ d, sel, onDown }: { d: Door; sel: boolean; onDown: (e: React.PointerEvent, d: Door) => void }) {
  const ux = Math.cos(d.ang), uy = Math.sin(d.ang), s = d.flip ? -1 : 1
  const P = (a: number, b: number) => [d.x + ux * a - uy * b * s, d.y + uy * a + ux * b * s] as Pt
  const r = doorRect(d, 0.3), swing = d.kind === 'door' || d.kind === 'double'
  const arcs: string[] = []
  const arc = (hx: number, dir: number) => { const h = P(hx, 0), t = P(hx + dir * d.w / (d.kind === 'double' ? 2 : 1), 0), f = P(hx, d.w / (d.kind === 'double' ? 2 : 1)); return `M${h[0]} ${h[1]}L${f[0]} ${f[1]}M${f[0]} ${f[1]}A${d.w / (d.kind === 'double' ? 2 : 1)} ${d.w / (d.kind === 'double' ? 2 : 1)} 0 0 ${(dir > 0 ? 0 : 1) ^ (s < 0 ? 1 : 0)} ${t[0]} ${t[1]}` }
  if (swing) { if (d.kind === 'double') { arcs.push(arc(-d.w / 2, 1)); arcs.push(arc(d.w / 2, -1)) } else arcs.push(arc(-d.w / 2, 1)) }
  const win = d.kind === 'window' || d.kind === 'slide'
  const a = P(-d.w / 2, 0), b = P(d.w / 2, 0)
  return <g onPointerDown={e => onDown(e, d)} style={{ cursor: 'move' }}>
    <path d={ringPath(r)} fill="#fff" fillOpacity={0.95} stroke={sel ? '#e07000' : '#1e5ac8'} strokeWidth={sel ? 2.4 : 1.2} vectorEffect="non-scaling-stroke" />
    {win && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#1e5ac8" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
    {arcs.map((p, i) => <path key={i} d={p} fill="none" stroke="#1e5ac8" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />)}
  </g>
}

const fmtLen = (L: number, mm: boolean) => mm ? Math.round(L * 1000).toString() : L.toFixed(2) + ' m'
/** tick chia tấm kính trên mặt bằng 2D */
function GlassTicks({ w, panel }: { w: Wall; panel: number }) {
  if (w.shape.type !== 'seg') return null
  const { a, b, t } = w.shape, L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) return null
  const n = Math.max(1, Math.round(L / Math.max(0.2, panel))), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, h = Math.max(t, 0.08) / 2 + 0.03
  let d = ''; for (let i = 0; i <= n; i++) { const x = a[0] + ux * L * i / n, y = a[1] + uy * L * i / n; d += `M${x - uy * h} ${y + ux * h}L${x + uy * h} ${y - ux * h}` }
  return <path d={d} stroke="#0b6a85" strokeWidth={1.2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
}
function FurnGlyph({ f, sel, onDown }: { f: Furn; sel: boolean; onDown: (e: React.PointerEvent, f: Furn) => void }) {
  const t = furnTypeOf(f.kind), bk = t.back ? Math.min(t.backT ?? 0.1, f.d * 0.5) : 0
  return <g transform={`translate(${f.x} ${f.y}) rotate(${f.ang * 180 / Math.PI})`} onPointerDown={e => onDown(e, f)} style={{ cursor: 'move' }}>
    {t.shape === 'round' ? <ellipse rx={f.w / 2} ry={f.d / 2} fill={t.color} fillOpacity={0.5} stroke={sel ? '#e07000' : '#7a5c3a'} strokeWidth={sel ? 2.2 : 1} vectorEffect="non-scaling-stroke" />
      : <rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} fill={t.color} fillOpacity={0.5} stroke={sel ? '#e07000' : '#7a5c3a'} strokeWidth={sel ? 2.2 : 1} vectorEffect="non-scaling-stroke" />}
    {bk > 0 && <rect x={-f.w / 2} y={f.flip ? f.d / 2 - bk : -f.d / 2} width={f.w} height={bk} fill="#5a4630" fillOpacity={0.75} style={{ pointerEvents: 'none' }} />}
  </g>
}

function DimGlyph({ d, sel, fs, mm = false, onDown }: { d: Dim; sel: boolean; fs: number; mm?: boolean; onDown: (e: React.PointerEvent, d: Dim) => void }) {
  const dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * d.off, ny = ux * d.off
  const a: Pt = [d.a[0] + nx, d.a[1] + ny], b: Pt = [d.b[0] + nx, d.b[1] + ny], m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ang = Math.atan2(dy, dx) * 180 / Math.PI, flip = ang > 90 || ang < -90
  const c = sel ? '#e07000' : '#c0392b', tk = fs * 0.5
  return <g onPointerDown={e => onDown(e, d)} style={{ cursor: 'pointer' }}>
    <path d={`M${d.a[0]} ${d.a[1]}L${a[0]} ${a[1]}M${d.b[0]} ${d.b[1]}L${b[0]} ${b[1]}M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${a[0] - ux * tk - uy * tk} ${a[1] - uy * tk + ux * tk}L${a[0] + ux * tk + uy * tk} ${a[1] + uy * tk - ux * tk}M${b[0] - ux * tk - uy * tk} ${b[1] - uy * tk + ux * tk}L${b[0] + ux * tk + uy * tk} ${b[1] + uy * tk - ux * tk}`} stroke={c} strokeWidth={sel ? 2 : 1} fill="none" vectorEffect="non-scaling-stroke" />
    <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
    <text x={m[0]} y={m[1]} fontSize={fs} fill={c} textAnchor="middle" transform={`rotate(${flip ? ang + 180 : ang} ${m[0]} ${m[1]}) translate(0 ${-fs * 0.3})`} stroke="#fff" strokeWidth={fs * 0.2} paintOrder="stroke" style={{ userSelect: 'none' }}>{d.txt ?? fmtLen(L, mm)}</text></g>
}

export default function Plan3D() {
  const [M, setM] = useState<Model | null>(() => { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) as Model : null } catch { return null } })
  const [base, setBase] = useState<VecPage | null>(null)
  const [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [tool, setTool] = useState<Tool>('select'), [sel, setSel] = useState<Sel>(null)
  const [mode, setMode] = useState<'2d' | '3d'>('2d'), [view3, setView3] = useState(0)
  const [ortho, setOrtho] = useState(true), [under, setUnder] = useState(true), [showFurn, setShowFurn] = useState(true), [libFurn, setLibFurn] = useState('chair'), [dimMm, setDimMm] = useState(true), [newPanel, setNewPanel] = useState(1.2)
  const hist = useRef<Model[]>([]), [nh, setNh] = useState(0)
  const [vb, setVb] = useState<Box>({ x: 0, y: 0, w: 100, h: 60 }), [size, setSize] = useState({ w: 0, h: 0 })
  const box = useRef<HTMLDivElement>(null), drag = useRef<any>(null)
  const ls = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
  const [custom, setCustom] = useState<Finish[]>(() => ls('plan3d-custom-finishes', [])), [customDoors, setCustomDoors] = useState<DoorSpec[]>(() => ls('plan3d-custom-doors', []))
  useEffect(() => { try { localStorage.setItem('plan3d-custom-finishes', JSON.stringify(custom)) } catch { setErr('Ảnh vật liệu quá nặng, không lưu thêm được trong trình duyệt.') } }, [custom])
  useEffect(() => { try { localStorage.setItem('plan3d-custom-doors', JSON.stringify(customDoors)) } catch { /* bỏ */ } }, [customDoors])
  const [libDoor, setLibDoor] = useState('dr-flush09'), [libCol, setLibCol] = useState('cl-r40'), [newKind, setNewKind] = useState('brick'), [showLib, setShowLib] = useState(false), [ceiling, setCeiling] = useState(false)
  const [pending, setPending] = useState<Pt | null>(null), [cursor, setCursor] = useState<Pt | null>(null), [pts, setPts] = useState<Pt[]>([])

  const commit = useCallback((n: Model, push = true) => { setM(cur => { if (push && cur) { hist.current.push(cur); if (hist.current.length > 60) hist.current.shift(); setNh(hist.current.length) } return n }) }, [])
  const undo = useCallback(() => { const p = hist.current.pop(); setNh(hist.current.length); if (p) { setM(p); setSel(null) } }, [])
  useEffect(() => { if (!M) return; const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(M)) } catch { /* quá dung lượng */ } }, 600); return () => clearTimeout(t) }, [M])

  const fit = useCallback((m: Model, sz: { w: number; h: number }) => { const a = sz.h / Math.max(1, sz.w), w = m.w * 1.02, h = Math.max(m.h * 1.02, w * a); setVb({ x: 0, y: 0, w: h / a, h }) }, [])
  useEffect(() => { const e = box.current; if (!e) return; const ro = new ResizeObserver(() => setSize({ w: e.clientWidth, h: e.clientHeight })); ro.observe(e); setSize({ w: e.clientWidth, h: e.clientHeight }); return () => ro.disconnect() }, [mode, M !== null])
  const fitted = useRef(false)
  useEffect(() => { if (M && size.w && !fitted.current) { fitted.current = true; fit(M, size) } }, [M, size, fit])
  // giữ đúng tỉ lệ khung khi cửa sổ đổi cỡ
  useEffect(() => { if (size.w && size.h) setVb(v => ({ ...v, h: v.w * size.h / size.w })) }, [size])

  const load = async (f: File) => {
    setErr(''); setBusy('Đang đọc DXF…')
    try {
      const v = await readDxfPage(await f.arrayBuffer(), s => setBusy(s), { draw: true })
      const m = modelFromVec(v, v.dxf.den); hist.current = []; setNh(0); setBase(v); fitted.current = false; setM(m); setSel(null)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const loadJson = async (f: File) => { try { const m = JSON.parse(await f.text()) as Model; if (m.v !== 1) throw new Error('File không đúng định dạng'); hist.current = []; setNh(0); fitted.current = false; setM(m) } catch (e) { setErr((e as Error).message) } }
  const saveJson = () => { if (!M) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(M)], { type: 'application/json' })); a.download = 'mat-bang-3d.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }

  const toModel = (e: { clientX: number; clientY: number }): Pt => { const r = box.current!.getBoundingClientRect(); return [vb.x + (e.clientX - r.left) / r.width * vb.w, vb.y + (e.clientY - r.top) / r.height * vb.h] }
  const snapPt = (p: Pt, from?: Pt | null): Pt => {
    const tol = vb.w / Math.max(300, size.w) * 8
    if (M) for (const w of M.walls) { if (w.role === 'col') continue; const rings: Pt[][] = w.shape.type === 'poly' ? w.shape.rings : [[w.shape.a, w.shape.b]]; for (const r of rings) for (const q of r) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return q }
    if (M) for (const r of M.rooms ?? []) for (const q of r.poly) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < tol) return q
    if (from && ortho) { const dx = p[0] - from[0], dy = p[1] - from[1], a = Math.abs(Math.atan2(dy, dx)); if (Math.abs(dy) < Math.abs(dx) * 0.07) return [p[0], from[1]]; if (Math.abs(dx) < Math.abs(dy) * 0.07) return [from[0], p[1]]; void a }
    return p
  }

  const onWallDown = (e: React.PointerEvent, w: Wall) => {
    if (tool !== 'select') return
    e.stopPropagation(); setSel({ t: 'wall', id: w.id }); drag.current = { k: 'moveWall', id: w.id, p0: toModel(e), orig: w, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onDoorDown = (e: React.PointerEvent, d: Door) => {
    if (tool !== 'select') return
    e.stopPropagation(); setSel({ t: 'door', id: d.id }); drag.current = { k: 'moveDoor', id: d.id, orig: d, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleDown = (e: React.PointerEvent, id: string, ring: number, vi: number) => { e.stopPropagation(); drag.current = { k: 'vertex', id, ring, vi, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onBendDown = (e: React.PointerEvent, id: string) => { e.stopPropagation(); drag.current = { k: 'bend', id, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onDimDown = (e: React.PointerEvent, d: Dim) => { if (tool !== 'select') return; e.stopPropagation(); setSel({ t: 'dim', id: d.id }) }
  const onFurnDown = (e: React.PointerEvent, f: Furn) => { if (tool !== 'select') return; e.stopPropagation(); setSel({ t: 'furn', id: f.id }); drag.current = { k: 'moveFurn', id: f.id, p0: toModel(e), orig: f, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onDimHandle = (e: React.PointerEvent, id: string, k: 'dimA' | 'dimB' | 'dimOff') => { e.stopPropagation(); drag.current = { k, id, orig: (M!.dims ?? []).find(x => x.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onEndDown = (e: React.PointerEvent, id: string, which: 'a' | 'b') => { e.stopPropagation(); drag.current = { k: 'end', id, which, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }

  const onDown = (e: React.PointerEvent) => {
    if (!M) return
    if (e.button === 2) { setPending(null); setPts([]); return }
    const p = toModel(e)
    if (tool === 'wall') {
      const q = snapPt(p, pending)
      if (!pending) { setPending(q); return }
      if (Math.hypot(q[0] - pending[0], q[1] - pending[1]) < 0.05) { setPending(null); return }
      const w: Wall = { id: uid('w'), role: 'wall', kind: newKind, panel: kindOf(newKind).glass ? newPanel : undefined, shape: { type: 'seg', a: pending, b: q, t: kindOf(newKind).t } }
      commit({ ...M, walls: [...M.walls, w] }); setPending(q); return
    }
    if (tool === 'dim') {
      const q = pts.length < 2 ? snapPt(p, pts[0]) : p, n = [...pts, q]
      if (n.length < 3) { setPts(n); return }
      const [a, b] = n, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, off = ((q[0] - a[0]) * -(b[1] - a[1]) + (q[1] - a[1]) * (b[0] - a[0])) / L
      commit({ ...M, dims: [...(M.dims ?? []), { id: uid('m'), a, b, off }] }); setPts([]); return
    }
    if (tool === 'room') {
      const r = floodRoom(M, p)
      if (!r) { setErr('Bấm vào bên trong một không gian (không bấm lên tường).'); return }
      if (r.leaked) { setErr('Không gian chưa kín (tường hở hoặc thiếu cửa/ô trống). Đóng kín rồi bấm lại, hoặc dùng "Phòng (vẽ tay)".'); return }
      setErr(''); const n = (M.rooms ?? []).length + 1, room: Room = { id: uid('r'), name: 'Phòng ' + n, poly: r.poly, area: r.area }
      commit({ ...M, rooms: [...(M.rooms ?? []), room] }); setSel({ t: 'room', id: room.id }); return
    }
    if (tool === 'roomPoly') {
      const q = snapPt(p, pts[pts.length - 1] ?? null)
      if (pts.length >= 3 && Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < vb.w / Math.max(300, size.w) * 10) { closePoly(); return }
      setPts([...pts, q]); return
    }
    if (tool === 'col') {
      const c = COL_LIB.find(x => x.id === libCol)!, q = snapPt(p), hw = c.w / 2, hd = c.d / 2
      const ring: Pt[] = c.shape === 'round' ? Array.from({ length: 24 }, (_, i) => [q[0] + hw * Math.cos(i / 24 * 2 * Math.PI), q[1] + hd * Math.sin(i / 24 * 2 * Math.PI)] as Pt) : [[q[0] - hw, q[1] - hd], [q[0] + hw, q[1] - hd], [q[0] + hw, q[1] + hd], [q[0] - hw, q[1] + hd]]
      const w: Wall = { id: uid('w'), role: 'col', kind: c.kind, finish: c.finish, name: c.name, shape: { type: 'poly', rings: [ring] } }
      commit({ ...M, walls: [...M.walls, w] }); setSel({ t: 'wall', id: w.id }); return
    }
    if (tool === 'furn') {
      const t = furnTypeOf(libFurn), q = snapPt(p), f: Furn = { id: uid('f'), kind: t.key, x: q[0], y: q[1], w: t.w, d: t.d, ang: 0, h: t.h }
      commit({ ...M, furn: [...(M.furn ?? []), f] }); setSel({ t: 'furn', id: f.id }); return
    }
    if (tool === 'door') {
      const sp = doorSpec(libDoor, customDoors) ?? DOOR_LIB[0], sn = snapToWall(M, p, 0.6); if (!sn) { setErr('Bấm sát vào một đoạn tường để đặt cửa.'); return }
      setErr(''); const d: Door = { id: uid('d'), kind: sp.kind, lib: sp.id, x: sn.x, y: sn.y, ang: sn.ang, w: sp.w, h: sp.h, sill: sp.sill }
      commit({ ...M, doors: [...M.doors, d] }); setSel({ t: 'door', id: d.id }); return
    }
    setSel(null); drag.current = { k: 'pan', x: e.clientX, y: e.clientY, vb }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, p = toModel(e); setCursor(p)
    if (!d || !M) return
    if (d.k === 'pan') { const r = box.current!.getBoundingClientRect(), s = d.vb.w / r.width; setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * s, y: d.vb.y - (e.clientY - d.y) * s }); return }
    if (!d.moved) { hist.current.push(M); setNh(hist.current.length); d.moved = true }
    const upd = (f: (w: Wall) => Wall) => setM(cur => cur && { ...cur, walls: cur.walls.map(w => w.id === d.id ? f(d.orig) : w) })
    if (d.k === 'moveWall') { const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1]; upd(w => w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map(r => r.map(q => [q[0] + dx, q[1] + dy] as Pt)) } } : { ...w, shape: { ...w.shape, a: [w.shape.a[0] + dx, w.shape.a[1] + dy], b: [w.shape.b[0] + dx, w.shape.b[1] + dy] } }) }
    else if (d.k === 'vertex') { const q = snapPt(p); upd(w => w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map((r, i) => i === d.ring ? r.map((v, j) => j === d.vi ? q : v) : r) } } : w) }
    else if (d.k === 'end') { const o = d.orig as Wall; if (o.shape.type !== 'seg') return; const other = d.which === 'a' ? o.shape.b : o.shape.a, q = snapPt(p, other); upd(w => w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, [d.which]: q } } : w) }
    else if (d.k === 'roomV') { const q = snapPt(p); setM(cur => cur && { ...cur, rooms: (cur.rooms ?? []).map(r => r.id === d.id ? { ...r, poly: r.poly.map((v, j) => j === d.vi ? q : v), area: undefined } : r) }) }
    else if (d.k === 'bend') { const o = d.orig as Wall; if (o.shape.type !== 'seg') return; const { a, b } = o.shape, c = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / c, ny = (b[0] - a[0]) / c, bu = (p[0] - (a[0] + b[0]) / 2) * nx + (p[1] - (a[1] + b[1]) / 2) * ny; upd(w => w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, bulge: Math.abs(bu) < 0.03 ? undefined : bu } } : w) }
    else if (d.k === 'moveFurn') { const dx = p[0] - d.p0[0], dy = p[1] - d.p0[1]; setM(cur => cur && { ...cur, furn: (cur.furn ?? []).map(x => x.id === d.id ? { ...x, x: d.orig.x + dx, y: d.orig.y + dy } : x) }) }
    else if (d.k === 'dimA' || d.k === 'dimB') { const o = d.orig as Dim, q = snapPt(p, d.k === 'dimA' ? o.b : o.a); setM(cur => cur && { ...cur, dims: (cur.dims ?? []).map(x => x.id === d.id ? { ...x, [d.k === 'dimA' ? 'a' : 'b']: q } : x) }) }
    else if (d.k === 'dimOff') { const o = d.orig as Dim, L = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1, off = ((p[0] - o.a[0]) * -(o.b[1] - o.a[1]) + (p[1] - o.a[1]) * (o.b[0] - o.a[0])) / L; setM(cur => cur && { ...cur, dims: (cur.dims ?? []).map(x => x.id === d.id ? { ...x, off } : x) }) }
    else if (d.k === 'moveDoor') { const s = snapToWall(M, p, 1.2); if (s) setM(cur => cur && { ...cur, doors: cur.doors.map(x => x.id === d.id ? { ...x, x: s.x, y: s.y, ang: s.ang } : x) }) }
  }
  const onUp = () => { drag.current = null }
  const closePoly = () => { if (!M || pts.length < 3) return; const n = (M.rooms ?? []).length + 1, room: Room = { id: uid('r'), name: 'Phòng ' + n, poly: pts }; commit({ ...M, rooms: [...(M.rooms ?? []), room] }); setPts([]); setSel({ t: 'room', id: room.id }) }
  const onDouble = (e: React.MouseEvent) => {
    setPending(null)
    if (tool === 'roomPoly') { return }
    if (tool === 'select' && M && selRoom) { // thêm đỉnh vào cạnh phòng gần nhất
      const p = toModel(e), tol = vb.w / Math.max(300, size.w) * 12; let bi = -1, bq: Pt = [0, 0], bd = tol
      selRoom.poly.forEach((a, i) => { const b = selRoom.poly[(i + 1) % selRoom.poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) return; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; bq = q } })
      if (bi >= 0) setRoom(selRoom.id, { poly: [...selRoom.poly.slice(0, bi + 1), bq, ...selRoom.poly.slice(bi + 1)], area: undefined })
      return
    }
    if (tool === 'select' && M && selWall?.shape.type === 'poly') { // thêm đỉnh vào cạnh gần nhất
      const p = toModel(e), tol = vb.w / Math.max(300, size.w) * 10; let best: { ri: number; i: number; q: Pt } | null = null, bd = tol
      selWall.shape.rings.forEach((r, ri) => r.forEach((a, i) => { const b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) return; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = { ri, i, q } } }))
      const bb = best as { ri: number; i: number; q: Pt } | null
      if (bb) { const sh = selWall.shape; setWall(selWall.id, { shape: { type: 'poly', rings: sh.rings.map((r, ri) => ri === bb.ri ? [...r.slice(0, bb.i + 1), bb.q, ...r.slice(bb.i + 1)] : r) } }) }
    }
  }

  // zoom bằng con lăn (gắn thủ công để chặn cuộn trang)
  useEffect(() => {
    const e = box.current; if (!e) return
    const on = (ev: WheelEvent) => { ev.preventDefault(); const r = e.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height
      setVb(v => { const k = Math.exp(ev.deltaY * 0.0015), nw = Math.min(M ? M.w * 1.5 : 1e4, Math.max(2, v.w * k)), nh = nw * (v.h / v.w); return { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh } }) }
    e.addEventListener('wheel', on, { passive: false }); return () => e.removeEventListener('wheel', on)
  }, [M, mode])
  // phím tắt
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,select,textarea')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if (e.key === 'Escape') { setPending(null); setPts([]); setTool('select'); return }
      if (e.key === 'Enter' && tool === 'roomPoly') { closePoly(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel && M) { e.preventDefault(); dup(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && M) { e.preventDefault(); del() }
    }
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on)
  })
  const del = () => { if (!sel || !M) return; commit(sel.t === 'wall' ? { ...M, walls: M.walls.filter(w => w.id !== sel.id) } : sel.t === 'door' ? { ...M, doors: M.doors.filter(d => d.id !== sel.id) } : sel.t === 'room' ? { ...M, rooms: (M.rooms ?? []).filter(r => r.id !== sel.id) } : sel.t === 'furn' ? { ...M, furn: (M.furn ?? []).filter(f => f.id !== sel.id) } : { ...M, dims: (M.dims ?? []).filter(d => d.id !== sel.id) }); setSel(null) }
  const dup = () => { if (!sel || !M) return; const o = 0.6
    if (sel.t === 'wall') { const w = M.walls.find(x => x.id === sel.id); if (!w) return; const n: Wall = { ...w, id: uid('w'), shape: w.shape.type === 'poly' ? { type: 'poly', rings: w.shape.rings.map(r => r.map(q => [q[0] + o, q[1] + o] as Pt)) } : { ...w.shape, a: [w.shape.a[0] + o, w.shape.a[1] + o], b: [w.shape.b[0] + o, w.shape.b[1] + o] } }; commit({ ...M, walls: [...M.walls, n] }); setSel({ t: 'wall', id: n.id }) }
    else if (sel.t === 'furn') { const f = (M.furn ?? []).find(x => x.id === sel.id); if (!f) return; const n = { ...f, id: uid('f'), auto: false, x: f.x + 0.5, y: f.y + 0.5 }; commit({ ...M, furn: [...(M.furn ?? []), n] }); setSel({ t: 'furn', id: n.id }) }
    else if (sel.t === 'door') { const d = M.doors.find(x => x.id === sel.id); if (!d) return; const n = { ...d, id: uid('d'), x: d.x + Math.cos(d.ang) * (d.w + 0.2), y: d.y + Math.sin(d.ang) * (d.w + 0.2) }; commit({ ...M, doors: [...M.doors, n] }); setSel({ t: 'door', id: n.id }) } }
  const split = () => { if (!M || selWall?.shape.type !== 'seg') return; const sh = selWall.shape, m: Pt = (sh.bulge ? centerline(selWall)[Math.floor(centerline(selWall).length / 2)] : [(sh.a[0] + sh.b[0]) / 2, (sh.a[1] + sh.b[1]) / 2]) as Pt
    const w1: Wall = { ...selWall, id: uid('w'), shape: { ...sh, b: m, bulge: sh.bulge ? sh.bulge / 4 : undefined } }, w2: Wall = { ...selWall, id: uid('w'), shape: { ...sh, a: m, bulge: sh.bulge ? sh.bulge / 4 : undefined } }
    commit({ ...M, walls: [...M.walls.filter(x => x.id !== selWall.id), w1, w2] }); setSel({ t: 'wall', id: w1.id }) }
  const setRoom = (id: string, patch: Partial<Room>) => M && commit({ ...M, rooms: (M.rooms ?? []).map(r => r.id === id ? { ...r, ...patch } : r) })
  const setWall = (id: string, patch: Partial<Wall>) => M && commit({ ...M, walls: M.walls.map(w => w.id === id ? { ...w, ...patch } : w) })
  const setFurn = (id: string, patch: Partial<Furn>) => M && commit({ ...M, furn: (M.furn ?? []).map(f => f.id === id ? { ...f, ...patch } : f) })
  const setDim = (id: string, patch: Partial<Dim>) => M && commit({ ...M, dims: (M.dims ?? []).map(d => d.id === id ? { ...d, ...patch } : d) })
  const runAutoRooms = () => { if (!M) return; setBusy('Đang nhận diện các không gian kín…'); setErr(''); setTimeout(() => { try { const r = autoRooms(M); if (!r) { setErr('Mặt bằng quá lớn để nhận diện tự động.'); setBusy(''); return }
      if (r.rooms.length) commit({ ...M, rooms: [...(M.rooms ?? []), ...r.rooms] }); setBusy(r.rooms.length ? `Đã nhận ${r.rooms.length} không gian (bỏ qua ${r.skipped} vùng nhỏ/đã có). Sửa tên, kéo đỉnh để chỉnh.` : 'Không thấy thêm không gian kín nào – kiểm tra tường hở/thiếu cửa.'); setTimeout(() => setBusy(''), 6000) } catch (e) { setErr((e as Error).message); setBusy('') } }, 30) }
  const dimRoom = (r: Room) => { if (!M) return; const dims: Dim[] = r.poly.map((a, i) => { const b = r.poly[(i + 1) % r.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, mid: Pt = [(a[0] + b[0]) / 2 + nx * 0.2, (a[1] + b[1]) / 2 + ny * 0.2]; return { id: uid('m'), a, b, off: inside(mid, r.poly) ? -0.5 : 0.5 } }).filter(d => Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) >= 0.3); commit({ ...M, dims: [...(M.dims ?? []), ...dims] }) }
  const setDoor = (id: string, patch: Partial<Door>) => M && commit({ ...M, doors: M.doors.map(d => d.id === id ? { ...d, ...patch } : d) })

  const selWall = sel?.t === 'wall' ? M?.walls.find(w => w.id === sel.id) : undefined
  const selDoor = sel?.t === 'door' ? M?.doors.find(d => d.id === sel.id) : undefined
  const vbPt = useMemo(() => M ? { x: vb.x / M.mPt, y: vb.y / M.mPt, w: vb.w / M.mPt, h: vb.h / M.mPt } : vb, [vb, M])
  const hs = vb.w / Math.max(300, size.w) * 5 // bán kính tay nắm theo zoom
  const fsz = vb.w / Math.max(300, size.w) * 12 // cỡ chữ 12 px màn hình
  const selRoom = sel?.t === 'room' ? (M?.rooms ?? []).find(r => r.id === sel.id) : undefined
  const selFurn = sel?.t === 'furn' ? (M?.furn ?? []).find(f => f.id === sel.id) : undefined
  const selDim = sel?.t === 'dim' ? (M?.dims ?? []).find(d => d.id === sel.id) : undefined
  const num = (v: string, d: number) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) ? n : d }
  const segLen = selWall?.shape.type === 'seg' ? Math.hypot(selWall.shape.b[0] - selWall.shape.a[0], selWall.shape.b[1] - selWall.shape.a[1]) : 0

  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <b>Soạn mặt bằng &amp; dựng 3D</b><span className="muted small">– thử nghiệm: nhập DXF, sửa tường · cột · cửa, xem 3D</span>
      <label className="btn sm">Nhập DXF<input type="file" accept=".dxf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} /></label>
      <label className="btn sm">Mở file đã lưu<input type="file" accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadJson(f); e.target.value = '' }} /></label>
      {M && <button className="btn sm" onClick={saveJson}>Lưu file (.json)</button>}
      {busy && <span className="muted small">{busy}</span>}{err && <span style={{ color: '#b00020' }} className="small">{err}</span>}
    </div>
    {!M ? <div className="muted">Nhập file DXF mặt bằng. Phần mềm dựng sẵn hệ tường và cột; bạn sửa tiếp trên mặt bằng rồi xem 3D. Bản sửa tự lưu trong trình duyệt này.</div> : <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <div className="mp-tabs"><button className={'mp-tab' + (mode === '2d' ? ' on' : '')} onClick={() => setMode('2d')}>Mặt bằng 2D</button><button className={'mp-tab' + (mode === '3d' ? ' on' : '')} onClick={() => setMode('3d')}>Xem 3D</button></div>
        {mode === '2d' ? <>
          <button className={'btn sm' + (tool === 'select' ? ' primary' : '')} onClick={() => { setTool('select'); setPending(null); setPts([]) }}>Chọn / kéo</button>
          <button className={'btn sm' + (tool === 'wall' ? ' primary' : '')} onClick={() => { setTool('wall'); setPending(null); setPts([]) }}>＋ Tường</button>
          <button className={'btn sm' + (tool === 'dim' ? ' primary' : '')} onClick={() => { setTool('dim'); setPending(null); setPts([]) }}>📏 Ghi kích thước</button>
          <button className={'btn sm' + (tool === 'room' ? ' primary' : '')} onClick={() => { setTool('room'); setPending(null); setPts([]); setErr('') }}>▣ Phòng (bấm vào trong)</button>
          <button className="btn sm" onClick={runAutoRooms}>⚡ Tự nhận diện tất cả phòng</button>
          <button className={'btn sm' + (tool === 'roomPoly' ? ' primary' : '')} onClick={() => { setTool('roomPoly'); setPending(null); setPts([]) }}>✎ Phòng / đo diện tích (vẽ tay)</button>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><button className={'btn sm' + (tool === 'door' ? ' primary' : '')} onClick={() => { setTool('door'); setPending(null); setPts([]); setErr('') }}>＋ Cửa</button>
            <select value={libDoor} onChange={e => { setLibDoor(e.target.value); setTool('door') }} style={{ maxWidth: 190 }}>{['Cửa đi', 'Cửa kính', 'Cửa sổ', 'Khác'].map(g => <optgroup key={g} label={g}>{[...customDoors, ...DOOR_LIB].filter(d => (customDoors.includes(d) ? g === 'Cửa đi' : d.group === g)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}</select></span>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><button className={'btn sm' + (tool === 'furn' ? ' primary' : '')} onClick={() => { setTool('furn'); setPending(null); setPts([]) }}>＋ Nội thất</button>
            <select value={libFurn} onChange={e => { setLibFurn(e.target.value); setTool('furn') }} style={{ maxWidth: 190 }}>{['Ngồi', 'Bàn', 'Tủ – kệ – quầy', 'Ngủ', 'Vệ sinh', 'Khác'].map(g => <optgroup key={g} label={g}>{FURN_TYPES.filter(t => t.group === g).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}</select></span>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><button className={'btn sm' + (tool === 'col' ? ' primary' : '')} onClick={() => { setTool('col'); setPending(null); setPts([]) }}>＋ Cột</button>
            <select value={libCol} onChange={e => { setLibCol(e.target.value); setTool('col') }} style={{ maxWidth: 160 }}>{COL_LIB.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></span>
          <label className="small">Tường / vách mới: <select value={newKind} onChange={e => { setNewKind(e.target.value); const k = kindOf(e.target.value); if (k.glass && k.panel) setNewPanel(k.panel) }} style={{ maxWidth: 190 }}><optgroup label="Tường">{WALL_KINDS.filter(k => !k.glass).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup><optgroup label="Vách kính">{WALL_KINDS.filter(k => k.glass).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup></select></label>
          {kindOf(newKind).glass && <label className="small">Chia tấm kính mỗi <input style={{ width: 50 }} key={'np' + newPanel} defaultValue={newPanel} onBlur={e => setNewPanel(Math.max(0.3, num(e.target.value, newPanel)))} /> m</label>}
          <label className="small"><input type="checkbox" checked={dimMm} onChange={e => setDimMm(e.target.checked)} /> Dim mm</label>
          <button className={'btn sm' + (showLib ? ' primary' : '')} onClick={() => setShowLib(v => !v)}>📚 Thư viện</button>
          <button className="btn sm" disabled={!nh} onClick={undo}>↩ Hoàn tác</button>
          <label className="small"><input type="checkbox" checked={ortho} onChange={e => setOrtho(e.target.checked)} /> Bắt ngang/dọc</label>
          {base && <label className="small"><input type="checkbox" checked={under} onChange={e => setUnder(e.target.checked)} /> Hiện nét bản vẽ gốc</label>}
          <button className="btn sm" onClick={() => fit(M, size)}>Vừa khung</button>
        </> : <>
          <button className="btn sm" onClick={() => setView3(v => (v === 0 ? 2 : 0))}>Góc nhìn chéo</button><button className="btn sm" onClick={() => setView3(1)}>Từ trên xuống</button>
          <label className="small"><input type="checkbox" checked={ceiling} onChange={e => setCeiling(e.target.checked)} /> Hiện trần</label><label className="small"><input type="checkbox" checked={showFurn} onChange={e => setShowFurn(e.target.checked)} /> Hiện nội thất</label><button className={'btn sm' + (showLib ? ' primary' : '')} onClick={() => setShowLib(v => !v)}>📚 Thư viện</button><span className="muted small">Kéo = xoay · cuộn = zoom · chuột phải kéo = dời</span></>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>Cao tường mặc định <input style={{ width: 52 }} defaultValue={M.hWall} key={'hw' + M.hWall} onBlur={e => commit({ ...M, hWall: num(e.target.value, M.hWall) })} /> m · cột <input style={{ width: 52 }} defaultValue={M.hCol} key={'hc' + M.hCol} onBlur={e => commit({ ...M, hCol: num(e.target.value, M.hCol) })} /> m</span>
      </div>
      {showLib && <LibraryBrowser custom={custom} customDoors={customDoors} doorSel={libDoor} wallSel={selWall?.kind ?? newKind} colSel={libCol}
        hint={selWall ? 'Đang chọn 1 tường: bấm loại tường / vật liệu để áp lên tường đó' : selRoom ? 'Đang chọn 1 phòng: bấm vật liệu Sàn / Trần để áp lên phòng' : selDoor ? 'Đang chọn 1 cửa: bấm mẫu cửa hoặc vật liệu để áp lên cửa' : 'Bấm mẫu cửa/cột để đặt; chọn một tường/phòng/cửa trước để áp vật liệu'}
        onDoor={id => { const sp = doorSpec(id, customDoors); setLibDoor(id); if (selDoor && sp) setDoor(selDoor.id, { lib: sp.id, kind: sp.kind, w: sp.w, h: sp.h, sill: sp.sill, finish: undefined, frameFinish: undefined }); else setTool('door') }}
        onWall={k => { setNewKind(k); const kk = kindOf(k); if (kk.glass && kk.panel) setNewPanel(kk.panel); if (selWall) setWall(selWall.id, selWall.shape.type === 'seg' ? { kind: k, finish: undefined, panel: kk.glass ? (selWall.panel ?? kk.panel) : undefined, shape: { ...selWall.shape, t: kk.t } } : { kind: k, finish: undefined }) }}
        onCol={id => { setLibCol(id); setTool('col') }}
        onFinish={f => { if (selRoom) { if (f.group === 'Trần') setRoom(selRoom.id, { ceil: f.id }); else setRoom(selRoom.id, { floor: f.id }) } else if (selWall) setWall(selWall.id, { finish: f.id }); else if (selDoor) setDoor(selDoor.id, f.group === 'Cửa / khung' || f.group === 'Của tôi' ? { finish: f.id } : {}) }}
        onAddImage={async (file, name, sz, group) => { const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) }); const c = document.createElement('canvas'), k = Math.min(1, 384 / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); setCustom(cs => [{ id: 'my-' + uid(''), group, name, color: '#cccccc', pattern: 'image', size: sz, img: c.toDataURL('image/jpeg', 0.82) }, ...cs]) }}
        onRemoveCustom={id => setCustom(cs => cs.filter(c => c.id !== id))} />}
      {mode === '3d' ? <Scene3D model={M} view={view3} custom={custom} customDoors={customDoors} ceiling={ceiling} showFurn={showFurn} /> :
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 10, alignItems: 'start' }}>
          <div ref={box} style={{ position: 'relative', height: '72vh', border: '1px solid #ddd', background: '#fff', overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble} onContextMenu={e => { e.preventDefault(); setPending(null); setPts([]) }}>
            {under && base?.draw?.length ? <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}><LinesCanvas base={base} vb={vbPt} size={size} /></div> : null}
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {(M.rooms ?? []).map((r, i) => <path key={r.id} d={ringPath(r.poly)} fill={`hsl(${(i * 47) % 360} 70% 70%)`} fillOpacity={selRoom?.id === r.id ? 0.55 : 0.35} stroke={selRoom?.id === r.id ? '#e07000' : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />)}
              {showFurn && (M.furn ?? []).map(f => <FurnGlyph key={f.id} f={f} sel={selFurn?.id === f.id} onDown={onFurnDown} />)}
              {M.walls.map(w => <WallPath key={w.id} w={w} sel={selWall?.id === w.id} onDown={onWallDown} />)}
              {M.walls.map(w => kindOf(w.kind).glass && w.shape.type === 'seg' ? <GlassTicks key={'g' + w.id} w={w} panel={w.panel ?? kindOf(w.kind).panel ?? 1.2} /> : null)}
              {M.doors.map(d => <DoorGlyph key={d.id} d={d} sel={selDoor?.id === d.id} onDown={onDoorDown} />)}
              {(M.dims ?? []).map(d => <DimGlyph key={d.id} d={d} sel={selDim?.id === d.id} fs={fsz} mm={dimMm} onDown={onDimDown} />)}
              {(M.rooms ?? []).map(r => { const c = centroid(r.poly), a = r.area ?? polyArea(r.poly); return <text key={'t' + r.id} x={c[0]} y={c[1]} textAnchor="middle" fontSize={fsz * 1.1} fill="#111" stroke="#fff" strokeWidth={fsz * 0.25} paintOrder="stroke" style={{ cursor: 'pointer', userSelect: 'none' }} onPointerDown={e => { if (tool === 'select') { e.stopPropagation(); setSel({ t: 'room', id: r.id }) } }}><tspan x={c[0]} dy={-fsz * 0.1} fontWeight="bold">{r.name}</tspan><tspan x={c[0]} dy={fsz * 1.25}>{a.toFixed(1)} m²</tspan></text> })}
              {selRoom && selRoom.poly.map((a, i) => { const b = selRoom.poly[(i + 1) % selRoom.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L < 0.3 ? null : <text key={'re' + i} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} fontSize={fsz * 0.85} textAnchor="middle" fill="#c0392b" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{fmtLen(L, dimMm)}</text> })}
              {selDim && (() => { const d = selDim, L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) || 1, nx = -(d.b[1] - d.a[1]) / L * d.off, ny = (d.b[0] - d.a[0]) / L * d.off, mo: Pt = [(d.a[0] + d.b[0]) / 2 + nx, (d.a[1] + d.b[1]) / 2 + ny]
                return <>{(['dimA', 'dimB'] as const).map(k => { const q = k === 'dimA' ? d.a : d.b; return <circle key={k} cx={q[0]} cy={q[1]} r={hs * 1.2} fill="#fff" stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onDimHandle(e, d.id, k)} /> })}
                  <circle cx={mo[0]} cy={mo[1]} r={hs * 1.2} fill="#e07000" fillOpacity={0.85} stroke="#fff" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onDimHandle(e, d.id, 'dimOff')}><title>Kéo để dời đường kích thước</title></circle></> })()}
              {selRoom && selRoom.poly.map((q, vi) => <circle key={'rv' + vi} cx={q[0]} cy={q[1]} r={hs} fill="#fff" stroke="#e07000" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => { e.stopPropagation(); drag.current = { k: 'roomV', id: selRoom.id, vi, orig: selRoom, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (selRoom.poly.length > 3) setRoom(selRoom.id, { poly: selRoom.poly.filter((_, j) => j !== vi), area: undefined }) }} />)}
              {selWall?.shape.type === 'seg' && (() => { const cl = centerline(selWall), mp = selWall.shape.bulge ? cl[Math.floor(cl.length / 2)] : [(selWall.shape.a[0] + selWall.shape.b[0]) / 2, (selWall.shape.a[1] + selWall.shape.b[1]) / 2]; return <><circle cx={mp[0]} cy={mp[1]} r={hs * 1.2} fill="#e07000" fillOpacity={0.85} stroke="#fff" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onBendDown(e, selWall.id)}><title>Kéo để uốn cong</title></circle>
                <text x={mp[0]} y={mp[1] - hs * 2.2} fontSize={fsz} textAnchor="middle" fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{cl.reduce((n, q, i) => i ? n + Math.hypot(q[0] - cl[i - 1][0], q[1] - cl[i - 1][1]) : 0, 0).toFixed(2)} m</text></> })()}
              {selWall?.shape.type === 'poly' && selWall.shape.rings.flatMap((r, ri) => (r.length > 260 ? [] : r).map((q, vi) => <circle key={ri + '_' + vi} cx={q[0]} cy={q[1]} r={hs} fill="#fff" stroke="#e07000" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onHandleDown(e, selWall.id, ri, vi)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const sh = selWall.shape as { type: 'poly'; rings: Pt[][] }; if (sh.rings[ri].length > 3) setWall(selWall.id, { shape: { type: 'poly', rings: sh.rings.map((r, i) => i === ri ? r.filter((_, j) => j !== vi) : r) } }) }} />))}
              {selWall?.shape.type === 'seg' && (['a', 'b'] as const).map(k => { const q = (selWall.shape as { a: Pt; b: Pt })[k]; return <circle key={k} cx={q[0]} cy={q[1]} r={hs * 1.2} fill="#fff" stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onEndDown(e, selWall.id, k)} /> })}
              {tool === 'dim' && pts.length > 0 && cursor && (() => { const a = pts[0], b = pts.length > 1 ? pts[1] : snapPt(cursor, a), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, off = pts.length > 1 ? ((cursor[0] - a[0]) * -(b[1] - a[1]) + (cursor[1] - a[1]) * (b[0] - a[0])) / L : 0; return <DimGlyph d={{ id: 'tmp', a, b, off }} sel fs={fsz} mm={dimMm} onDown={() => undefined} /> })()}
              {tool === 'roomPoly' && pts.length > 0 && <path d={'M' + pts.map(q => q[0] + ' ' + q[1]).join('L') + (cursor ? 'L' + snapPt(cursor, pts[pts.length - 1]).join(' ') : '')} fill="#e07000" fillOpacity={0.15} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />}
              {tool === 'roomPoly' && pts.length >= 3 && <text x={centroid(pts)[0]} y={centroid(pts)[1]} fontSize={fsz} textAnchor="middle" fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{polyArea(pts).toFixed(2)} m²</text>}
              {tool === 'wall' && pending && cursor && <text x={snapPt(cursor, pending)[0]} y={snapPt(cursor, pending)[1] - hs * 2} fontSize={fsz} fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{Math.hypot(snapPt(cursor, pending)[0] - pending[0], snapPt(cursor, pending)[1] - pending[1]).toFixed(2)} m</text>}
              {tool === 'wall' && pending && cursor && <line x1={pending[0]} y1={pending[1]} x2={snapPt(cursor, pending)[0]} y2={snapPt(cursor, pending)[1]} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
              {tool !== 'select' && tool !== 'wall' && tool !== 'furn' && cursor && (() => { const s = snapToWall(M, cursor, 0.6); return s ? <circle cx={s.x} cy={s.y} r={hs * 1.4} fill="#1e5ac8" fillOpacity={0.5} /> : null })()}
            </svg>
            <div className="muted small" style={{ position: 'absolute', left: 6, bottom: 4, background: 'rgba(255,255,255,.85)', padding: '0 4px' }}>
              {tool === 'wall' ? 'Bấm điểm đầu, rồi các điểm tiếp theo · Esc hoặc chuột phải để dừng' : tool === 'dim' ? 'Bấm điểm đầu, điểm cuối, rồi bấm để kéo đường kích thước ra' : tool === 'room' ? 'Bấm vào bên trong một không gian kín' : tool === 'roomPoly' ? 'Bấm từng góc; bấm lại điểm đầu hoặc Enter để chốt' : tool === 'furn' ? 'Bấm để đặt món nội thất' : tool !== 'select' ? 'Bấm sát vào tường để đặt cửa' : 'Cuộn = zoom · kéo nền = dời · bấm tường/cửa để chọn · Del = xoá · Ctrl+Z = hoàn tác'}</div>
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {selWall ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>{selWall.role === 'col' ? 'Cột' : 'Tường'} {selWall.auto ? '(tự nhận từ bản vẽ)' : selWall.shape.type === 'seg' ? '(thêm tay)' : '(từ DXF)'}</b>
              <label>Loại <select value={selWall.role} onChange={e => setWall(selWall.id, { role: e.target.value as 'wall' | 'col' })}><option value="wall">Tường</option><option value="col">Cột</option></select></label>
              <label>Kết cấu <select value={selWall.kind} style={{ maxWidth: 170 }} onChange={e => { const k = kindOf(e.target.value); setWall(selWall.id, selWall.shape.type === 'seg' ? { kind: e.target.value, finish: undefined, panel: k.glass ? (selWall.panel ?? k.panel) : undefined, shape: { ...selWall.shape, t: k.t } } : { kind: e.target.value, finish: undefined }) }}>{WALL_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
              <label>Hoàn thiện <select value={selWall.finish ?? ''} style={{ maxWidth: 170 }} onChange={e => setWall(selWall.id, { finish: e.target.value || undefined })}><option value="">(theo kết cấu)</option>{[...custom, ...FINISHES].filter(f => f.group === 'Tường' || f.group === 'Của tôi' || f.group === 'Sàn').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              {kindOf(selWall.kind).glass && selWall.shape.type === 'seg' && <label>Chia tấm kính mỗi (m) <input style={{ width: 60 }} key={'pn' + selWall.id + (selWall.panel ?? '')} defaultValue={selWall.panel ?? kindOf(selWall.kind).panel ?? 1.2} onBlur={e => setWall(selWall.id, { panel: Math.max(0.3, num(e.target.value, 1.2)) })} /><span className="muted small"> → {Math.max(1, Math.round(segLen / Math.max(0.3, selWall.panel ?? kindOf(selWall.kind).panel ?? 1.2)))} tấm</span></label>}
              <WallLayerSection type={kindOf(selWall.kind)} finishColor={finishOf(selWall.finish ?? kindOf(selWall.kind).finish, custom)?.color} />
              <label>Cao (m) <input style={{ width: 70 }} key={selWall.id + (selWall.h ?? 'm')} defaultValue={selWall.h ?? (selWall.role === 'col' ? M.hCol : M.hWall)} onBlur={e => setWall(selWall.id, { h: num(e.target.value, M.hWall) })} /></label>
              {selWall.shape.type === 'seg' && <>
                <label>Dày (m) <input style={{ width: 70 }} key={'t' + selWall.id + selWall.shape.t} defaultValue={selWall.shape.t} onBlur={e => { const s = selWall.shape as { type: 'seg'; a: Pt; b: Pt; t: number }; setWall(selWall.id, { shape: { ...s, t: Math.max(0.05, num(e.target.value, s.t)) } }) }} /></label>
                <label>Dài (m) <input style={{ width: 70 }} key={'l' + selWall.id + segLen.toFixed(3)} defaultValue={segLen.toFixed(2)} onBlur={e => { const s = selWall.shape as { type: 'seg'; a: Pt; b: Pt; t: number }, L = Math.max(0.1, num(e.target.value, segLen)), ux = (s.b[0] - s.a[0]) / (segLen || 1), uy = (s.b[1] - s.a[1]) / (segLen || 1); setWall(selWall.id, { shape: { ...s, b: [s.a[0] + ux * L, s.a[1] + uy * L] } }) }} /></label></>}
              {selWall.shape.type === 'seg' && <label>Uốn cong (m) <input style={{ width: 70 }} key={'b' + selWall.id + (selWall.shape.bulge ?? 0).toFixed(2)} defaultValue={(selWall.shape.bulge ?? 0).toFixed(2)} onBlur={e => { const sh = selWall.shape as { type: 'seg'; a: Pt; b: Pt; t: number }; const v = num(e.target.value, 0); setWall(selWall.id, { shape: { ...sh, bulge: Math.abs(v) < 0.03 ? undefined : v } }) }} /></label>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{selWall.shape.type === 'seg' && <button className="btn sm" onClick={split}>Tách đôi</button>}<button className="btn sm" onClick={dup}>Nhân đôi</button><button className="btn sm" onClick={del}>Xoá</button></div>
              <div className="muted small">{selWall.shape.type === 'seg' ? 'Chấm cam giữa tường: kéo để uốn cong.' : 'Kéo chấm đỉnh để sửa hình; bấm đúp lên cạnh để thêm đỉnh; chuột phải lên đỉnh để xoá đỉnh.'}</div></div> : null}
            {selRoom ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>Phòng</b>
              <label>Tên (VN) <input style={{ width: 150 }} key={'rn' + selRoom.id} defaultValue={selRoom.name} onBlur={e => setRoom(selRoom.id, { name: e.target.value })} /></label>
              <label>Tên (EN) <input style={{ width: 150 }} key={'re' + selRoom.id} defaultValue={selRoom.en ?? ''} onBlur={e => setRoom(selRoom.id, { en: e.target.value })} /></label>
              <div>Diện tích: <b>{(selRoom.area ?? polyArea(selRoom.poly)).toFixed(2)} m²</b>{selRoom.area ? <span className="muted small"> (đã trừ cột/vách bên trong)</span> : null}</div>
              <label>Sàn <select value={selRoom.floor ?? ''} style={{ maxWidth: 170 }} onChange={e => setRoom(selRoom.id, { floor: e.target.value || undefined })}><option value="">(chưa chọn)</option>{[...custom, ...FINISHES].filter(f => f.group === 'Sàn' || f.group === 'Của tôi').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Trần <select value={selRoom.ceil ?? ''} style={{ maxWidth: 170 }} onChange={e => setRoom(selRoom.id, { ceil: e.target.value || undefined })}><option value="">Thạch cao sơn trắng</option>{[...custom, ...FINISHES].filter(f => f.group === 'Trần' || f.group === 'Của tôi').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Cao trần (m) <input style={{ width: 60 }} key={'ch' + selRoom.id + (selRoom.ceilH ?? '')} defaultValue={selRoom.ceilH ?? M.hWall} onBlur={e => setRoom(selRoom.id, { ceilH: num(e.target.value, M.hWall) })} /></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm" onClick={() => dimRoom(selRoom)}>📏 Ghi kích thước các cạnh</button><button className="btn sm" onClick={del}>Xoá phòng</button></div>
              <div className="muted small">Kéo chấm đỉnh để chỉnh phạm vi · bấm đúp lên cạnh để thêm đỉnh · chuột phải lên đỉnh để xoá đỉnh.</div></div> : null}
            {selFurn ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>Nội thất{selFurn.name ? ` – ${selFurn.name}` : ''}</b>
              <label>Loại <select value={selFurn.kind} style={{ maxWidth: 170 }} onChange={e => { const t = furnTypeOf(e.target.value); setFurn(selFurn.id, { kind: t.key, h: t.h }) }}>{['Ngồi', 'Bàn', 'Tủ – kệ – quầy', 'Ngủ', 'Vệ sinh', 'Khác'].map(g => <optgroup key={g} label={g}>{FURN_TYPES.filter(t => t.group === g).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}</select></label>
              <label>Rộng (m) <input style={{ width: 60 }} key={'fw' + selFurn.id + selFurn.w} defaultValue={selFurn.w.toFixed(2)} onBlur={e => setFurn(selFurn.id, { w: Math.max(0.1, num(e.target.value, selFurn.w)) })} /></label>
              <label>Sâu (m) <input style={{ width: 60 }} key={'fd' + selFurn.id + selFurn.d} defaultValue={selFurn.d.toFixed(2)} onBlur={e => setFurn(selFurn.id, { d: Math.max(0.1, num(e.target.value, selFurn.d)) })} /></label>
              <label>Cao (m) <input style={{ width: 60 }} key={'fh' + selFurn.id + selFurn.h} defaultValue={selFurn.h} onBlur={e => setFurn(selFurn.id, { h: Math.max(0.05, num(e.target.value, selFurn.h)) })} /> <span className="muted small">chuẩn {furnTypeOf(selFurn.kind).h}</span></label>
              <label>Xoay (độ) <input style={{ width: 60 }} key={'fa' + selFurn.id + selFurn.ang} defaultValue={Math.round(selFurn.ang * 180 / Math.PI)} onBlur={e => setFurn(selFurn.id, { ang: num(e.target.value, 0) * Math.PI / 180 })} /></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm" onClick={() => setFurn(selFurn.id, { ang: selFurn.ang + Math.PI / 2 })}>⟳ 90°</button><button className="btn sm" onClick={() => setFurn(selFurn.id, { flip: !selFurn.flip })}>Đảo phía lưng tựa</button><button className="btn sm" onClick={() => setFurn(selFurn.id, { h: furnTypeOf(selFurn.kind).h })}>Về cao chuẩn</button><button className="btn sm" onClick={dup}>Nhân đôi</button><button className="btn sm" onClick={del}>Xoá</button></div>
              <div className="muted small">Khi xem 3D, món này cao đúng {selFurn.h} m (không cao bằng tường). Thanh tối = lưng tựa.</div></div> : null}
            {selDim ? <div className="card" style={{ display: 'grid', gap: 6 }}><b>Kích thước</b><div className="muted small">Dài {Math.hypot(selDim.b[0] - selDim.a[0], selDim.b[1] - selDim.a[1]).toFixed(3)} m</div>
              <label>Chữ ghi đè <input style={{ width: 100 }} key={'dt' + selDim.id} defaultValue={selDim.txt ?? ''} placeholder="(số đo thật)" onBlur={e => setDim(selDim.id, { txt: e.target.value || undefined })} /></label>
              <div className="muted small">Kéo 2 chấm trắng để dời đầu đo (tự bắt đỉnh tường/phòng); chấm cam để dời đường dim.</div><button className="btn sm" onClick={del}>Xoá</button></div> : null}
            {selDoor ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>Cửa</b>
              <label>Loại <select value={selDoor.lib ?? ''} style={{ maxWidth: 160 }} onChange={e => { const sp = doorSpec(e.target.value, customDoors); if (sp) setDoor(selDoor.id, { lib: sp.id, kind: sp.kind, w: sp.w, h: sp.h, sill: sp.sill, finish: undefined, frameFinish: undefined }) }}><option value="">(tuỳ chỉnh)</option>{['Cửa đi', 'Cửa kính', 'Cửa sổ', 'Khác'].map(g => <optgroup key={g} label={g}>{[...customDoors, ...DOOR_LIB].filter(d => (customDoors.includes(d) ? g === 'Cửa đi' : d.group === g)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}</select></label>
              <label>Vật liệu cánh <select value={selDoor.finish ?? doorSpec(selDoor.lib, customDoors)?.leafFinish ?? ''} style={{ maxWidth: 150 }} onChange={e => setDoor(selDoor.id, { finish: e.target.value })}>{[...custom, ...FINISHES].filter(f => f.group === 'Cửa / khung' || f.group === 'Của tôi' || f.group === 'Tường').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Vật liệu khung <select value={selDoor.frameFinish ?? doorSpec(selDoor.lib, customDoors)?.frameFinish ?? ''} style={{ maxWidth: 150 }} onChange={e => setDoor(selDoor.id, { frameFinish: e.target.value })}>{[...custom, ...FINISHES].filter(f => f.group === 'Cửa / khung' || f.group === 'Của tôi').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label>Rộng (m) <input style={{ width: 70 }} key={'w' + selDoor.id + selDoor.w} defaultValue={selDoor.w} onBlur={e => setDoor(selDoor.id, { w: Math.max(0.3, num(e.target.value, selDoor.w)) })} /></label>
              <label>Cao (m) <input style={{ width: 70 }} key={'h' + selDoor.id + selDoor.h} defaultValue={selDoor.h} onBlur={e => setDoor(selDoor.id, { h: Math.max(0.3, num(e.target.value, selDoor.h)) })} /></label>
              <label>Bệ cao (m) <input style={{ width: 70 }} key={'s' + selDoor.id + selDoor.sill} defaultValue={selDoor.sill} onBlur={e => setDoor(selDoor.id, { sill: Math.max(0, num(e.target.value, selDoor.sill)) })} /></label>
              <button className="btn sm" onClick={() => setDoor(selDoor.id, { flip: !selDoor.flip })}>Đảo phía mở</button>
              <button className="btn sm" onClick={dup}>Nhân đôi</button>
              <button className="btn sm" onClick={() => { const nm = window.prompt?.('Tên mẫu cửa của bạn') ?? ''; const base = doorSpec(selDoor.lib, customDoors); const id = 'my-' + uid(''); const sp: DoorSpec = { id, group: 'Cửa đi', name: nm || 'Mẫu của tôi', kind: selDoor.kind, w: selDoor.w, h: selDoor.h, sill: selDoor.sill, leaf: base?.leaf ?? 'flush', frame: base?.frame ?? 0.06, leafFinish: selDoor.finish ?? base?.leafFinish ?? 'd-white', frameFinish: selDoor.frameFinish ?? base?.frameFinish ?? 'd-white', handle: base?.handle, panes: base?.panes }; setCustomDoors(c => [sp, ...c]) }}>Lưu thành mẫu của tôi</button>
              <button className="btn sm" onClick={del}>Xoá</button>
              <div className="small muted">Mặt cắt ngang (nhìn từ trên)</div><DoorPlanSection d={selDoor} spec={doorSpec(selDoor.lib, customDoors)} />
              <div className="small muted">Mặt cắt đứng (đầu cửa, bệ)</div><DoorElevSection d={selDoor} spec={doorSpec(selDoor.lib, customDoors)} H={M.hWall} /></div> : null}
            {!selWall && !selDoor && !selRoom && !selDim && !selFurn && <div className="muted small card">Chọn một đoạn tường, cột, cửa hoặc phòng để sửa.<br />Tường nhập từ DXF kéo được cả khối hoặc từng đỉnh. Tường thêm tay có hai đầu kéo được, sửa được độ dày và độ dài.<br /><br />{M.walls.length} khối tường/cột · {M.doors.length} cửa · {(M.furn ?? []).length} món nội thất</div>}
            {(M.rooms ?? []).length > 0 && <div className="card small" style={{ display: 'grid', gap: 3 }}><b>Danh sách phòng</b>{(M.rooms ?? []).map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: selRoom?.id === r.id ? 700 : 400 }} onClick={() => setSel({ t: 'room', id: r.id })}><span>{r.name}</span><span>{(r.area ?? polyArea(r.poly)).toFixed(1)} m²</span></div>)}<div style={{ borderTop: '1px solid #ddd', paddingTop: 3, display: 'flex', justifyContent: 'space-between' }}><b>Tổng</b><b>{(M.rooms ?? []).reduce((n, r) => n + (r.area ?? polyArea(r.poly)), 0).toFixed(1)} m²</b></div></div>}
          </div>
        </div>}
    </>}
  </div>
}

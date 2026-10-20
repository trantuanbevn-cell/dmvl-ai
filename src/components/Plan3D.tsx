// Soạn mặt bằng & dựng 3D: nhập DXF → sửa tường · cột · cửa trên mặt bằng → xem 3D. (Thử nghiệm, chỉ admin.)
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readDxfPage } from '../lib/dxf'
import { supabase, BUCKET } from '../lib/supabase'
import type { FloorPlan } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import { applyPlanSync, planSyncRows, type SyncRow } from '../lib/planSync'
import type { VecPage } from '../lib/vector'
import { LinesCanvas } from './PlanView'
import Scene3D, { type Pick3 } from './Scene3D'
import LibraryBrowser from './LibraryBrowser'
import { DoorElevSection, DoorPlanSection, WallLayerSection } from './Sections'
import { COL_LIB, DOOR_LIB, FINISHES, WALL_TYPES, doorSpec, finishOf, type DoorLeaf, type DoorSpec, type Finish } from '../lib/plan3d/library'
import { WALL_KINDS, autoRooms, centerline, centroid, doorRect, floodRoom, centerDoor, footprint, inside, kindOf, modelFromVec, polyArea, snapToWall, uid, wallThickAt, type Dim, type Door, type Furn, type Model, type Pt, type Room, type Wall } from '../lib/plan3d/model'
import { FURN_GROUPS, FURN_TYPES, furnTypeOf } from '../lib/plan3d/furn'
import { applyXf, buildShape, detectAxes, fitWallsToDoor, joinEnds, furnHitsWall, mkMove, mkRot, mkScale, newWallOverlap, roomOverlap, selCenter, shapePoly, type Shape } from '../lib/plan3d/xform'

type Box = { x: number; y: number; w: number; h: number }
type Tool = 'select' | 'wall' | 'glasskit' | 'axisV' | 'axisH' | 'dim' | 'room' | 'roomPoly' | 'door' | 'col' | 'furn'
type Sel = { t: 'wall' | 'door' | 'room' | 'dim' | 'furn' | 'axis'; id: string } | null
type SnapKind = '' | 'align' | 'end' | 'mid' | 'cen' | 'int' | 'per' | 'nea' | 'axis' | 'polar' | 'grid'
const SNAP_LABEL: Record<string, string> = { align: 'Dóng hàng', end: 'Đầu mút', mid: 'Điểm giữa', cen: 'Tâm', int: 'Giao điểm', per: 'Vuông góc', nea: 'Gần nhất', axis: 'Trục', polar: 'Góc cực / ngang-dọc', grid: 'Lưới' }
const LAY0 = { walls: true, cols: true, doors: true, furn: true, rooms: true, labels: true, dims: true, axes: true }
const LOCK0 = { walls: false, cols: false, doors: false, furn: false, rooms: false, dims: false, axes: false }
const SM0 = { align: true, end: true, mid: true, cen: true, int: true, per: true, nea: true, axis: true, polar: false, grid: false }
const KEY = 'plan3d-model-v1'
const ringPath = (r: Pt[]) => 'M' + r.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z'

const WallPath = memo(function WallPath({ w, sel, onDown }: { w: Wall; sel: boolean; onDown: (e: React.PointerEvent, w: Wall) => void }) {
  const d = useMemo(() => footprint(w).map(ringPath).join(''), [w])
  const k = kindOf(w.kind)
  return <path d={d} fill={k.glass ? '#8fd8ee' : w.role === 'col' ? '#6a6a6a' : '#b1b1b1'} fillOpacity={k.glass ? 0.7 : 0.95} fillRule="evenodd" stroke={sel ? '#e07000' : k.glass ? '#1b87a8' : '#3a3a3a'} strokeWidth={sel ? 2.4 : 1} vectorEffect="non-scaling-stroke" onPointerDown={e => onDown(e, w)} style={{ cursor: 'pointer' }} />
})

function PalBtn({ on, ic, label, title, onClick }: { on: boolean; ic: string; label: string; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} style={{ display: 'grid', justifyItems: 'center', gap: 1, width: '100%', padding: '5px 2px', border: '1px solid ' + (on ? '#e07000' : '#ddd'), background: on ? '#fdebd6' : '#fff', borderRadius: 6, cursor: 'pointer', font: 'inherit', color: on ? '#a85a00' : '#222' }}><span style={{ fontSize: 19, lineHeight: 1.1 }}>{ic}</span><span style={{ fontSize: 10.5, lineHeight: 1.1, textAlign: 'center' }}>{label}</span></button>
}

/** Mũi tên nắm kéo (quay theo hướng ang, cỡ s theo zoom) */
function Arrow({ x, y, ang, s, onDown, title, color = '#e07000' }: { x: number; y: number; ang: number; s: number; onDown: (e: React.PointerEvent) => void; title: string; color?: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${ang * 180 / Math.PI})`} style={{ cursor: 'pointer' }} onPointerDown={onDown}>
    <circle r={s * 1.6} cx={s * 0.6} fill="#fff" fillOpacity={0.01} />
    <polygon points={`${s * 2.2},0 ${s * 0.7},${s * 1.2} ${s * 0.7},${s * 0.45} ${-s * 0.2},${s * 0.45} ${-s * 0.2},${-s * 0.45} ${s * 0.7},${-s * 0.45} ${s * 0.7},${-s * 1.2}`} fill={color} fillOpacity={0.92} stroke="#fff" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    <title>{title}</title></g>
}

/** Ký hiệu cửa trên mặt bằng 2D kiểu bản vẽ kiến trúc: khuông, cánh mở 90° + cung quét, ô kính, ray trượt, bệ cửa sổ… theo loại trong thư viện */
function DoorGlyph({ d, sel, spec, onDown }: { d: Door; sel: boolean; spec?: DoorSpec; onDown: (e: React.PointerEvent, d: Door) => void }) {
  const ux = Math.cos(d.ang), uy = Math.sin(d.ang), s = d.flip ? -1 : 1, t = Math.max(d.t ?? 0.2, 0.08), W = d.w / 2
  const fr = Math.min(Math.max(spec?.frame ?? 0.05, 0.04), d.w / 6, 0.1), lt = 0.045
  const leaf: DoorLeaf = spec?.leaf ?? (d.kind === 'window' ? 'fixed' : d.kind === 'slide' ? 'sliding' : d.kind === 'opening' ? 'none' : 'flush')
  const P = (a: number, b: number) => [d.x + ux * a - uy * b * s, d.y + uy * a + ux * b * s] as Pt
  const pt = (a: number, b: number) => { const q = P(a, b); return `${q[0]} ${q[1]}` }
  const ln = (a0: number, b0: number, a1: number, b1: number) => `M${pt(a0, b0)}L${pt(a1, b1)}`
  const rc = (a0: number, a1: number, b0: number, b1: number) => `M${pt(a0, b0)}L${pt(a1, b0)}L${pt(a1, b1)}L${pt(a0, b1)}Z`
  const main = sel ? '#e07000' : '#16337a', thin = sel ? '#e07000' : '#3f66b8', glass = sel ? '#e07000' : '#1f8fb5', sw = sel ? 1.8 : 1.2
  const E: React.ReactNode[] = []; let k = 0
  const path = (dd: string, o: { f?: string; st?: string; w?: number; dash?: string; fo?: number } = {}) => E.push(<path key={k++} d={dd} fill={o.f ?? 'none'} fillOpacity={o.fo} stroke={o.st ?? main} strokeWidth={o.w ?? sw} strokeDasharray={o.dash} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)
  const swing = d.kind === 'door' || d.kind === 'double', isWin = d.kind === 'window'
  // nền trắng xoá tường + khuông hai bên
  path(rc(-W, W, -t / 2, t / 2), { f: '#fff', st: 'none' })
  path(rc(-W, -W + fr, -t / 2, t / 2), { f: '#e9eefb' }); path(rc(W - fr, W, -t / 2, t / 2), { f: '#e9eefb' })
  path(ln(-W + fr, -t / 2 + t * 0.22, -W + fr, t / 2 - t * 0.22), { st: thin, w: 0.8 }); path(ln(W - fr, -t / 2 + t * 0.22, W - fr, t / 2 - t * 0.22), { st: thin, w: 0.8 })
  const iw = d.w - 2 * fr
  const leafDraw = (hx: number, dir: number, len: number) => {
    // cánh mở 90°: chữ nhật dày 45 mm vuông góc tường, cung quét nét mảnh, chốt bản lề
    const a0 = dir > 0 ? hx : hx - lt, a1 = a0 + lt, fill = leaf === 'glass' || leaf === 'glassHalf' ? '#d6eef7' : spec?.fire ? '#c4c9ce' : '#fff'
    path(rc(a0, a1, 0, len), { f: fill })
    if (leaf === 'glass') path(ln((a0 + a1) / 2, 0.05, (a0 + a1) / 2, len - 0.05), { st: glass, w: 0.8 })
    if (leaf === 'glassHalf') path(ln((a0 + a1) / 2, len * 0.45, (a0 + a1) / 2, len - 0.05), { st: glass, w: 0.8 })
    if (leaf === 'panel' || leaf === 'panel6') for (const f of leaf === 'panel6' ? [0.12, 0.38, 0.64] : [0.15, 0.55]) path(ln((a0 + a1) / 2, len * f, (a0 + a1) / 2, len * (f + (leaf === 'panel6' ? 0.2 : 0.3))), { st: thin, w: 0.8 })
    if (leaf === 'louver') for (let b = 0.1; b < len - 0.05; b += 0.07) path(ln(a0 - 0.006, b, a1 + 0.006, b + 0.025), { st: thin, w: 0.7 })
    const tip = pt(hx, len), end = pt(hx + dir * len, 0), sweep = (dir > 0 ? 0 : 1) ^ (s < 0 ? 1 : 0)
    E.push(<path key={k++} d={`M${tip}A${len} ${len} 0 0 ${sweep} ${end}`} fill="none" stroke={thin} strokeWidth={0.9} strokeDasharray={spec?.fire ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />)
    path(ln(hx + dir * len, 0, hx + dir * (len - 0.01), 0), { st: thin })
    const hp = P(hx + dir * lt / 2, 0); E.push(<circle key={k++} cx={hp[0]} cy={hp[1]} r={0.022} fill={main} />)
    if (spec?.handle !== false && leaf !== 'none') path(ln(a0 + lt / 2, len - 0.12, a0 + lt / 2 + (dir > 0 ? 0.045 : -0.045), len - 0.12), { st: main, w: 1.6 })
  }
  if (d.kind === 'door') { path(ln(-W + fr, 0, W - fr, 0), { st: '#8a97b8', w: 0.6, dash: '3 3' }); leafDraw(-W + fr, 1, iw) }
  else if (d.kind === 'double') { path(ln(-W + fr, 0, W - fr, 0), { st: '#8a97b8', w: 0.6, dash: '3 3' }); leafDraw(-W + fr, 1, iw / 2); leafDraw(W - fr, -1, iw / 2) }
  else if (d.kind === 'opening') { path(ln(-W + fr, -t / 2, W - fr, -t / 2), { st: '#8a97b8', w: 0.8, dash: '5 3' }); path(ln(-W + fr, t / 2, W - fr, t / 2), { st: '#8a97b8', w: 0.8, dash: '5 3' }) }
  else if (d.kind === 'slide' || leaf === 'sliding') {
    const n = Math.max(2, spec?.panes ?? 2)
    if (leaf === 'fold') { const pts: string[] = []; for (let i = 0; i <= n; i++) pts.push(pt(-W + fr + iw * i / n, i % 2 ? 0.07 : -0.07)); path('M' + pts.join('L'), { st: glass, w: 1.4 }); path(ln(-W + fr, -0.07, W - fr, -0.07), { st: '#8a97b8', w: 0.6, dash: '3 3' }) }
    else {
      for (let i = 0; i < n; i++) { const tr = i % 2 ? 1 : -1, lw = (iw + (n - 1) * 0.06) / n, a0 = -W + fr + i * (lw - 0.06), b0 = tr * t * 0.2
        path(rc(a0, a0 + lw, b0 - 0.02, b0 + 0.02), { f: d.kind === 'window' || /glass|d-glass/.test(spec?.leafFinish ?? '') ? '#d6eef7' : '#fff' }) }
      for (const tr of [-1, 1]) path(ln(-W + fr, tr * t * 0.2, W - fr, tr * t * 0.2), { st: '#8a97b8', w: 0.5, dash: '2 3' })
      path(ln(-W + fr + 0.1, -t * 0.2 - 0.07, -W + fr + 0.3, -t * 0.2 - 0.07) + ln(-W + fr + 0.3, -t * 0.2 - 0.07, -W + fr + 0.25, -t * 0.2 - 0.1) + ln(-W + fr + 0.3, -t * 0.2 - 0.07, -W + fr + 0.25, -t * 0.2 - 0.04), { st: thin, w: 0.9 })
    }
  }
  if (isWin) {
    // ba nét: mặt tường ngoài – hai nét kính – mặt tường trong, bệ cửa nhô ra phía ngoài
    path(rc(-W - 0.03, W + 0.03, t / 2, t / 2 + 0.035), { f: '#f2f2f2', st: '#555', w: 0.9 })
    path(ln(-W + fr, -t / 2, W - fr, -t / 2) + ln(-W + fr, t / 2, W - fr, t / 2))
    if (leaf !== 'sliding') {
      const n = Math.max(1, spec?.panes ?? 1), pw = iw / n
      const gb = leaf === 'awning' ? 0 : 0.014
      path(ln(-W + fr, -gb, W - fr, -gb) + ln(-W + fr, gb, W - fr, gb), { st: glass, w: 1, dash: leaf === 'awning' ? '6 3' : undefined })
      if (leaf === 'louver') for (let a = -W + fr + 0.05; a < W - fr; a += 0.06) path(ln(a, -t * 0.28, a, t * 0.28), { st: thin, w: 0.7 })
      for (let i = 1; i < n; i++) path(rc(-W + fr + pw * i - 0.02, -W + fr + pw * i + 0.02, -t * 0.4, t * 0.4), { f: '#e9eefb', st: thin, w: 0.8 })
      if (leaf === 'casement') for (let i = 0; i < n; i++) { const hx = i < n / 2 ? -W + fr + pw * i : -W + fr + pw * (i + 1), dr = i < n / 2 ? 1 : -1, len = pw - 0.01
        const sweep = (dr > 0 ? 0 : 1) ^ (s < 0 ? 1 : 0)
        E.push(<path key={k++} d={`${ln(hx, 0, hx, len)}M${pt(hx, len)}A${len} ${len} 0 0 ${sweep} ${pt(hx + dr * len, 0)}`} fill="none" stroke={thin} strokeWidth={0.8} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />) }
    }
  }
  return <g onPointerDown={e => onDown(e, d)} style={{ cursor: 'move' }}>
    {E}
    <path d={rc(-W - 0.02, W + 0.02, -t / 2, t / 2)} fill="transparent" stroke="none" />
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

/** proj: khi nhúng trong một dự án → chọn tầng, nhập DXF của tầng đó, và tự lưu mô hình lên dự án (file riêng trong kho, không đụng dữ liệu danh mục) */
export default function Plan3D({ proj, autoFloor }: { proj?: { id: string; floors: FloorPlan[]; d?: ProjectData }; autoFloor?: string } = {}) {
  const [M, setM] = useState<Model | null>(() => { if (proj) return null; try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) as Model : null } catch { return null } })
  const [base, setBase] = useState<VecPage | null>(null)
  const [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [tool, setTool] = useState<Tool>('select'), [sel, setSel] = useState<Sel>(null)
  const [mode, setMode] = useState<'2d' | '3d'>('2d'), [view3, setView3] = useState(0)
  const [ortho, setOrtho] = useState(true), [under, setUnder] = useState(true), [libFurn, setLibFurn] = useState('chair'), [dimMm, setDimMm] = useState(true), [newPanel, setNewPanel] = useState(1.2), [shp, setShp] = useState<Shape>('line'), [autoJoin, setAutoJoin] = useState(true), [autoMatch, setAutoMatch] = useState(true), [lay, setLay] = useState<typeof LAY0>(() => { try { return { ...LAY0, ...JSON.parse(localStorage.getItem('plan3d-lay') ?? '{}') } } catch { return LAY0 } }), [lock, setLock] = useState<typeof LOCK0>(() => { try { return { ...LOCK0, ...JSON.parse(localStorage.getItem('plan3d-lock') ?? '{}') } } catch { return LOCK0 } }), [fgHide, setFgHide] = useState<string[]>([]), [showLayers, setShowLayers] = useState(false), [sm, setSm] = useState<typeof SM0>(() => { try { return { ...SM0, ...JSON.parse(localStorage.getItem('plan3d-snap') ?? '{}') } } catch { return SM0 } }), [showLv, setShowLv] = useState(true), [guides, setGuides] = useState<[Pt, Pt][]>([]), gref = useRef<[Pt, Pt][]>([]), [hud, setHud] = useState<{ p: Pt; t: string } | null>(null), [lenBuf, setLenBuf] = useState(''), [ed, setEd] = useState<{ k: 'poly' | 'seg' | 'room'; id: string; ring: number; vi: number; q: Pt } | null>(null), [edv, setEdv] = useState({ len: '', push: '0', thick: '', fix: 'c' }), [floorFin, setFloorFin] = useState(''), [tf, setTf] = useState({ dx: '0', dy: '0', rot: '90', k: '100', n: '1', cx: '1000', cy: '0' })
  const hist = useRef<Model[]>([]), [nh, setNh] = useState(0), clip = useRef<Sel>(null), pasteN = useRef(0)
  const [vb, setVb] = useState<Box>({ x: 0, y: 0, w: 100, h: 60 }), [size, setSize] = useState({ w: 0, h: 0 })
  const box = useRef<HTMLDivElement>(null), drag = useRef<any>(null)
  const ls = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d } catch { return d } }
  const [custom, setCustom] = useState<Finish[]>(() => ls('plan3d-custom-finishes', [])), [customDoors, setCustomDoors] = useState<DoorSpec[]>(() => ls('plan3d-custom-doors', []))
  useEffect(() => { try { localStorage.setItem('plan3d-custom-finishes', JSON.stringify(custom)) } catch { setErr('Ảnh vật liệu quá nặng, không lưu thêm được trong trình duyệt.') } }, [custom])
  useEffect(() => { try { localStorage.setItem('plan3d-custom-doors', JSON.stringify(customDoors)) } catch { /* bỏ */ } }, [customDoors])
  const [dpA, setDpA] = useState<{ p: Pt; ang: number } | null>(null), [libDoor, setLibDoor] = useState('dr-flush09'), [libCol, setLibCol] = useState('cl-r40'), [newKind, setNewKind] = useState('brick'), [gKind, setGKind] = useState('glassal'), [gDoor, setGDoor] = useState('dg-glass12'), [gPos, setGPos] = useState<'mid' | 'start' | 'end'>('mid'), [showLib, setShowLib] = useState(false), [ceiling, setCeiling] = useState(false)
  const [pending, setPending] = useState<Pt | null>(null), [cursor, setCursor] = useState<Pt | null>(null), [pts, setPts] = useState<Pt[]>([])

  const commit = useCallback((n: Model, push = true) => { setM(cur => { if (push && cur) { hist.current.push(cur); if (hist.current.length > 60) hist.current.shift(); setNh(hist.current.length) } return n }) }, [])
  const undo = useCallback(() => { const p = hist.current.pop(); setNh(hist.current.length); if (p) { setM(p); setSel(null) } }, [])
  useEffect(() => { if (!M || proj) return; const t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(M)) } catch { /* quá dung lượng */ } }, 600); return () => clearTimeout(t) }, [M])

  const fit = useCallback((m: Model, sz: { w: number; h: number }) => { const a = sz.h / Math.max(1, sz.w), w = m.w * 1.02, h = Math.max(m.h * 1.02, w * a); setVb({ x: 0, y: 0, w: h / a, h }) }, [])
  useEffect(() => { const e = box.current; if (!e) return; const ro = new ResizeObserver(() => setSize({ w: e.clientWidth, h: e.clientHeight })); ro.observe(e); setSize({ w: e.clientWidth, h: e.clientHeight }); return () => ro.disconnect() }, [mode, M !== null])
  const fitted = useRef(false)
  useEffect(() => { if (M && size.w && !fitted.current) { fitted.current = true; fit(M, size) } }, [M, size, fit])
  // giữ đúng tỉ lệ khung khi cửa sổ đổi cỡ
  useEffect(() => { if (size.w && size.h) setVb(v => ({ ...v, h: v.w * size.h / size.w })) }, [size])

  const [floorId, setFloorId] = useState<string>(''), cloud = useRef(''), [saved, setSaved] = useState('')
  const [sync, setSync] = useState<SyncRow[] | null>(null)
  const floorLabel = proj?.floors.find(f => f.id === floorId)?.floor_label ?? ''
  const openSync = () => { if (!proj?.d || !M) return; const items = (M.rooms ?? []).filter(r => r.name.trim() && !/^Phòng \d+$/.test(r.name.trim())).map(r => ({ name: r.name.trim(), en: r.en?.trim() || undefined, area: r.area ?? polyArea(r.poly) })); if (!items.length) { setErr('Chưa có phòng nào được đặt tên (tên mặc định "Phòng 1…" bị bỏ qua). Đặt tên phòng trước.'); return } setErr(''); setSync(planSyncRows(proj.d, floorLabel, items)) }
  const doSync = async () => { if (!proj?.d || !sync) return; setBusy('Đang đưa sang danh mục…'); try { const r = await applyPlanSync(proj.d, floorLabel, sync); setSync(null); setSaved(`Đã đưa sang danh mục: thêm ${r.added}, cập nhật ${r.updated} phòng`); await proj.d.reload() } catch (e) { setErr((e as Error).message) } finally { setBusy('') } }
  const jsonPath = (fid: string) => `${proj?.id}/plan3d/${fid}.json`
  const floorsDxf = (proj?.floors ?? []).filter(f => /\.dxf$/i.test(f.pdf_path))
  /** Nạp lại nét bản vẽ gốc (DXF) làm lớp nền – bản 3D đã lưu chỉ giữ mô hình nên mở lại phải đọc lại nét gốc để 2D không bị mất */
  const loadUnder = async (path: string, fid: string) => {
    try { const { data } = await supabase.storage.from(BUCKET).download(path); if (!data) return; const v = await readDxfPage(await data.arrayBuffer(), () => {}, { draw: true }); if (cloud.current === fid) { setBase(v); setUnder(true) } } catch { /* không có nền thì thôi */ }
  }
  /** Mở tầng: ưu tiên bản 3D đã lưu của tầng, không có thì dựng từ file DXF của tầng */
  const openFloor = async (fid: string, forceDxf = false) => {
    const fp = proj?.floors.find(f => f.id === fid); if (!proj || !fp) return
    setErr(''); setBusy('Đang mở tầng…'); setFloorId(fid); cloud.current = ''
    try {
      if (!forceDxf) { const { data } = await supabase.storage.from(BUCKET).download(jsonPath(fid)); if (data) { const m = JSON.parse(await data.text()) as Model; if (m.v === 1) { hist.current = []; setNh(0); setBase(null); fitted.current = false; setM(m); setSel(null); cloud.current = fid; if (/\.dxf$/i.test(fp.pdf_path)) void loadUnder(fp.pdf_path, fid); setBusy(''); setSaved('Đã mở bản đã lưu của ' + fp.floor_label); return } } }
      if (!/\.dxf$/i.test(fp.pdf_path)) throw new Error('Tầng này tải lên là PDF – cần file DXF để dựng 3D. Tải DXF ở phần Mặt bằng gốc.')
      const { data, error } = await supabase.storage.from(BUCKET).download(fp.pdf_path); if (error || !data) throw new Error(error?.message ?? 'Không tải được file DXF')
      await loadBuf(await data.arrayBuffer()); cloud.current = fid
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  // tự lưu mô hình của tầng đang mở lên dự án (file riêng)
  useEffect(() => { if (!proj || !M || !cloud.current || cloud.current !== floorId) return
    const fid = floorId, t = setTimeout(async () => { const { error } = await supabase.storage.from(BUCKET).upload(jsonPath(fid), new Blob([JSON.stringify(M)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' }); if (!error) await supabase.storage.from(BUCKET).upload(`${proj?.id}/plan3d/${fid}.rooms.json`, new Blob([JSON.stringify({ w: M.w, h: M.h, rooms: (M.rooms ?? []).filter(r => r.name).map(r => ({ name: r.name, en: r.en, poly: r.poly })) })], { type: 'application/json' }), { upsert: true, contentType: 'application/json' }); setSaved(error ? 'Lưu lên dự án lỗi: ' + error.message : 'Đã lưu vào dự án ' + new Date().toLocaleTimeString()) }, 2500); return () => clearTimeout(t) }, [M, floorId]) // eslint-disable-line
  // tự mở tầng vừa tải lên (hoặc tầng DXF đầu tiên) – không cần bấm gì thêm
  useEffect(() => { if (!proj) return; const want = autoFloor && proj.floors.some(f => f.id === autoFloor) ? autoFloor : !floorId ? floorsDxf[0]?.id : ''; if (want && want !== floorId) openFloor(want) }, [autoFloor, proj?.floors.length]) // eslint-disable-line
  const load = async (f: File) => { cloud.current = ''; await loadBuf(await f.arrayBuffer()) }
  const loadBuf = async (ab: ArrayBuffer) => {
    setErr(''); setBusy('Đang đọc DXF…')
    try {
      const v = await readDxfPage(ab, s => setBusy(s), { draw: true })
      const m = modelFromVec(v, v.dxf.den); hist.current = []; setNh(0); setBase(v); fitted.current = false; setM(m); setSel(null)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  const loadJson = async (f: File) => { cloud.current = ''; try { const m = JSON.parse(await f.text()) as Model; if (m.v !== 1) throw new Error('File không đúng định dạng'); hist.current = []; setNh(0); fitted.current = false; setM(m) } catch (e) { setErr((e as Error).message) } }
  const saveJson = () => { if (!M) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(M)], { type: 'application/json' })); a.download = 'mat-bang-3d.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }

  // ---- Bắt điểm (như CAD): đỉnh / trung điểm / góc đồ / mép tường. Cache theo model để kéo mượt.
  const snapCache = useRef<{ M: Model; v: Pt[]; e: [Pt, Pt][]; fe: [Pt, Pt][]; mk: Set<string>; ck: Set<string>; lk: string; xs: number[]; ys: number[] } | null>(null)
  useEffect(() => { try { localStorage.setItem('plan3d-lay', JSON.stringify(lay)); localStorage.setItem('plan3d-lock', JSON.stringify(lock)) } catch { /* bỏ */ } }, [lay, lock])
  const showFurn = lay.furn
  const lay3 = useMemo(() => ({ walls: lay.walls, cols: lay.cols, doors: lay.doors, furn: lay.furn, rooms: lay.rooms }), [lay])
  const layKey = JSON.stringify(lay) + fgHide.join()
  useEffect(() => { if (tool !== 'door') setDpA(null) }, [tool])
  useEffect(() => { try { localStorage.setItem('plan3d-snap', JSON.stringify(sm)) } catch { /* bỏ */ } }, [sm])
  const pk = (q: Pt) => q[0].toFixed(4) + ',' + q[1].toFixed(4)
  const furnCorners = (f: Furn): Pt[] => { const c = Math.cos(f.ang), s = Math.sin(f.ang); return ([[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]] as [number, number][]).map(([a, b]) => [f.x + c * a * f.w / 2 - s * b * f.d / 2, f.y + s * a * f.w / 2 + c * b * f.d / 2] as Pt) }
  const snapSet = (excl?: string) => {
    if (!M) return { v: [] as Pt[], e: [] as [Pt, Pt][], fe: [] as [Pt, Pt][], mk: new Set<string>(), ck: new Set<string>(), xs: [] as number[], ys: [] as number[] }
    if (!excl && snapCache.current?.M === M && snapCache.current.lk === layKey) return snapCache.current
    const v: Pt[] = [], e: [Pt, Pt][] = [], fe: [Pt, Pt][] = [], mk = new Set<string>(), ck = new Set<string>()
    for (const w of M.walls) { if (w.id === excl || !(w.role === 'col' ? lay.cols : lay.walls)) continue
      const rings: Pt[][] = w.shape.type === 'poly' ? w.shape.rings : [centerline(w)], seg = w.shape.type === 'seg'
      for (const r of rings) for (let i = 0; i < r.length; i++) { v.push(r[i]); if (seg && i === r.length - 1) continue; const q = r[(i + 1) % r.length]; if (w.role !== 'col') { const mq: Pt = [(r[i][0] + q[0]) / 2, (r[i][1] + q[1]) / 2]; v.push(mq); mk.add(pk(mq)) } e.push([r[i], q]); if (!seg) fe.push([r[i], q]) }
      if (seg) for (const r of footprint(w)) for (let i = 0; i < r.length; i++) { v.push(r[i]); e.push([r[i], r[(i + 1) % r.length]]); fe.push([r[i], r[(i + 1) % r.length]]) } }
    for (const r of M.rooms ?? []) { if (r.id === excl || !lay.rooms) continue; for (const q of r.poly) v.push(q) }
    for (const f of M.furn ?? []) { if (f.id === excl || !lay.furn || fgHide.includes(furnTypeOf(f.kind).group)) continue; const c = furnCorners(f); v.push(...c); ck.add(pk(c[4])); for (let i = 0; i < 4; i++) e.push([c[i], c[(i + 1) % 4]]) }
    for (const dr of M.doors) { if (dr.id === excl || !lay.doors) continue; v.push(...doorRect(dr, dr.t ?? 0.2)) }
    const uq = (a: number[]) => { const r = a.map(x => Math.round(x * 1000) / 1000).sort((p, q) => p - q); return r.filter((x, i) => i === 0 || x !== r[i - 1]) }
    const xs = uq([...v.map(q => q[0]), ...(lay.axes ? (M.axes ?? []).filter(a => a.dir === 'v').map(a => a.pos) : [])]), ys = uq([...v.map(q => q[1]), ...(lay.axes ? (M.axes ?? []).filter(a => a.dir === 'h').map(a => a.pos) : [])])
    const out = { M, v, e, fe, mk, ck, lk: layKey, xs, ys }; if (!excl) snapCache.current = out; return out
  }
  /** Độ dời để một nhóm điểm của vật đang kéo bắt vào đối tượng khác: ưu tiên đỉnh, rồi gióng thẳng trục, rồi áp mép (giữ Alt để tắt) */
  const nearestIn = (a: number[], x: number) => { let lo = 0, hi = a.length - 1; if (hi < 0) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m; else hi = m } return Math.abs(a[lo] - x) <= Math.abs(a[hi] - x) ? a[lo] : a[hi] }
  /** Dóng hàng kiểu Canva: cạnh trái/giữa/phải và trên/giữa/dưới của vật đang kéo căn thẳng với đỉnh/cạnh/tâm/trục của vật khác. Trả về độ dời + các đường dóng. */
  const alignTo = (kx: number[], ky: number[], box: [number, number, number, number], tol: number, set: { v: Pt[]; xs: number[]; ys: number[] }) => {
    let bx: { d: number; t: number; k: number } | null = null, by: { d: number; t: number; k: number } | null = null
    for (const k of kx) { const t = nearestIn(set.xs, k); if (t === null) continue; const d = Math.abs(t - k); if (d < tol && (!bx || d < bx.d)) bx = { d, t, k } }
    for (const k of ky) { const t = nearestIn(set.ys, k); if (t === null) continue; const d = Math.abs(t - k); if (d < tol && (!by || d < by.d)) by = { d, t, k } }
    const dx = bx ? bx.t - bx.k : 0, dy = by ? by.t - by.k : 0, g: [Pt, Pt][] = [], [x0, y0, x1, y1] = [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy]
    if (bx) { let a = y0, b = y1; for (const q of set.v) if (Math.abs(q[0] - bx.t) < 0.002) { a = Math.min(a, q[1]); b = Math.max(b, q[1]) } g.push([[bx.t, a], [bx.t, b]]) }
    if (by) { let a = x0, b = x1; for (const q of set.v) if (Math.abs(q[1] - by.t) < 0.002) { a = Math.min(a, q[0]); b = Math.max(b, q[0]) } g.push([[a, by.t], [b, by.t]]) }
    return { dx, dy, g, hit: !!(bx || by) }
  }
  const snapDelta = (pts: Pt[], excl: string): { d: Pt; mark: Pt | null } => {
    const tol = vb.w / Math.max(300, size.w) * 10, { v, e } = snapSet(excl); let bd = tol, d: Pt | null = null, mark: Pt | null = null
    for (const p of pts) for (const q of v) { const k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < bd) { bd = k; d = [q[0] - p[0], q[1] - p[1]]; mark = q } }
    if (d) { gref.current = []; return { d, mark } }
    let dx = 0, dy = 0, bx = tol, by = tol, mk: Pt | null = null
    for (const p of pts) for (const q of v) { const ax = Math.abs(q[0] - p[0]), ay = Math.abs(q[1] - p[1]); if (ax < bx && ay < tol * 6) { bx = ax; dx = q[0] - p[0]; mk = q } if (ay < by && ax < tol * 6) { by = ay; dy = q[1] - p[1]; mk = q } }
    if (bx < tol || by < tol) { gref.current = []; return { d: [bx < tol ? dx : 0, by < tol ? dy : 0], mark: mk } }
    if (sm.align && pts.length) { const st = snapSet(excl), xsA = pts.map(q => q[0]), ysA = pts.map(q => q[1]), x0 = Math.min(...xsA), x1 = Math.max(...xsA), y0 = Math.min(...ysA), y1 = Math.max(...ysA), al = alignTo([x0, (x0 + x1) / 2, x1, ...xsA], [y0, (y0 + y1) / 2, y1, ...ysA], [x0, y0, x1, y1], tol, st); if (al.hit) { gref.current = al.g; return { d: [al.dx, al.dy], mark: null } } }
    let be = tol * 0.7, ed: Pt | null = null, em: Pt | null = null
    for (const p of pts) for (const [a, b] of e) { const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; if (L2 < 1e-9) continue; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2)), qx = a[0] + t * ex, qy = a[1] + t * ey, k = Math.hypot(qx - p[0], qy - p[1]); if (k < be) { be = k; ed = [qx - p[0], qy - p[1]]; em = [qx, qy] } }
    return ed ? { d: ed, mark: em } : { d: [0, 0], mark: null }
  }
  const [snapMark, setSnapMark] = useState<Pt | null>(null)
  const toModel = (e: { clientX: number; clientY: number }): Pt => { const r = box.current!.getBoundingClientRect(); return [vb.x + (e.clientX - r.left) / r.width * vb.w, vb.y + (e.clientY - r.top) / r.height * vb.h] }
  /** Bắt điểm kiểu CAD: đầu mút › giao điểm › giữa › tâm › trục › vuông góc › gần nhất › góc cực/ngang-dọc › lưới */
  const snapInfo = (p: Pt, from?: Pt | null): { p: Pt; kind: SnapKind; g?: [Pt, Pt][] } => {
    if (!M) return { p, kind: '' }
    const tol = vb.w / Math.max(300, size.w) * 8, { v, e, fe, mk, ck } = snapSet()
    let bd = tol, bq: Pt | null = null, bk: SnapKind = ''
    for (const q of v) { const kd: SnapKind = mk.has(pk(q)) ? 'mid' : ck.has(pk(q)) ? 'cen' : 'end'; if (!sm[kd]) continue; const k = Math.hypot(q[0] - p[0], q[1] - p[1]) * (kd === 'end' ? 0.85 : 1); if (k < bd) { bd = k; bq = q; bk = kd } }
    if (bq) return { p: bq, kind: bk }
    const near: [Pt, Pt][] = []
    if (sm.int || sm.per) for (const ed of e) { const [a, b] = ed, ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; if (L2 < 1e-9) continue; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2)); if (Math.hypot(a[0] + t * ex - p[0], a[1] + t * ey - p[1]) < tol * 3) { near.push(ed); if (near.length >= 40) break } }
    if (sm.int) { bd = tol; for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) { const [a, b] = near[i], [c, d] = near[j], r1x = b[0] - a[0], r1y = b[1] - a[1], r2x = d[0] - c[0], r2y = d[1] - c[1], den = r1x * r2y - r1y * r2x; if (Math.abs(den) < 1e-9) continue; const t = ((c[0] - a[0]) * r2y - (c[1] - a[1]) * r2x) / den, u = ((c[0] - a[0]) * r1y - (c[1] - a[1]) * r1x) / den; if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) continue; const q: Pt = [a[0] + t * r1x, a[1] + t * r1y], k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < bd) { bd = k; bq = q } } if (bq) return { p: bq, kind: 'int' } }
    if (sm.axis && M.axes?.length) { let x: number | null = null, y: number | null = null; for (const a of M.axes) { if (a.dir === 'v' && Math.abs(p[0] - a.pos) < tol && (x === null || Math.abs(p[0] - a.pos) < Math.abs(p[0] - x))) x = a.pos; if (a.dir === 'h' && Math.abs(p[1] - a.pos) < tol && (y === null || Math.abs(p[1] - a.pos) < Math.abs(p[1] - y))) y = a.pos } if (x !== null || y !== null) return { p: [x ?? p[0], y ?? p[1]], kind: 'axis' } }
    if (sm.per && from) { bd = tol; for (const [a, b] of near) { const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey, t = ((from[0] - a[0]) * ex + (from[1] - a[1]) * ey) / L2; if (t < 0 || t > 1) continue; const q: Pt = [a[0] + t * ex, a[1] + t * ey], k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < bd) { bd = k; bq = q } } if (bq) return { p: bq, kind: 'per' } }
    if (sm.nea && (tool === 'wall' || tool === 'glasskit')) {
      const wt = tool === 'glasskit' ? kindOf(gKind).t : kindOf(newKind).t, h = wt / 2, cand: { err: number; q: Pt; g: [Pt, Pt] }[] = []
      for (const [a, b] of fe) { const ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey); if (el < Math.max(0.1, wt)) continue
        const ux = ex / el, uy = ey / el, nx = -uy, ny = ux, ds = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny, t = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / el
        if (t < -0.05 || t > 1.05) continue
        if (from) { const dx = p[0] - from[0], dy = p[1] - from[1], L = Math.hypot(dx, dy); if (L > 0.05 && Math.abs(dx * uy - dy * ux) / L > 0.12) continue }
        for (const sd of [1, -1]) { const err = Math.abs(ds - sd * h); if (err < tol * 1.5) cand.push({ err, q: [p[0] - nx * (ds - sd * h), p[1] - ny * (ds - sd * h)], g: [[a[0] + nx * sd * h, a[1] + ny * sd * h], [b[0] + nx * sd * h, b[1] + ny * sd * h]] }) } }
      cand.sort((m, n) => m.err - n.err)
      const inside = (q: Pt) => M.walls.some(w => footprint(w).some(r => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { if ((r[i][1] > q[1]) !== (r[k][1] > q[1]) && q[0] < (r[k][0] - r[i][0]) * (q[1] - r[i][1]) / (r[k][1] - r[i][1]) + r[i][0]) c = !c } return c }))
      for (const c of cand.slice(0, 12)) if (!inside(c.q)) return { p: c.q, kind: 'nea', g: [c.g] }
    }
    if (sm.nea) { bd = tol * 0.6; for (const [a, b] of e) { const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; if (L2 < 1e-9) continue; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2)), q: Pt = [a[0] + t * ex, a[1] + t * ey], k = Math.hypot(q[0] - p[0], q[1] - p[1]); if (k < bd) { bd = k; bq = q } } if (bq) return { p: bq, kind: 'nea' } }
    if (sm.align) { const st = snapSet(), al = alignTo([p[0]], [p[1]], [p[0], p[1], p[0], p[1]], tol, st); if (al.hit) return { p: [p[0] + al.dx, p[1] + al.dy], kind: 'align', g: al.g } }
    if (from && sm.polar) { const dx = p[0] - from[0], dy = p[1] - from[1], L = Math.hypot(dx, dy), st = Math.PI / 12, a = Math.atan2(dy, dx), an = Math.round(a / st) * st; if (L > 1e-6 && Math.abs(a - an) < 0.045) return { p: [from[0] + Math.cos(an) * L, from[1] + Math.sin(an) * L], kind: 'polar' } }
    if (from && ortho) { const dx = p[0] - from[0], dy = p[1] - from[1]; if (Math.abs(dy) < Math.abs(dx) * 0.07) return { p: [p[0], from[1]], kind: 'polar' }; if (Math.abs(dx) < Math.abs(dy) * 0.07) return { p: [from[0], p[1]], kind: 'polar' } }
    if (sm.grid) { const g = 0.1; return { p: [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g], kind: 'grid' } }
    return { p, kind: '' }
  }
  const snapPt = (p: Pt, from?: Pt | null): Pt => { const r = snapInfo(p, from); gref.current = r.g ?? []; return r.p }

  const onWallDown = (e: React.PointerEvent, w: Wall) => {
    if (tool !== 'select' || (w.role === 'col' ? lock.cols : lock.walls)) return
    e.stopPropagation(); let o = w; if ((e.ctrlKey || e.metaKey) && M) { const r = applyXf(M, { t: 'wall', id: w.id }, mkMove(0, 0), true); hist.current.push(M); setNh(hist.current.length); setM(r.M); o = r.M.walls.find(x => x.id === r.sel.id)!; setSel(r.sel); drag.current = { k: 'moveWall', id: o.id, p0: toModel(e), orig: o, moved: true } } else { setSel({ t: 'wall', id: w.id }); drag.current = { k: 'moveWall', id: w.id, p0: toModel(e), orig: w, moved: false } }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onDoorDown = (e: React.PointerEvent, d: Door) => {
    if (tool !== 'select' || lock.doors) return
    e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && M) { const r = applyXf(M, { t: 'door', id: d.id }, mkMove(0, 0), true); hist.current.push(M); setNh(hist.current.length); setM(r.M); const o = r.M.doors.find(x => x.id === r.sel.id)!; setSel(r.sel); drag.current = { k: 'moveDoor', id: o.id, orig: o, moved: true } } else { setSel({ t: 'door', id: d.id }); drag.current = { k: 'moveDoor', id: d.id, orig: d, moved: false } }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleDown = (e: React.PointerEvent, id: string, ring: number, vi: number) => { e.stopPropagation(); drag.current = { k: 'vertex', id, ring, vi, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onBendDown = (e: React.PointerEvent, id: string) => { e.stopPropagation(); drag.current = { k: 'bend', id, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onDimDown = (e: React.PointerEvent, d: Dim) => { if (tool !== 'select' || lock.dims) return; e.stopPropagation(); setSel({ t: 'dim', id: d.id }) }
  const onFurnDown = (e: React.PointerEvent, f: Furn) => { if (tool !== 'select' || lock.furn) return; e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && M) { const r = applyXf(M, { t: 'furn', id: f.id }, mkMove(0, 0), true); hist.current.push(M); setNh(hist.current.length); setM(r.M); const o = (r.M.furn ?? []).find(x => x.id === r.sel.id)!; setSel(r.sel); drag.current = { k: 'moveFurn', id: o.id, p0: toModel(e), orig: o, moved: true } } else { setSel({ t: 'furn', id: f.id }); drag.current = { k: 'moveFurn', id: f.id, p0: toModel(e), orig: f, moved: false } }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  /** Nắm mũi tên đổi kích thước / xoay: k = loại, ex = tham số thêm */
  const onArrow = (e: React.PointerEvent, k: string, id: string, orig: unknown, ex: Record<string, unknown> = {}) => { e.stopPropagation(); drag.current = { k, id, orig, moved: false, p0: toModel(e), ...ex }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const mm = (v: number) => Math.round(v * 1000)
  const onDimHandle = (e: React.PointerEvent, id: string, k: 'dimA' | 'dimB' | 'dimOff') => { e.stopPropagation(); drag.current = { k, id, orig: (M!.dims ?? []).find(x => x.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
  const onEndDown = (e: React.PointerEvent, id: string, which: 'a' | 'b') => { e.stopPropagation(); drag.current = { k: 'end', id, which, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }

  /** Thêm một đoạn tường (hoặc vách kính + cửa) từ a đến q, rồi nối tiếp từ q */
  const addLine = (a: Pt, q: Pt) => {
    if (!M) return
    let src: Wall | undefined
    if (autoJoin) { const j = joinEnds(M, a, q); a = j.a; q = j.b; src = [j.wa, j.wb].find(w => w && w.role === 'wall') }
    const L = Math.hypot(q[0] - a[0], q[1] - a[1]); if (L < 0.02) return
    { const nt = tool === 'glasskit' ? kindOf(gKind).t : (autoMatch && src && src.shape.type === 'seg' ? src.shape.t : kindOf(newKind).t), hit = newWallOverlap(M, a, q, nt)
      if (hit) { setErr(`Tường mới đè lên ${hit.role === 'col' ? 'cột' : 'tường'} cũ «${kindOf(hit.kind).label}». Bật ◇ Mép: tường sẽ tự áp sát mép tường cũ (không đè); hoặc vẽ nối đầu mút để tự khớp.`); return }
      setErr('') }
    const inh: Partial<Wall> = autoMatch && src ? { h: src.h, finish: src.finish } : {}
    const note = src ? (autoMatch ? `Đã khớp giao điểm với tường cũ và lấy cao độ${tool === 'wall' ? ', vật liệu, độ dày' : ''} của tường đó.` : 'Đã khớp giao điểm với tường cũ.') : autoJoin && (a !== undefined) ? '' : ''
    if (note) { setBusy(note); setTimeout(() => setBusy(''), 3500) }
    if (tool === 'glasskit') {
      const gk = kindOf(gKind), w: Wall = { id: uid('w'), role: 'wall', kind: gKind, h: inh.h, panel: gk.panel ?? newPanel, shape: { type: 'seg', a, b: q, t: gk.t } }
      const doors = [...M.doors], sp = gDoor === 'none' ? null : doorSpec(gDoor, customDoors)
      if (sp && L >= sp.w + 0.1) { const ux = (q[0] - a[0]) / L, uy = (q[1] - a[1]) / L, s = gPos === 'mid' ? L / 2 : gPos === 'start' ? sp.w / 2 + 0.05 : L - sp.w / 2 - 0.05
        doors.push({ id: uid('d'), kind: sp.kind, lib: sp.id, x: a[0] + ux * s, y: a[1] + uy * s, ang: Math.atan2(uy, ux), w: sp.w, h: sp.h, sill: sp.sill, t: gk.t }) }
      commit({ ...M, walls: [...M.walls, w], doors })
    } else {
      const kd = autoMatch && src ? src.kind : newKind, th = autoMatch && src && src.shape.type === 'seg' ? src.shape.t : kindOf(kd).t
      const w: Wall = { id: uid('w'), role: 'wall', kind: kd, h: inh.h, finish: inh.finish, panel: kindOf(kd).glass ? (src?.panel ?? newPanel) : undefined, shape: { type: 'seg', a, b: q, t: th } }
      commit({ ...M, walls: [...M.walls, w] })
    }
    setPending(q); setLenBuf('')
  }
  const onDown = (e: React.PointerEvent) => {
    if (!M) return
    if (ed) setEd(null)
    if (e.button === 2) { setPending(null); setPts([]); return }
    const p = toModel(e)
    const shpE: Shape = tool === 'roomPoly' && shp === 'arc' ? 'line' : shp
    if ((tool === 'wall' || tool === 'glasskit' || tool === 'roomPoly') && shpE !== 'line') {
      const q = snapPt(p, pts[pts.length - 1] ?? null), n = [...pts, q], need = shpE === 'arc' ? 3 : 2
      if (n.length < need) { setPts(n); return }
      if (tool === 'roomPoly') { const poly = shapePoly(shpE, n); setPts([]); if (!poly) return; const ov = roomOverlap(M, poly); if (ov) { setErr(`Sàn này đè lên «${ov.name}». Sàn chỉ được chạm biên nhau, không chồng lên nhau.`); return } setErr(''); const k = (M.rooms ?? []).length + 1, room: Room = { id: uid('r'), name: 'Sàn ' + k, poly, floor: floorFin || undefined }; commit({ ...M, rooms: [...(M.rooms ?? []), room] }); setSel({ t: 'room', id: room.id }); return }
      const kd = tool === 'glasskit' ? gKind : newKind, ws = buildShape(shpE, n, kd, tool === 'glasskit' ? kindOf(kd).panel ?? newPanel : newPanel); setPts([]); if (ws) commit({ ...M, walls: [...M.walls, ...ws] }); return
    }
    if (tool === 'wall' || tool === 'glasskit') {
      const q = snapPt(p, pending)
      if (!pending) { setPending(q); setLenBuf(''); return }
      if (Math.hypot(q[0] - pending[0], q[1] - pending[1]) < 0.05) { setPending(null); return }
      addLine(pending, q); return
    }
    if (tool === 'axisV' || tool === 'axisH') { const q = snapPt(p); addAxis(tool === 'axisV' ? 'v' : 'h', tool === 'axisV' ? q[0] : q[1]); return }
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
      const t = furnTypeOf(libFurn), q = snapPt(p), f: Furn = { id: uid('f'), kind: t.key, x: q[0], y: q[1], w: t.w, d: t.d, ang: 0, h: t.h, z: t.z }
      if (furnHitsWall(M, f)) { setErr('Vị trí này đè lên tường/cột – đặt vào chỗ trống (chạm mép tường thì được).'); return } setErr('')
      commit({ ...M, furn: [...(M.furn ?? []), f] }); setSel({ t: 'furn', id: f.id }); return
    }
    if (tool === 'door') {
      const sp = doorSpec(libDoor, customDoors) ?? DOOR_LIB[0]
      if (!dpA) { const A = e.altKey ? p : snapPt(p), sn0 = snapToWall(M, A, 0.8, 0.05); if (!sn0) { setErr('Bấm sát tường: điểm 1 = một mép của ô cửa (đầu tường / mép tường), điểm 2 = mép bên kia. Bấm 1 điểm rồi bấm lại ngay chỗ đó = cửa theo kích thước thư viện.'); return } setErr(''); setDpA({ p: A, ang: sn0.ang }); return }
      const A = dpA.p, ux = Math.cos(dpA.ang), uy = Math.sin(dpA.ang), B = e.altKey ? p : snapPt(p, A), Wd = (B[0] - A[0]) * ux + (B[1] - A[1]) * uy; setDpA(null)
      let d: Door
      if (Math.abs(Wd) < 0.15) { const sn = snapToWall(M, A, 0.6, sp.w); if (!sn) { setErr('Bấm sát vào một đoạn tường để đặt cửa.'); return } d = { id: uid('d'), kind: sp.kind, lib: sp.id, x: sn.x, y: sn.y, ang: sn.ang, w: sp.w, h: sp.h, sill: sp.sill, t: sn.thick || 0.2 } }
      else { const w = Math.round(Math.abs(Wd) * 1000) / 1000, c = centerDoor(M.walls, { x: A[0] + ux * Wd / 2, y: A[1] + uy * Wd / 2, ang: dpA.ang, w }); d = { id: uid('d'), kind: sp.kind, lib: sp.id, x: c.x, y: c.y, ang: dpA.ang, w, h: sp.h, sill: sp.sill, t: c.t } }
      setErr(''); commit({ ...M, doors: [...M.doors, d] }); setSel({ t: 'door', id: d.id }); return
    }
    setSel(null); drag.current = { k: 'pan', x: e.clientX, y: e.clientY, vb }; (box.current as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => { onMoveInner(e); const g = gref.current; if (g.length || guides.length) setGuides(g) }
  const onMoveInner = (e: React.PointerEvent) => {
    gref.current = []
    const d = drag.current, p = toModel(e); setCursor(p)
    if (!d || !M) return
    gref.current = []
    if (d.k === 'pan') { const r = box.current!.getBoundingClientRect(), s = d.vb.w / r.width; setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * s, y: d.vb.y - (e.clientY - d.y) * s }); return }
    if (!d.moved) { hist.current.push(M); setNh(hist.current.length); d.moved = true }
    const upd = (f: (w: Wall) => Wall) => setM(cur => cur && { ...cur, walls: cur.walls.map(w => w.id === d.id ? f(d.orig) : w) })
    if (d.k === 'moveWall') { let dx = p[0] - d.p0[0], dy = p[1] - d.p0[1]; const o = d.orig as Wall, mp = (o.shape.type === 'poly' ? o.shape.rings.flat() : [o.shape.a, o.shape.b, ...footprint(o).flat()]).filter((_, i, a) => a.length <= 40 || i % Math.ceil(a.length / 40) === 0).map(q => [q[0] + dx, q[1] + dy] as Pt), sn = e.altKey ? { d: [0, 0] as Pt, mark: null } : snapDelta(mp, o.id); dx += sn.d[0]; dy += sn.d[1]; setSnapMark(sn.mark); setHud({ p, t: `Δx ${mm(dx)} · Δy ${mm(dy)} mm` }); upd(w => w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map(r => r.map(q => [q[0] + dx, q[1] + dy] as Pt)) } } : { ...w, shape: { ...w.shape, a: [w.shape.a[0] + dx, w.shape.a[1] + dy], b: [w.shape.b[0] + dx, w.shape.b[1] + dy] } }) }
    else if (d.k === 'vertex') { const q = snapPt(p), ov = (d.orig as Wall).shape.type === 'poly' ? ((d.orig as Wall).shape as { rings: Pt[][] }).rings[d.ring][d.vi] : q; setHud({ p: q, t: `Δx ${mm(q[0] - ov[0])} · Δy ${mm(q[1] - ov[1])} mm` }); upd(w => w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map((r, i) => i === d.ring ? r.map((v, j) => j === d.vi ? q : v) : r) } } : w) }
    else if (d.k === 'end') { const o = d.orig as Wall; if (o.shape.type !== 'seg') return; const other = d.which === 'a' ? o.shape.b : o.shape.a; let q = snapPt(p, other); if (!e.altKey && q === p) { const L0 = Math.hypot(q[0] - other[0], q[1] - other[1]) || 1, L1 = Math.round(L0 * 100) / 100; q = [other[0] + (q[0] - other[0]) * L1 / L0, other[1] + (q[1] - other[1]) * L1 / L0] } setHud({ p: q, t: `${mm(Math.hypot(q[0] - other[0], q[1] - other[1]))} mm · ${(((Math.atan2(q[1] - other[1], q[0] - other[0]) * 180 / Math.PI) % 360 + 360) % 360).toFixed(1)}°` }); upd(w => w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, [d.which]: q } } : w) }
    else if (d.k === 'roomV') { const q = snapPt(p), rr = (d.orig as Room); if (roomOverlap(M, rr.poly.map((v, j) => j === d.vi ? q : v), rr.id)) { setHud({ p, t: '⛔ chồng lên sàn khác' }); return } setM(cur => cur && { ...cur, rooms: (cur.rooms ?? []).map(r => r.id === d.id ? { ...r, poly: r.poly.map((v, j) => j === d.vi ? q : v), area: undefined } : r) }) }
    else if (d.k === 'bend') { const o = d.orig as Wall; if (o.shape.type !== 'seg') return; const { a, b } = o.shape, c = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / c, ny = (b[0] - a[0]) / c, bu = (p[0] - (a[0] + b[0]) / 2) * nx + (p[1] - (a[1] + b[1]) / 2) * ny; setHud({ p, t: `độ võng ${mm(bu)} mm` }); upd(w => w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, bulge: Math.abs(bu) < 0.03 ? undefined : bu } } : w) }
    else if (d.k === 'moveFurn') { let dx = p[0] - d.p0[0], dy = p[1] - d.p0[1]; const o = d.orig as Furn, sn = e.altKey ? { d: [0, 0] as Pt, mark: null } : snapDelta(furnCorners({ ...o, x: o.x + dx, y: o.y + dy }), o.id); dx += sn.d[0]; dy += sn.d[1]; setSnapMark(sn.mark); if (d.sh === undefined) d.sh = !!furnHitsWall(M, o)
      let nx = o.x + dx, ny = o.y + dy, blocked = false
      if (!d.sh) { // đi từng bước nhỏ từ vị trí hợp lệ trước đó để không "xuyên" qua tường mỏng; chạm tường thì trượt dọc theo tường
        const walk = (f: Pt, t: Pt): Pt => { const n = Math.max(1, Math.ceil(Math.hypot(t[0] - f[0], t[1] - f[1]) / 0.03)); let c = f; for (let i = 1; i <= n; i++) { const q: Pt = [f[0] + (t[0] - f[0]) * i / n, f[1] + (t[1] - f[1]) * i / n]; if (furnHitsWall(M, { ...o, x: q[0], y: q[1] })) break; c = q } return c }
        const last: Pt = d.last ?? [o.x, o.y]; let r = walk(last, [nx, ny])
        if (Math.hypot(r[0] - nx, r[1] - ny) > 1e-6) { blocked = true; r = walk(r, [nx, r[1]]); r = walk(r, [r[0], ny]) }
        d.last = r; nx = r[0]; ny = r[1] }
      setHud({ p, t: blocked ? `⛔ đụng tường · Δx ${mm(nx - o.x)} · Δy ${mm(ny - o.y)} mm` : `Δx ${mm(nx - o.x)} · Δy ${mm(ny - o.y)} mm` }); setM(cur => cur && { ...cur, furn: (cur.furn ?? []).map(x => x.id === d.id ? { ...x, x: nx, y: ny } : x) }) }
    else if (d.k === 'dimA' || d.k === 'dimB') { const o = d.orig as Dim, q = snapPt(p, d.k === 'dimA' ? o.b : o.a); setM(cur => cur && { ...cur, dims: (cur.dims ?? []).map(x => x.id === d.id ? { ...x, [d.k === 'dimA' ? 'a' : 'b']: q } : x) }) }
    else if (d.k === 'dimOff') { const o = d.orig as Dim, L = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) || 1, off = ((p[0] - o.a[0]) * -(o.b[1] - o.a[1]) + (p[1] - o.a[1]) * (o.b[0] - o.a[0])) / L; setM(cur => cur && { ...cur, dims: (cur.dims ?? []).map(x => x.id === d.id ? { ...x, off } : x) }) }
    else if (d.k === 'moveDoor') { const s = snapToWall(M, p, 1.2, (d.orig as Door).w); if (s) { const o = d.orig as Door; setHud({ p, t: `dời ${mm(Math.hypot(s.x - o.x, s.y - o.y))} mm` }); setM(cur => cur && { ...cur, doors: cur.doors.map(x => x.id === d.id ? { ...x, x: s.x, y: s.y, ang: s.ang, t: s.thick || x.t } : x) }) } }
    else if (d.k === 'axisMove') { const a = d.orig as { dir: 'v' | 'h'; pos: number }, q = snapInfo(p); let pos = a.dir === 'v' ? q.p[0] : q.p[1]; if (!e.altKey && q.kind === '') pos = Math.round(pos * 100) / 100; setHud({ p, t: `trục ${mm(pos)} mm` }); setM(cur => cur && { ...cur, axes: (cur.axes ?? []).map(x => x.id === d.id ? { ...x, pos, auto: false } : x) }) }
    else if (d.k === 'wThick') { const o = d.orig as Wall; if (o.shape.type !== 'seg') return; const { a, b } = o.shape, L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, pr = Math.abs((p[0] - (a[0] + b[0]) / 2) * -(b[1] - a[1]) / L + (p[1] - (a[1] + b[1]) / 2) * (b[0] - a[0]) / L); let t = Math.max(0.02, 2 * pr); if (!e.altKey) t = Math.round(t * 100) / 100; setHud({ p, t: `dày ${mm(t)} mm` }); upd(w => w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, t } } : w) }
    else if (d.k === 'edge') { const o = d.orig as Wall; if (o.shape.type !== 'poly') return; const r = o.shape.rings[d.ring], a = r[d.vi], b = r[(d.vi + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; let sft = (p[0] - d.p0[0]) * nx + (p[1] - d.p0[1]) * ny; if (!e.altKey) sft = Math.round(sft * 100) / 100; setHud({ p, t: `đẩy cạnh ${mm(sft)} mm` })
      upd(w => w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map((rr, ri) => ri === d.ring ? rr.map((v, j) => j === d.vi || j === (d.vi + 1) % rr.length ? [v[0] + nx * sft, v[1] + ny * sft] as Pt : v) : rr) } } : w) }
    else if (d.k === 'doorEnd') { const o = d.orig as Door, ux = Math.cos(o.ang), uy = Math.sin(o.ang), sc = (p[0] - o.x) * ux + (p[1] - o.y) * uy; let w = d.sg > 0 ? sc + o.w / 2 : o.w / 2 - sc; w = Math.max(0.3, w); if (!e.altKey) w = Math.round(w * 100) / 100; const sh = d.sg * (w - o.w) / 2, nd = { ...o, w, x: o.x + ux * sh, y: o.y + uy * sh }, fm = fitWallsToDoor(d.base ?? M, o, nd); setHud({ p, t: `rộng ${mm(w)} mm` }); setM(cur => cur && { ...cur, walls: fm.walls, doors: cur.doors.map(x => x.id === d.id ? nd : x) }) }
    else if (d.k === 'furnSz') { const o = d.orig as Furn, ax: Pt = d.ax === 'w' ? [Math.cos(o.ang), Math.sin(o.ang)] : [-Math.sin(o.ang), Math.cos(o.ang)], sc = (p[0] - o.x) * ax[0] + (p[1] - o.y) * ax[1], cur0 = d.ax === 'w' ? o.w : o.d; let nv = d.sg > 0 ? sc + cur0 / 2 : cur0 / 2 - sc; nv = Math.max(0.1, nv); if (!e.altKey) nv = Math.round(nv * 100) / 100; const sh = d.sg * (nv - cur0) / 2; if (d.sh === undefined) d.sh = !!furnHitsWall(M, o); if (!d.sh && furnHitsWall(M, { ...o, [d.ax]: nv, x: o.x + ax[0] * sh, y: o.y + ax[1] * sh })) { setHud({ p, t: '⛔ đụng tường' }); return } setHud({ p, t: `${d.ax === 'w' ? 'rộng' : 'sâu'} ${mm(nv)} mm` }); setM(cur => cur && { ...cur, furn: (cur.furn ?? []).map(x => x.id === d.id ? { ...x, [d.ax]: nv, x: o.x + ax[0] * sh, y: o.y + ax[1] * sh } : x) }) }
    else if (d.k === 'furnRot') { const o = d.orig as Furn; let a = Math.atan2(p[1] - o.y, p[0] - o.x) + Math.PI / 2; const st = (e.shiftKey ? 15 : 1) * Math.PI / 180; if (!e.altKey) a = Math.round(a / st) * st; if (d.sh === undefined) d.sh = !!furnHitsWall(M, o); if (!d.sh && furnHitsWall(M, { ...o, ang: a })) { setHud({ p, t: '⛔ đụng tường' }); return } setHud({ p, t: `xoay ${(((a * 180 / Math.PI) % 360 + 360) % 360).toFixed(0)}°` }); setM(cur => cur && { ...cur, furn: (cur.furn ?? []).map(x => x.id === d.id ? { ...x, ang: a } : x) }) }
  }
  const onUp = () => { drag.current = null; setSnapMark(null); setHud(null); gref.current = []; setGuides([]) }
  const closePoly = () => { if (!M || pts.length < 3) return; const ov = roomOverlap(M, pts); if (ov) { setErr(`Sàn này đè lên «${ov.name}». Sàn chỉ được chạm biên nhau, không chồng lên nhau.`); setPts([]); return } setErr(''); const n = (M.rooms ?? []).length + 1, room: Room = { id: uid('r'), name: 'Sàn ' + n, poly: pts, floor: floorFin || undefined }; commit({ ...M, rooms: [...(M.rooms ?? []), room] }); setPts([]); setSel({ t: 'room', id: room.id }) }
  const onDouble = (e: React.MouseEvent) => {
    setPending(null)
    if (tool === 'roomPoly') { return }
    if (tool === 'select' && M && selRoom) { // sửa cạnh phòng gần nhất
      const p = toModel(e), tol = vb.w / Math.max(300, size.w) * 12; let bi = -1, bq: Pt = [0, 0], bd = tol
      selRoom.poly.forEach((a, i) => { const b = selRoom.poly[(i + 1) % selRoom.poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) return; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bi = i; bq = q } })
      if (bi >= 0) openEd('room', selRoom.id, 0, bi, bq, Math.hypot(selRoom.poly[(bi + 1) % selRoom.poly.length][0] - selRoom.poly[bi][0], selRoom.poly[(bi + 1) % selRoom.poly.length][1] - selRoom.poly[bi][1]))
      return
    }
    if (tool === 'select' && M && selWall?.shape.type === 'poly') { // sửa cạnh gần nhất
      const p = toModel(e), tol = vb.w / Math.max(300, size.w) * 10; let best: { ri: number; i: number; q: Pt; L: number } | null = null, bd = tol
      selWall.shape.rings.forEach((r, ri) => r.forEach((a, i) => { const b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-9) return; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q: Pt = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = { ri, i, q, L: Math.sqrt(L2) } } }))
      const bb = best as { ri: number; i: number; q: Pt; L: number } | null
      if (bb) openEd('poly', selWall.id, bb.ri, bb.i, bb.q, bb.L)
      return
    }
    if (tool === 'select' && M && selWall?.shape.type === 'seg') { const sh = selWall.shape; openEd('seg', selWall.id, 0, 0, toModel(e), Math.hypot(sh.b[0] - sh.a[0], sh.b[1] - sh.a[1]), sh.t) }
  }
  const openEd = (k: 'poly' | 'seg' | 'room', id: string, ring: number, vi: number, q: Pt, L: number, t?: number) => { setEd({ k, id, ring, vi, q }); setEdv({ len: String(Math.round(L * 1000)), push: '0', thick: t !== undefined ? String(Math.round(t * 1000)) : '', fix: 'c' }) }
  /** Áp số gõ vào cạnh: đổi chiều dài (giữ đầu A / B / giữa), đẩy vuông góc, đổi dày */
  const applyEd = () => {
    if (!ed || !M) return
    const nzv = (v: string, d: number) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) ? n : d }
    let A: Pt, B: Pt
    if (ed.k === 'poly') { const w = M.walls.find(x => x.id === ed.id); if (w?.shape.type !== 'poly') return; const r = w.shape.rings[ed.ring]; A = r[ed.vi]; B = r[(ed.vi + 1) % r.length] }
    else if (ed.k === 'seg') { const w = M.walls.find(x => x.id === ed.id); if (w?.shape.type !== 'seg') return; A = w.shape.a; B = w.shape.b }
    else { const r = (M.rooms ?? []).find(x => x.id === ed.id); if (!r) return; A = r.poly[ed.vi]; B = r.poly[(ed.vi + 1) % r.poly.length] }
    const L0 = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L0, uy = (B[1] - A[1]) / L0, L1 = Math.max(0.01, nzv(edv.len, L0 * 1000) / 1000), ps = nzv(edv.push, 0) / 1000
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2
    let A2: Pt = edv.fix === 'a' ? A : edv.fix === 'b' ? [B[0] - ux * L1, B[1] - uy * L1] : [mx - ux * L1 / 2, my - uy * L1 / 2]
    let B2: Pt = edv.fix === 'a' ? [A[0] + ux * L1, A[1] + uy * L1] : edv.fix === 'b' ? B : [mx + ux * L1 / 2, my + uy * L1 / 2]
    A2 = [A2[0] - uy * ps, A2[1] + ux * ps]; B2 = [B2[0] - uy * ps, B2[1] + ux * ps]
    if (ed.k === 'poly') commit({ ...M, walls: M.walls.map(w => w.id === ed.id && w.shape.type === 'poly' ? { ...w, shape: { type: 'poly', rings: w.shape.rings.map((r, ri) => ri === ed.ring ? r.map((v, j) => j === ed.vi ? A2 : j === (ed.vi + 1) % r.length ? B2 : v) : r) } } : w) })
    else if (ed.k === 'seg') commit({ ...M, walls: M.walls.map(w => w.id === ed.id && w.shape.type === 'seg' ? { ...w, shape: { ...w.shape, a: A2, b: B2, t: edv.thick ? Math.max(0.02, nzv(edv.thick, w.shape.t * 1000) / 1000) : w.shape.t } } : w) })
    else { const rr = (M.rooms ?? []).find(x => x.id === ed.id)!, np = rr.poly.map((v, j) => j === ed.vi ? A2 : j === (ed.vi + 1) % rr.poly.length ? B2 : v), ov = roomOverlap(M, np, rr.id); if (ov) { setErr(`Cạnh mới làm sàn đè lên «${ov.name}».`); return } commit({ ...M, rooms: (M.rooms ?? []).map(r => r.id === ed.id ? { ...r, poly: np, area: undefined } : r) }) }
    setEd(null)
  }
  const addVertexEd = () => {
    if (!ed || !M || ed.k === 'seg') return
    if (ed.k === 'poly') { const w = M.walls.find(x => x.id === ed.id); if (w?.shape.type !== 'poly') return; setWall(w.id, { shape: { type: 'poly', rings: w.shape.rings.map((r, ri) => ri === ed.ring ? [...r.slice(0, ed.vi + 1), ed.q, ...r.slice(ed.vi + 1)] : r) } }) }
    else { const r = (M.rooms ?? []).find(x => x.id === ed.id); if (r) setRoom(r.id, { poly: [...r.poly.slice(0, ed.vi + 1), ed.q, ...r.poly.slice(ed.vi + 1)], area: undefined }) }
    setEd(null)
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
      if ((tool === 'wall' || tool === 'glasskit') && shp === 'line' && pending && M) {
        if (/^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setLenBuf(b => b + (e.key === ',' ? '.' : e.key)); return }
        if (e.key === 'Backspace' && lenBuf) { e.preventDefault(); setLenBuf(b => b.slice(0, -1)); return }
        if (e.key === 'Enter' && lenBuf) { e.preventDefault(); const L = parseFloat(lenBuf) / 1000; if (isFinite(L) && L > 0.01) { const c = cursor ? snapPt(cursor, pending) : [pending[0] + 1, pending[1]], dl = Math.hypot(c[0] - pending[0], c[1] - pending[1]) || 1; addLine(pending, [pending[0] + (c[0] - pending[0]) / dl * L, pending[1] + (c[1] - pending[1]) / dl * L]) } setLenBuf(''); return }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && M && mode === '2d' && e.key.length === 1) {
        const k = e.key.toLowerCase(), go = (t: Tool, sh?: Shape) => { setTool(t); setPending(null); setPts([]); setLenBuf(''); if (sh) setShp(sh) }
        const foc = (id: string) => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) { e.preventDefault(); el.focus(); el.select() } }
        if (k === 'v') { go('select'); return } if (k === 'l') { go('wall', 'line'); return } if (k === 'a') { go('wall', 'arc'); return } if (k === 'c') { go('wall', 'circle'); return } if (k === 'r') { go('wall', 'rect'); return }
        if (k === 'f') { go('roomPoly', 'line'); return } if (k === 'd') { go('door'); return } if (k === 'k') { go('glasskit'); return } if (k === 'g') { go('axisV'); return } if (k === 'h') { go('axisH'); return }
        if (k === 'm') { foc('tf-dx'); return } if (k === 'q') { foc('tf-rot'); return } if (k === 'e') { foc('tf-k'); return } if (k === 'n') { foc('tf-n'); return }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel) { clip.current = sel; pasteN.current = 0; return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clip.current && M) { e.preventDefault(); pasteN.current++; const o = 0.3 * pasteN.current, r = applyXf(M, clip.current, mkMove(o, o), true); if (clip.current.t === 'room') { const nr = (r.M.rooms ?? []).find(x => x.id === r.sel.id), ov = nr ? roomOverlap(M, nr.poly) : null; if (ov) { setErr(`Bản dán sẽ đè lên sàn «${ov.name}» – dùng Sao chép với khoảng cách đủ xa.`); return } } if (r.sel.id !== clip.current.id) { commit(r.M); setSel(r.sel) } return }
      if (tool === 'select' && sel && M && e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); const st = e.shiftKey ? 0.1 : 0.01, r = applyXf(M, sel, mkMove(e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0), false); commit(r.M); return }
      if (e.key === 'Escape') { setDpA(null); setPending(null); setPts([]); setLenBuf(''); setTool('select'); return }
      if (e.key === 'Enter' && tool === 'roomPoly') { closePoly(); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel && M) { e.preventDefault(); dup(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && M) { e.preventDefault(); del() }
    }
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on)
  })
  const del = () => { if (!sel || !M) return; if (sel.t === 'axis') { commit({ ...M, axes: (M.axes ?? []).filter(a => a.id !== sel.id) }); setSel(null); return } commit(sel.t === 'wall' ? { ...M, walls: M.walls.filter(w => w.id !== sel.id) } : sel.t === 'door' ? { ...M, doors: M.doors.filter(d => d.id !== sel.id) } : sel.t === 'room' ? { ...M, rooms: (M.rooms ?? []).filter(r => r.id !== sel.id) } : sel.t === 'furn' ? { ...M, furn: (M.furn ?? []).filter(f => f.id !== sel.id) } : { ...M, dims: (M.dims ?? []).filter(d => d.id !== sel.id) }); setSel(null) }
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
  const setDoor = (id: string, patch: Partial<Door>) => { if (!M) return; const o = M.doors.find(d => d.id === id); if (!o) return; const n0 = { ...o, ...patch }, n = ('w' in patch || 'lib' in patch) && !('t' in patch) ? centerDoor(M.walls, n0) : n0, base = 'w' in patch && !('lib' in patch) ? fitWallsToDoor(M, o, n) : M; commit({ ...base, doors: base.doors.map(d => d.id === id ? n : d) }) }

  const nz = (v: string, d = 0) => { const n = parseFloat(v.replace(',', '.')); return isFinite(n) ? n : d }
  const doXf = (mk: (c: Pt) => ReturnType<typeof mkMove>) => { if (!sel || !M) return; const c = selCenter(M, sel); if (!c) return; const r = applyXf(M, sel, mk(c), false)
    if (sel.t === 'furn') { const nf = (r.M.furn ?? []).find(x => x.id === r.sel.id), of = (M.furn ?? []).find(x => x.id === sel.id); if (nf && of && furnHitsWall(M, nf) && !furnHitsWall(M, of)) { setErr('Kết quả sẽ đâm vào tường – không thực hiện.'); return } }
    if (sel.t === 'room') { const nr = (r.M.rooms ?? []).find(x => x.id === r.sel.id), ov = nr ? roomOverlap(M, nr.poly, sel.id) : null; if (ov) { setErr(`Kết quả sẽ đè lên sàn «${ov.name}» – không thực hiện.`); return } }
    setErr(''); commit(r.M) }
  const doCopies = () => { if (!sel || !M) return; const n = Math.max(1, Math.min(200, Math.round(nz(tf.n, 1)))), dx = nz(tf.cx) / 1000, dy = nz(tf.cy) / 1000; let cur = M, last = sel; for (let i = 1; i <= n; i++) { const r = applyXf(cur, sel, mkMove(dx * i, dy * i), true); if (sel.t === 'room') { const nr = (r.M.rooms ?? []).find(x => x.id === r.sel.id), ov = nr ? roomOverlap(cur, nr.poly) : null; if (ov) { setErr(`Bản sao thứ ${i} sẽ đè lên sàn «${ov.name}» – dừng ở ${i - 1} bản.`); break } } cur = r.M; last = r.sel } commit(cur); setSel(last) }
  const wb = useMemo(() => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const w of M?.walls ?? []) for (const r of w.shape.type === 'poly' ? w.shape.rings : [[w.shape.a, w.shape.b]]) for (const q of r) { if (q[0] < a) a = q[0]; if (q[0] > c) c = q[0]; if (q[1] < b) b = q[1]; if (q[1] > d) d = q[1] } return a > c ? [0, 0, M?.w ?? 10, M?.h ?? 10] : [a, b, c, d] }, [M?.walls, M?.w, M?.h])
  const fz = (v: number) => (v < -0.0005 ? '−' : '+') + Math.abs(v).toFixed(2)
  const selAxis = sel?.t === 'axis' ? (M?.axes ?? []).find(a => a.id === sel.id) : undefined
  const addAxis = (dir: 'v' | 'h', pos: number) => { if (!M) return; const ax = M.axes ?? [], used = new Set(ax.filter(a => a.dir === dir).map(a => a.name)); let name = ''; if (dir === 'v') { let i = 1; while (used.has(String(i))) i++; name = String(i) } else { let i = 0; while (used.has(String.fromCharCode(65 + i))) i++; name = String.fromCharCode(65 + i) } const a = { id: uid('x'), dir, pos: Math.round(pos * 1000) / 1000, name }; commit({ ...M, axes: [...ax, a] }); setSel({ t: 'axis', id: a.id }) }
  const runDetectAxes = () => { if (!M) return; const det = detectAxes(M); if (!det.length) { setErr('Không thấy hàng cột thẳng hàng (cần ít nhất 2 cột cùng tim). Vẽ trục tay bằng nút Trục dọc / Trục ngang.'); return } setErr(''); commit({ ...M, axes: [...(M.axes ?? []).filter(a => !a.auto), ...det] }); setBusy(`Đã nhận ${det.filter(a => a.dir === 'v').length} trục dọc, ${det.filter(a => a.dir === 'h').length} trục ngang từ tâm cột. Đổi tên / dời bằng cách chọn trục.`); setTimeout(() => setBusy(''), 6000) }
  /** Dời đối tượng được kéo trong 3D: bắt điểm như 2D, cửa dính vào tường, chống đâm tường / chồng sàn */
  const moveSel = (s: NonNullable<Pick3>, dx: number, dy: number) => {
    if (!M) return
    if (s.t === 'door') { const d = M.doors.find(x => x.id === s.id); if (!d) return; const sn = snapToWall(M, [d.x + dx, d.y + dy], 1.2, d.w); if (sn) commit({ ...M, doors: M.doors.map(x => x.id === d.id ? { ...x, x: sn.x, y: sn.y, ang: sn.ang, t: sn.thick || x.t } : x) }); return }
    let ddx = dx, ddy = dy
    if (s.t === 'furn') { const f = (M.furn ?? []).find(x => x.id === s.id); if (!f) return; const sn = snapDelta(furnCorners({ ...f, x: f.x + dx, y: f.y + dy }), f.id); ddx += sn.d[0]; ddy += sn.d[1]; const nf = { ...f, x: f.x + ddx, y: f.y + ddy }; if (furnHitsWall(M, nf) && !furnHitsWall(M, f)) { setErr('Vị trí đó đâm vào tường/cột – không dời.'); return } }
    else if (s.t === 'wall') { const w = M.walls.find(x => x.id === s.id); if (!w) return; const mp = (w.shape.type === 'poly' ? w.shape.rings.flat() : [w.shape.a, w.shape.b, ...footprint(w).flat()]).filter((_, i, a) => a.length <= 40 || i % Math.ceil(a.length / 40) === 0).map(q => [q[0] + dx, q[1] + dy] as Pt), sn = snapDelta(mp, w.id); ddx += sn.d[0]; ddy += sn.d[1] }
    else if (s.t === 'room') { const r = (M.rooms ?? []).find(x => x.id === s.id); if (!r) return; const ov = roomOverlap(M, r.poly.map(q => [q[0] + dx, q[1] + dy] as Pt), r.id); if (ov) { setErr(`Sàn sẽ đè lên «${ov.name}» – không dời.`); return } }
    setErr(''); const r = applyXf(M, s, mkMove(ddx, ddy), false); commit(r.M); setSel(s)
  }
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

  const go = (t: Tool, sh?: Shape) => { setTool(t); setPending(null); setPts([]); setLenBuf(''); setErr(''); if (sh) setShp(sh) }
  const focTf = (id: string) => { if (!sel) { setErr('Hãy chọn một đối tượng trước, rồi bấm lệnh này.'); return } setErr(''); setTimeout(() => { const el = document.getElementById(id) as HTMLInputElement | null; el?.focus(); el?.select() }, 30) }
  const GH = (t: string) => <div style={{ fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: 0.5, margin: '6px 0 0', textAlign: 'center', borderTop: '1px solid #e5e5e5', paddingTop: 4 }}>{t}</div>
  const palette = <>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textAlign: 'center' }}>CHỌN</div>
    <PalBtn on={tool === 'select'} ic="➤" label="Chọn (V)" title="Chọn / kéo đối tượng" onClick={() => go('select')} />
    {mode === '2d' && <>
      {GH('VẼ KIẾN TRÚC')}
      <PalBtn on={tool === 'wall'} ic="▬" label="Tường (L)" title="Vẽ tường: thẳng, cung, tròn, chữ nhật" onClick={() => go('wall')} />
      <PalBtn on={tool === 'glasskit'} ic="▯" label="Vách kính (K)" title="Vách kính + cửa kính vẽ nhanh" onClick={() => go('glasskit')} />
      <PalBtn on={tool === 'col'} ic="■" label="Cột" title="Đặt cột từ thư viện" onClick={() => go('col')} />
      <PalBtn on={tool === 'roomPoly'} ic="▱" label="Sàn (F)" title="Vẽ sàn / đo diện tích: đa giác, chữ nhật, tròn" onClick={() => go('roomPoly')} />
      <PalBtn on={tool === 'room'} ic="▣" label="Phòng (bấm trong)" title="Bấm vào bên trong không gian kín để lấy phòng" onClick={() => go('room')} />
      {GH('HỆ TRỤC')}
      <PalBtn on={tool === 'axisV'} ic="┃" label="Trục dọc (G)" title="Đặt trục cột dọc 1, 2, 3…" onClick={() => go('axisV')} />
      <PalBtn on={tool === 'axisH'} ic="━" label="Trục ngang (H)" title="Đặt trục cột ngang A, B, C…" onClick={() => go('axisH')} />
      {GH('THƯ VIỆN')}
      <PalBtn on={tool === 'door'} ic="🚪" label="Cửa (D)" title="Đặt cửa từ thư viện vào tường" onClick={() => go('door')} />
      <PalBtn on={tool === 'furn'} ic="🛋" label="Nội thất" title="Đặt đồ rời, thiết bị vệ sinh, tủ liền tường" onClick={() => go('furn')} />
      {GH('GHI CHÚ')}
      <PalBtn on={tool === 'dim'} ic="📏" label="Kích thước" title="Ghi kích thước" onClick={() => go('dim')} />
    </>}
    {GH('SỬA')}
    <PalBtn on={false} ic="✥" label="Dời (M)" title="Dời chính xác: nhập X/Y (mm)" onClick={() => focTf('tf-dx')} />
    <PalBtn on={false} ic="⟳" label="Xoay (Q)" title="Xoay quanh tâm theo độ" onClick={() => focTf('tf-rot')} />
    <PalBtn on={false} ic="⤢" label="Co giãn (E)" title="Co giãn theo %" onClick={() => focTf('tf-k')} />
    <PalBtn on={false} ic="⧉" label="Sao chép (N)" title="Sao chép nhiều bản cách đều" onClick={() => focTf('tf-n')} />
    <PalBtn on={false} ic="🗑" label="Xoá (Del)" title="Xoá đối tượng đang chọn" onClick={() => { if (sel) del() }} />
    {mode === '2d' && <>
      {GH('TỰ ĐỘNG')}
      <PalBtn on={false} ic="⚡" label="Nhận phòng" title="Tự nhận diện tất cả phòng kín" onClick={runAutoRooms} />
      <PalBtn on={false} ic="⚡" label="Nhận trục" title="Tự nhận hệ trục từ tâm cột" onClick={runDetectAxes} />
    </>}
  </>
  const TOOL_NAME: Record<string, string> = { select: 'Chọn / kéo', wall: 'Vẽ tường', glasskit: 'Bộ vách kính + cửa', col: 'Đặt cột', roomPoly: 'Vẽ sàn / đo diện tích', room: 'Phòng (bấm vào trong)', door: 'Đặt cửa', furn: 'Đặt nội thất', dim: 'Ghi kích thước', axisV: 'Trục dọc', axisH: 'Trục ngang' }
  const optBar = <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: '#faf6ef', border: '1px solid #eadfcb', borderRadius: 6, padding: '4px 8px', minHeight: 30 }}>
    <b style={{ color: '#a85a00' }}>{mode === '3d' ? 'Xem 3D – chọn & sửa' : TOOL_NAME[tool]}</b>
    {mode === '2d' && <>
      {(tool === 'wall' || tool === 'glasskit') && <><label title="Đầu tường mới gần tường cũ (≤ 400 mm) sẽ tự kéo dài / cắt bớt cho khít vào tường cũ"><input type="checkbox" checked={autoJoin} onChange={e => setAutoJoin(e.target.checked)} /> Tự khớp giao điểm</label><label title="Tường mới chạm vào tường cũ thì lấy luôn vật liệu, độ dày, cao độ, hoàn thiện của tường cũ"><input type="checkbox" checked={autoMatch} onChange={e => setAutoMatch(e.target.checked)} /> Lấy vật liệu / cao / dày của tường chạm vào</label></>}
      {tool === 'wall' && <><label className="small">Kết cấu: <select value={newKind} onChange={e => { setNewKind(e.target.value); const k = kindOf(e.target.value); if (k.glass && k.panel) setNewPanel(k.panel) }} style={{ maxWidth: 190 }}><optgroup label="Tường">{WALL_KINDS.filter(k => !k.glass).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup><optgroup label="Vách kính">{WALL_KINDS.filter(k => k.glass).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup></select></label> {kindOf(newKind).glass && <label className="small">Chia tấm kính mỗi <input style={{ width: 50 }} key={'np' + newPanel} defaultValue={newPanel} onBlur={e => setNewPanel(Math.max(0.3, num(e.target.value, newPanel)))} /> m</label>} {true && <label className="small">Hình <select value={shp} onChange={e => { setShp(e.target.value as Shape); setPts([]); setPending(null); setLenBuf('') }}><option value="line">{(tool as string) === 'roomPoly' ? 'Đa giác' : 'Thẳng (nhiều đoạn)'}</option>{(tool as string) !== 'roomPoly' && <option value="arc">Cung (đầu – cuối – điểm giữa)</option>}<option value="circle">Tròn (tâm – bán kính)</option><option value="rect">Chữ nhật (2 góc)</option></select></label>}</>}
      {tool === 'glasskit' && <><select value={gKind} onChange={e => setGKind(e.target.value)} style={{ maxWidth: 190 }}>{WALL_KINDS.filter(k => k.glass).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
              <select value={gDoor} onChange={e => setGDoor(e.target.value)} style={{ maxWidth: 190 }}><option value="none">Không cửa</option>{DOOR_LIB.filter(d => d.group === 'Cửa kính').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <select value={gPos} onChange={e => setGPos(e.target.value as 'mid' | 'start' | 'end')}><option value="mid">Cửa ở giữa</option><option value="start">Cửa ở đầu</option><option value="end">Cửa ở cuối</option></select> {true && <label className="small">Hình <select value={shp} onChange={e => { setShp(e.target.value as Shape); setPts([]); setPending(null); setLenBuf('') }}><option value="line">{(tool as string) === 'roomPoly' ? 'Đa giác' : 'Thẳng (nhiều đoạn)'}</option>{(tool as string) !== 'roomPoly' && <option value="arc">Cung (đầu – cuối – điểm giữa)</option>}<option value="circle">Tròn (tâm – bán kính)</option><option value="rect">Chữ nhật (2 góc)</option></select></label>}</>}
      {tool === 'col' && <><select value={libCol} onChange={e => { setLibCol(e.target.value); setTool('col') }} style={{ maxWidth: 160 }}>{COL_LIB.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>}
      {tool === 'roomPoly' && <>{true && <label className="small">Hình <select value={shp} onChange={e => { setShp(e.target.value as Shape); setPts([]); setPending(null); setLenBuf('') }}><option value="line">{(tool as string) === 'roomPoly' ? 'Đa giác' : 'Thẳng (nhiều đoạn)'}</option>{(tool as string) !== 'roomPoly' && <option value="arc">Cung (đầu – cuối – điểm giữa)</option>}<option value="circle">Tròn (tâm – bán kính)</option><option value="rect">Chữ nhật (2 góc)</option></select></label>} {true && <label className="small">Vật liệu sàn <select value={floorFin} onChange={e => setFloorFin(e.target.value)} style={{ maxWidth: 170 }}><option value="">(chưa chọn)</option>{[...custom, ...FINISHES].filter(f => f.group === 'Sàn' || f.group === 'Của tôi').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</>}
      {tool === 'door' && <><select value={libDoor} onChange={e => { setLibDoor(e.target.value); setTool('door') }} style={{ maxWidth: 190 }}>{['Cửa đi', 'Cửa kính', 'Cửa sổ', 'Khác'].map(g => <optgroup key={g} label={g}>{[...customDoors, ...DOOR_LIB].filter(d => (customDoors.includes(d) ? g === 'Cửa đi' : d.group === g)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}</select><span className="muted">{dpA ? 'Bấm điểm 2 = mép bên kia ô cửa → cửa tự điền đúng bề rộng, khớp khung · Esc huỷ' : 'Bấm 2 mép tường (2 đầu ô cửa) → cửa tự khớp kích thước · bấm 1 điểm = theo thư viện'}</span></>}
      {tool === 'furn' && <><select value={libFurn} onChange={e => { setLibFurn(e.target.value); setTool('furn') }} style={{ maxWidth: 190 }}>{FURN_GROUPS.map(g => <optgroup key={g} label={g}>{FURN_TYPES.filter(t => t.group === g).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}</select></>}
      {tool === 'dim' && <label><input type="checkbox" checked={dimMm} onChange={e => setDimMm(e.target.checked)} /> Hiện đơn vị mm</label>}
      {tool === 'room' && <span className="muted">Bấm vào bên trong một không gian kín (tường phải khép kín, cửa tính là kín).</span>}
      {(tool === 'axisV' || tool === 'axisH') && <span className="muted">Bấm vị trí đặt trục; tự hút vào tâm cột, đầu mút.</span>}
      {tool === 'select' && <span className="muted">Bấm đối tượng để chọn · kéo = dời · Ctrl+kéo = sao chép · bấm đúp cạnh = gõ số mm · Alt = tắt bắt điểm</span>}
    </>}
    {mode === '3d' && <span className="muted">Bấm vật thể trong 3D để chọn, kéo để dời trên sàn; sửa số liệu ở bảng bên phải. Ẩn / khoá từng loại ở «Lớp hiển thị».</span>}
  </div>
  const layCount: Record<string, number> = { walls: M ? M.walls.filter(w => w.role !== 'col').length : 0, cols: M ? M.walls.filter(w => w.role === 'col').length : 0, doors: M?.doors.length ?? 0, furn: (M?.furn ?? []).length, rooms: (M?.rooms ?? []).length, labels: (M?.rooms ?? []).length, dims: (M?.dims ?? []).length, axes: (M?.axes ?? []).length }
  const LAYERS: [keyof typeof LAY0, string][] = [['walls', 'Tường / vách'], ['cols', 'Cột'], ['doors', 'Cửa'], ['furn', 'Đồ rời · thiết bị · tủ liền tường'], ['rooms', 'Sàn / phòng'], ['labels', 'Tên phòng & cốt'], ['dims', 'Kích thước'], ['axes', 'Hệ trục']]
  const layersPanel = showLayers && M ? <div className="card small" style={{ display: 'grid', gap: 4 }}>
    <b>🗂 Lớp hiển thị &amp; khoá</b>
    <table className="tbl" style={{ width: '100%' }}><thead><tr><th style={{ textAlign: 'left' }}>Lớp</th><th>Hiện</th><th>Khoá</th><th>SL</th></tr></thead><tbody>
      {LAYERS.map(([k, label]) => <tr key={k}><td>{label}</td><td style={{ textAlign: 'center' }}><input type="checkbox" checked={lay[k]} onChange={e => setLay({ ...lay, [k]: e.target.checked })} /></td><td style={{ textAlign: 'center' }}>{k in LOCK0 ? <input type="checkbox" checked={lock[k as keyof typeof LOCK0]} onChange={e => setLock({ ...lock, [k]: e.target.checked })} title="Khoá: không chọn / kéo được, tránh lỡ tay" /> : null}</td><td style={{ textAlign: 'center' }}>{layCount[k]}</td></tr>)}
      {base && <tr><td>Nét bản vẽ gốc (DXF)</td><td style={{ textAlign: 'center' }}><input type="checkbox" checked={under} onChange={e => setUnder(e.target.checked)} /></td><td /><td /></tr>}
      {lay.furn && FURN_GROUPS.map(g => { const n = (M.furn ?? []).filter(f => furnTypeOf(f.kind).group === g).length; return n ? <tr key={g}><td style={{ paddingLeft: 18, color: '#666' }}>↳ {g}</td><td style={{ textAlign: 'center' }}><input type="checkbox" checked={!fgHide.includes(g)} onChange={e => setFgHide(e.target.checked ? fgHide.filter(x => x !== g) : [...fgHide, g])} /></td><td /><td style={{ textAlign: 'center' }}>{n}</td></tr> : null })}
    </tbody></table>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn sm" onClick={() => { setLay(LAY0); setFgHide([]); setUnder(true) }}>Hiện tất cả</button>
      <button className="btn sm" onClick={() => setLay({ ...LAY0, furn: false, labels: false, dims: false })}>Chỉ kiến trúc (ẩn đồ rời, kích thước)</button>
      <button className="btn sm" onClick={() => setLock({ walls: true, cols: true, doors: true, furn: false, rooms: true, dims: true, axes: true })}>Khoá hết, chỉ sửa đồ rời</button>
      <button className="btn sm" onClick={() => setLock(LOCK0)}>Mở khoá hết</button></div>
    <div className="muted">Ẩn = không vẽ, không bắt điểm, ẩn cả trong 3D. Khoá = vẫn thấy nhưng không chọn / kéo nhầm.</div></div> : null
  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <b>Soạn mặt bằng &amp; dựng 3D</b><span className="muted small">– thử nghiệm: nhập DXF, sửa tường · cột · cửa, xem 3D</span>
      {proj && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><b className="small">Tầng:</b>
        <select value={floorId} onChange={e => e.target.value && openFloor(e.target.value)} style={{ maxWidth: 170 }}><option value="">(chọn tầng…)</option>{proj.floors.map(f => <option key={f.id} value={f.id}>{f.floor_label}{/\.dxf$/i.test(f.pdf_path) ? '' : ' (PDF)'}</option>)}</select>
        {floorId && <button className="btn sm" title="Bỏ bản đã lưu, dựng lại từ DXF của tầng" onClick={() => confirm('Dựng lại từ DXF sẽ thay bản 3D đã lưu của tầng này. Tiếp tục?') && openFloor(floorId, true)}>↻ Dựng lại từ DXF</button>}
        {!floorsDxf.length && <span className="muted small">(chưa có tầng nào tải DXF)</span>}</span>}
      <label className="btn sm">Nhập DXF<input type="file" accept=".dxf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} /></label>
      <label className="btn sm">Mở file đã lưu<input type="file" accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadJson(f); e.target.value = '' }} /></label>
      {M && <button className="btn sm" onClick={saveJson}>Lưu file (.json)</button>}
      {proj?.d && M && <button className="btn sm primary" title="Đưa tên phòng + diện tích + tầng đã vẽ sang bảng phòng của Lập danh mục" onClick={openSync}>⇄ Đưa phòng sang Lập danh mục</button>}
      {busy && <span className="muted small">{busy}</span>}{proj && saved && !busy && <span className="muted small">☁ {saved}</span>}{err && <span style={{ color: '#b00020' }} className="small">{err}</span>}
    </div>
    {sync && <div className="card small" style={{ display: 'grid', gap: 6, border: '2px solid #e07000' }}>
      <b>Đưa {sync.length} phòng của «{floorLabel || 'tầng chưa chọn'}» sang Lập danh mục</b>
      <div className="muted">Chỉ bổ sung: phòng trùng tên chỉ được cập nhật diện tích và điền ô còn trống; không đổi tên, không xoá, không đụng vật liệu.{!floorLabel && ' Chưa chọn tầng nên phòng mới sẽ chưa có tầng.'}</div>
      <table className="tbl"><thead><tr><th>Phòng</th><th>EN</th><th>m²</th><th>Kết quả</th></tr></thead><tbody>{sync.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.en ?? ''}</td><td>{r.area.toFixed(2)}</td><td>{r.note}</td></tr>)}</tbody></table>
      <div className="row gap"><button className="btn primary sm" onClick={doSync}>Áp dụng</button><button className="btn sm" onClick={() => setSync(null)}>Huỷ</button></div></div>}
    {!M ? <div className="muted">Nhập file DXF mặt bằng. Phần mềm dựng sẵn hệ tường và cột; bạn sửa tiếp trên mặt bằng rồi xem 3D. Bản sửa tự lưu trong trình duyệt này.</div> : <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <div className="mp-tabs"><button className={'mp-tab' + (mode === '2d' ? ' on' : '')} onClick={() => setMode('2d')}>Mặt bằng 2D</button><button className={'mp-tab' + (mode === '3d' ? ' on' : '')} onClick={() => setMode('3d')}>Xem 3D</button></div>
        <button className="btn sm" disabled={!nh} onClick={undo}>↩ Hoàn tác</button>
        {mode === '2d' ? <>
          <button className="btn sm" onClick={() => fit(M, size)}>⤢ Vừa khung</button>
          <label className="small"><input type="checkbox" checked={ortho} onChange={e => setOrtho(e.target.checked)} /> Bắt ngang/dọc</label>
        </> : <>
          <button className="btn sm" onClick={() => setView3(v => (v === 0 ? 2 : 0))}>Góc nhìn chéo</button><button className="btn sm" onClick={() => setView3(1)}>Từ trên xuống</button>
          <label className="small"><input type="checkbox" checked={ceiling} onChange={e => setCeiling(e.target.checked)} /> Hiện trần</label><span className="muted small">Bấm vật thể để chọn · kéo vật thể để dời · kéo nền = xoay · cuộn = zoom</span></>}
        <button className={'btn sm' + (showLayers ? ' primary' : '')} onClick={() => setShowLayers(v => !v)}>🗂 Lớp hiển thị</button>
        <button className={'btn sm' + (showLib ? ' primary' : '')} onClick={() => setShowLib(v => !v)}>📚 Thư viện</button>
        <span className="small muted" style={{ marginLeft: 'auto' }}>Cao tường mặc định <input style={{ width: 52 }} defaultValue={M.hWall} key={'hw' + M.hWall} onBlur={e => commit({ ...M, hWall: num(e.target.value, M.hWall) })} /> m · cột <input style={{ width: 52 }} defaultValue={M.hCol} key={'hc' + M.hCol} onBlur={e => commit({ ...M, hCol: num(e.target.value, M.hCol) })} /> m</span>
      </div>
      {mode === '2d' && <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '2px 0' }}>
        <b>Bắt điểm:</b>
        {([['align', '┆ Dóng hàng / căn mép'], ['end', '■ Đầu mút'], ['mid', '△ Giữa'], ['cen', '○ Tâm'], ['int', '✕ Giao điểm'], ['per', '⊥ Vuông góc'], ['nea', '◇ Mép / gần nhất'], ['axis', '┼ Trục'], ['polar', '∠ Góc cực 15°'], ['grid', '▦ Lưới 100']] as const).map(([k, l]) => <label key={k} style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={sm[k]} onChange={e => setSm({ ...sm, [k]: e.target.checked })} /> {l}</label>)}
        <span style={{ borderLeft: '1px solid #ccc', height: 16 }} />
        {(M.axes ?? []).length > 0 && <button className="btn sm" onClick={() => commit({ ...M, axes: [] })}>Xoá hết trục</button>}
        <label><input type="checkbox" checked={showLv} onChange={e => setShowLv(e.target.checked)} /> Hiện cốt sàn / trần</label>
        <span className="muted">Phím tắt: V chọn · L tường · A cung · C tròn · R chữ nhật · F sàn · D cửa · K vách kính · G/H trục · M dời · Q xoay · E co giãn · N sao chép</span>
      </div>}
      {showLib && <LibraryBrowser custom={custom} customDoors={customDoors} doorSel={libDoor} wallSel={selWall?.kind ?? newKind} colSel={libCol}
        hint={selWall ? 'Đang chọn 1 tường: bấm loại tường / vật liệu để áp lên tường đó' : selRoom ? 'Đang chọn 1 phòng: bấm vật liệu Sàn / Trần để áp lên phòng' : selDoor ? 'Đang chọn 1 cửa: bấm mẫu cửa hoặc vật liệu để áp lên cửa' : 'Bấm mẫu cửa/cột để đặt; chọn một tường/phòng/cửa trước để áp vật liệu'}
        onDoor={id => { const sp = doorSpec(id, customDoors); setLibDoor(id); if (selDoor && sp) setDoor(selDoor.id, { lib: sp.id, kind: sp.kind, w: sp.w, h: sp.h, sill: sp.sill, finish: undefined, frameFinish: undefined }); else setTool('door') }}
        onWall={k => { setNewKind(k); const kk = kindOf(k); if (kk.glass && kk.panel) setNewPanel(kk.panel); if (selWall) setWall(selWall.id, selWall.shape.type === 'seg' ? { kind: k, finish: undefined, panel: kk.glass ? (selWall.panel ?? kk.panel) : undefined, shape: { ...selWall.shape, t: kk.t } } : { kind: k, finish: undefined }) }}
        onCol={id => { setLibCol(id); setTool('col') }}
        onFinish={f => { if (selRoom) { if (f.group === 'Trần') setRoom(selRoom.id, { ceil: f.id }); else setRoom(selRoom.id, { floor: f.id }) } else if (selWall) setWall(selWall.id, { finish: f.id }); else if (selDoor) setDoor(selDoor.id, f.group === 'Cửa / khung' || f.group === 'Của tôi' ? { finish: f.id } : {}) }}
        onAddImage={async (file, name, sz, group) => { const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) }); const c = document.createElement('canvas'), k = Math.min(1, 384 / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); setCustom(cs => [{ id: 'my-' + uid(''), group, name, color: '#cccccc', pattern: 'image', size: sz, img: c.toDataURL('image/jpeg', 0.82) }, ...cs]) }}
        onRemoveCustom={id => setCustom(cs => cs.filter(c => c.id !== id))} />}
      <div style={{ display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 250px', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>{palette}</div>
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>{optBar}
      {mode === '3d' ? <Scene3D model={M} view={view3} custom={custom} customDoors={customDoors} ceiling={ceiling} showFurn={showFurn} sel={sel} lay={lay3} lock={lock} fgHide={fgHide} onPick={s => { setSel(s); setTool('select') }} onMoveSel={moveSel} /> :
          <div ref={box} style={{ position: 'relative', height: '72vh', border: '1px solid #ddd', background: '#fff', overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble} onContextMenu={e => { e.preventDefault(); setPending(null); setPts([]) }}>
            {under && base?.draw?.length ? <div style={{ position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none' }}><LinesCanvas base={base} vb={vbPt} size={size} /></div> : null}
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {lay.rooms && (M.rooms ?? []).map((r, i) => <path key={r.id} d={ringPath(r.poly)} fill={`hsl(${(i * 47) % 360} 70% 70%)`} fillOpacity={selRoom?.id === r.id ? 0.55 : 0.35} stroke={selRoom?.id === r.id ? '#e07000' : 'none'} strokeWidth={2} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />)}
              {showFurn && (M.furn ?? []).filter(f => !fgHide.includes(furnTypeOf(f.kind).group)).map(f => <FurnGlyph key={f.id} f={f} sel={selFurn?.id === f.id} onDown={onFurnDown} />)}
              {lay.axes && (M.axes ?? []).length > 0 && (() => { const ax = M.axes ?? [], [x0, y0, x1, y1] = wb, e1 = hs * 7, br = hs * 3.4, red = '#c0392b'
                const vs = ax.filter(a => a.dir === 'v').sort((a, b) => a.pos - b.pos), hh = ax.filter(a => a.dir === 'h').sort((a, b) => a.pos - b.pos)
                const down = (e: React.PointerEvent, a: { id: string; dir: 'v' | 'h'; pos: number }) => { if (tool !== 'select' || lock.axes) return; e.stopPropagation(); setSel({ t: 'axis', id: a.id }); drag.current = { k: 'axisMove', id: a.id, orig: a, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }
                return <g>{ax.map(a => { const on = selAxis?.id === a.id, v = a.dir === 'v', xa = v ? a.pos : x0 - e1, ya = v ? y0 - e1 : a.pos, xb = v ? a.pos : x1 + e1, yb = v ? y1 + e1 : a.pos, bx = v ? a.pos : x0 - e1 - br, by = v ? y0 - e1 - br : a.pos
                  return <g key={a.id}><line x1={xa} y1={ya} x2={xb} y2={yb} stroke={on ? '#e07000' : red} strokeWidth={on ? 1.8 : 1} strokeDasharray="14 4 2 4" vectorEffect="non-scaling-stroke" opacity={0.8} style={{ pointerEvents: 'none' }} />
                    <line x1={xa} y1={ya} x2={xb} y2={yb} stroke="transparent" strokeWidth={9} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} onPointerDown={e => down(e, a)} />
                    <circle cx={bx} cy={by} r={br} fill="#fff" stroke={on ? '#e07000' : red} strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} onPointerDown={e => down(e, a)} />
                    <text x={bx} y={by + fsz * 0.35} textAnchor="middle" fontSize={fsz} fontWeight="bold" fill={on ? '#e07000' : red} style={{ pointerEvents: 'none', userSelect: 'none' }}>{a.name}</text></g> })}
                  {vs.length > 1 && <g style={{ pointerEvents: 'none' }}><line x1={vs[0].pos} y1={y0 - hs * 3} x2={vs[vs.length - 1].pos} y2={y0 - hs * 3} stroke={red} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />{vs.map((a, i) => <g key={a.id}><line x1={a.pos} y1={y0 - hs * 4} x2={a.pos} y2={y0 - hs * 2} stroke={red} strokeWidth={1} vectorEffect="non-scaling-stroke" />{i > 0 && <text x={(a.pos + vs[i - 1].pos) / 2} y={y0 - hs * 3.6} textAnchor="middle" fontSize={fsz * 0.85} fill={red}>{mm(a.pos - vs[i - 1].pos)}</text>}</g>)}</g>}
                  {hh.length > 1 && <g style={{ pointerEvents: 'none' }}><line x1={x0 - hs * 3} y1={hh[0].pos} x2={x0 - hs * 3} y2={hh[hh.length - 1].pos} stroke={red} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />{hh.map((a, i) => <g key={a.id}><line x1={x0 - hs * 4} y1={a.pos} x2={x0 - hs * 2} y2={a.pos} stroke={red} strokeWidth={1} vectorEffect="non-scaling-stroke" />{i > 0 && <text transform={`translate(${x0 - hs * 3.6} ${(a.pos + hh[i - 1].pos) / 2}) rotate(-90)`} textAnchor="middle" fontSize={fsz * 0.85} fill={red}>{mm(a.pos - hh[i - 1].pos)}</text>}</g>)}</g>}</g> })()}
              {M.walls.filter(w => w.role === 'col' ? lay.cols : lay.walls).map(w => <WallPath key={w.id} w={w} sel={selWall?.id === w.id} onDown={onWallDown} />)}
              {lay.walls && M.walls.map(w => kindOf(w.kind).glass && w.shape.type === 'seg' ? <GlassTicks key={'g' + w.id} w={w} panel={w.panel ?? kindOf(w.kind).panel ?? 1.2} /> : null)}
              {lay.doors && M.doors.map(d => <DoorGlyph key={d.id} d={d} sel={selDoor?.id === d.id} spec={doorSpec(d.lib, customDoors)} onDown={onDoorDown} />)}
              {lay.dims && (M.dims ?? []).map(d => <DimGlyph key={d.id} d={d} sel={selDim?.id === d.id} fs={fsz} mm={dimMm} onDown={onDimDown} />)}
              {lay.rooms && lay.labels && (M.rooms ?? []).map(r => { const c = centroid(r.poly), a = r.area ?? polyArea(r.poly); return <text key={'t' + r.id} x={c[0]} y={c[1]} textAnchor="middle" fontSize={fsz * 1.1} fill="#111" stroke="#fff" strokeWidth={fsz * 0.25} paintOrder="stroke" style={{ cursor: 'pointer', userSelect: 'none' }} onPointerDown={e => { if (tool === 'select' && !lock.rooms) { e.stopPropagation(); setSel({ t: 'room', id: r.id }) } }}><tspan x={c[0]} dy={-fsz * 0.1} fontWeight="bold">{r.name}</tspan><tspan x={c[0]} dy={fsz * 1.25}>{a.toFixed(1)} m²</tspan>{showLv && <tspan x={c[0]} dy={fsz * 1.2} fontSize={fsz * 0.85} fill="#0b6bcb">▽ {fz(r.z ?? 0)} · trần {fz(r.ceilH ?? M.hWall)}</tspan>}</text> })}
              {selRoom && selRoom.poly.map((a, i) => { const b = selRoom.poly[(i + 1) % selRoom.poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L < 0.3 ? null : <text key={'re' + i} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} fontSize={fsz * 0.85} textAnchor="middle" fill="#c0392b" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{fmtLen(L, dimMm)}</text> })}
              {selDim && (() => { const d = selDim, L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) || 1, nx = -(d.b[1] - d.a[1]) / L * d.off, ny = (d.b[0] - d.a[0]) / L * d.off, mo: Pt = [(d.a[0] + d.b[0]) / 2 + nx, (d.a[1] + d.b[1]) / 2 + ny]
                return <>{(['dimA', 'dimB'] as const).map(k => { const q = k === 'dimA' ? d.a : d.b; return <circle key={k} cx={q[0]} cy={q[1]} r={hs * 1.2} fill="#fff" stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onDimHandle(e, d.id, k)} /> })}
                  <circle cx={mo[0]} cy={mo[1]} r={hs * 1.2} fill="#e07000" fillOpacity={0.85} stroke="#fff" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onDimHandle(e, d.id, 'dimOff')}><title>Kéo để dời đường kích thước</title></circle></> })()}
              {selRoom && selRoom.poly.map((q, vi) => <circle key={'rv' + vi} cx={q[0]} cy={q[1]} r={hs} fill="#fff" stroke="#e07000" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => { e.stopPropagation(); drag.current = { k: 'roomV', id: selRoom.id, vi, orig: selRoom, moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (selRoom.poly.length > 3) setRoom(selRoom.id, { poly: selRoom.poly.filter((_, j) => j !== vi), area: undefined }) }} />)}
              {selWall?.shape.type === 'seg' && (() => { const cl = centerline(selWall), mp = selWall.shape.bulge ? cl[Math.floor(cl.length / 2)] : [(selWall.shape.a[0] + selWall.shape.b[0]) / 2, (selWall.shape.a[1] + selWall.shape.b[1]) / 2]; return <><circle cx={mp[0]} cy={mp[1]} r={hs * 1.2} fill="#e07000" fillOpacity={0.85} stroke="#fff" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onBendDown(e, selWall.id)}><title>Kéo để uốn cong</title></circle>
                <text x={mp[0]} y={mp[1] - hs * 2.2} fontSize={fsz} textAnchor="middle" fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{cl.reduce((n, q, i) => i ? n + Math.hypot(q[0] - cl[i - 1][0], q[1] - cl[i - 1][1]) : 0, 0).toFixed(2)} m</text></> })()}
              {selWall?.shape.type === 'poly' && selWall.shape.rings.flatMap((r, ri) => (r.length > 260 ? [] : r).map((q, vi) => <circle key={ri + '_' + vi} cx={q[0]} cy={q[1]} r={hs} fill="#fff" stroke="#e07000" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onHandleDown(e, selWall.id, ri, vi)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const sh = selWall.shape as { type: 'poly'; rings: Pt[][] }; if (sh.rings[ri].length > 3) setWall(selWall.id, { shape: { type: 'poly', rings: sh.rings.map((r, i) => i === ri ? r.filter((_, j) => j !== vi) : r) } }) }} />))}
              {selWall?.shape.type === 'seg' && (['a', 'b'] as const).map(k => { const sh = selWall.shape as { a: Pt; b: Pt }, q = sh[k], o = k === 'a' ? sh.b : sh.a, cl = centerline(selWall), tp = k === 'a' ? cl[1] : cl[cl.length - 2], ref = selWall.shape.type === 'seg' && (selWall.shape as { bulge?: number }).bulge ? tp : o, ang = Math.atan2(q[1] - ref[1], q[0] - ref[0]); return <Arrow key={k} x={q[0]} y={q[1]} ang={ang} s={hs * 1.1} title="Kéo để co/giãn tường (bắt điểm; nhập số chính xác ở bảng bên phải)" onDown={e => onEndDown(e, selWall.id, k)} /> })}
              {selWall?.shape.type === 'seg' && !selWall.shape.bulge && segLen > 0.6 && (() => { const sh = selWall.shape as { a: Pt; b: Pt; t: number }, ux = (sh.b[0] - sh.a[0]) / segLen, uy = (sh.b[1] - sh.a[1]) / segLen, nx = -uy, ny = ux, pos: Pt = [sh.a[0] + ux * segLen * 0.25 + nx * (sh.t / 2 + hs * 0.2), sh.a[1] + uy * segLen * 0.25 + ny * (sh.t / 2 + hs * 0.2)]; return <Arrow x={pos[0]} y={pos[1]} ang={Math.atan2(ny, nx)} s={hs} color="#2d7ff9" title="Kéo để đổi độ dày tường" onDown={e => onArrow(e, 'wThick', selWall.id, selWall)} /> })()}
              {selWall?.shape.type === 'poly' && selWall.shape.rings.flat().length <= 400 && selWall.shape.rings.flatMap((r, ri) => r.map((a, i) => { const b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.08) return null; const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; return <Arrow key={'ed' + ri + '_' + i} x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} ang={Math.atan2(ny, nx)} s={hs * 0.85} color="#2d7ff9" title="Kéo để đẩy cả cạnh này · bấm đúp lên cạnh để gõ số mm chính xác" onDown={e => onArrow(e, 'edge', selWall.id, selWall, { ring: ri, vi: i })} /> }))}
              {selDoor && ([1, -1] as const).map(sg => { const ux = Math.cos(selDoor.ang), uy = Math.sin(selDoor.ang); return <Arrow key={'de' + sg} x={selDoor.x + ux * sg * selDoor.w / 2} y={selDoor.y + uy * sg * selDoor.w / 2} ang={selDoor.ang + (sg < 0 ? Math.PI : 0)} s={hs * 1.1} title="Kéo để đổi bề rộng cửa" onDown={e => onArrow(e, 'doorEnd', selDoor.id, selDoor, { sg, base: M })} /> })}
              {selFurn && (() => { const f = selFurn, c = Math.cos(f.ang), sn = Math.sin(f.ang), rp: Pt = [f.x + sn * (f.d / 2 + hs * 5), f.y - c * (f.d / 2 + hs * 5)]; return <>
                {([['w', 1], ['w', -1], ['d', 1], ['d', -1]] as const).map(([ax, sg]) => { const u: Pt = ax === 'w' ? [c, sn] : [-sn, c], h = (ax === 'w' ? f.w : f.d) / 2; return <Arrow key={ax + sg} x={f.x + u[0] * sg * h} y={f.y + u[1] * sg * h} ang={Math.atan2(u[1], u[0]) + (sg < 0 ? Math.PI : 0)} s={hs} title={ax === 'w' ? 'Kéo để đổi bề rộng' : 'Kéo để đổi chiều sâu'} onDown={e => onArrow(e, 'furnSz', f.id, f, { ax, sg })} /> })}
                <line x1={f.x + sn * f.d / 2} y1={f.y - c * f.d / 2} x2={rp[0]} y2={rp[1]} stroke="#e07000" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />
                <circle cx={rp[0]} cy={rp[1]} r={hs * 1.2} fill="#fff" stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'alias' }} onPointerDown={e => onArrow(e, 'furnRot', f.id, f)}><title>Kéo để xoay (Shift = bước 15°)</title></circle></> })()}
              {tool === 'dim' && pts.length > 0 && cursor && (() => { const a = pts[0], b = pts.length > 1 ? pts[1] : snapPt(cursor, a), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, off = pts.length > 1 ? ((cursor[0] - a[0]) * -(b[1] - a[1]) + (cursor[1] - a[1]) * (b[0] - a[0])) / L : 0; return <DimGlyph d={{ id: 'tmp', a, b, off }} sel fs={fsz} mm={dimMm} onDown={() => undefined} /> })()}
              {tool === 'roomPoly' && pts.length > 0 && <path d={'M' + pts.map(q => q[0] + ' ' + q[1]).join('L') + (cursor ? 'L' + snapPt(cursor, pts[pts.length - 1]).join(' ') : '')} fill="#e07000" fillOpacity={0.15} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />}
              {tool === 'roomPoly' && pts.length >= 3 && <text x={centroid(pts)[0]} y={centroid(pts)[1]} fontSize={fsz} textAnchor="middle" fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{polyArea(pts).toFixed(2)} m²</text>}
              {(tool === 'wall' || tool === 'glasskit') && pending && cursor && <text x={snapPt(cursor, pending)[0]} y={snapPt(cursor, pending)[1] - hs * 2} fontSize={fsz} fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{lenBuf ? `⌨ ${lenBuf} mm ↵` : `${mm(Math.hypot(snapPt(cursor, pending)[0] - pending[0], snapPt(cursor, pending)[1] - pending[1]))} mm`}</text>}
              {(tool === 'wall' || tool === 'glasskit') && pending && cursor && <line x1={pending[0]} y1={pending[1]} x2={snapPt(cursor, pending)[0]} y2={snapPt(cursor, pending)[1]} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
              {tool === 'door' && dpA && cursor && (() => { const ux = Math.cos(dpA.ang), uy = Math.sin(dpA.ang), B = snapPt(cursor, dpA.p), Wd = (B[0] - dpA.p[0]) * ux + (B[1] - dpA.p[1]) * uy, e2: Pt = [dpA.p[0] + ux * Wd, dpA.p[1] + uy * Wd], h = 0.12
                return <g style={{ pointerEvents: 'none' }}><path d={`M${dpA.p[0] - uy * h} ${dpA.p[1] + ux * h}L${dpA.p[0] + uy * h} ${dpA.p[1] - ux * h}M${e2[0] - uy * h} ${e2[1] + ux * h}L${e2[0] + uy * h} ${e2[1] - ux * h}M${dpA.p[0]} ${dpA.p[1]}L${e2[0]} ${e2[1]}`} stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" fill="none" strokeDasharray="5 3" />
                  <text x={(dpA.p[0] + e2[0]) / 2} y={(dpA.p[1] + e2[1]) / 2 - hs * 2} fontSize={fsz} textAnchor="middle" fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke">{Math.abs(Wd) < 0.15 ? 'bấm lại = cửa theo thư viện' : `rộng ${mm(Math.abs(Wd))} mm`}</text></g> })()}
              {tool !== 'select' && tool !== 'wall' && tool !== 'glasskit' && tool !== 'furn' && tool !== 'axisV' && tool !== 'axisH' && cursor && (() => { const s = snapToWall(M, cursor, 0.6, tool === 'door' ? (doorSpec(libDoor, customDoors) ?? DOOR_LIB[0]).w : 0.9); return s ? <circle cx={s.x} cy={s.y} r={hs * 1.4} fill="#1e5ac8" fillOpacity={0.5} /> : null })()}
              {(tool === 'wall' || tool === 'glasskit' || tool === 'roomPoly') && shp !== 'line' && pts.length > 0 && cursor && !(tool === 'roomPoly' && shp === 'arc') && (() => {
                const q = snapPt(cursor, pts[pts.length - 1]), P = [...pts, q], a0 = pts[0]
                if (shp === 'arc' && P.length < 3) return <line x1={a0[0]} y1={a0[1]} x2={q[0]} y2={q[1]} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                const lab = shp === 'circle' ? `R ${mm(Math.hypot(q[0] - a0[0], q[1] - a0[1]))} mm` : shp === 'rect' ? `${mm(Math.abs(q[0] - a0[0]))} × ${mm(Math.abs(q[1] - a0[1]))} mm` : ''
                const ring = tool === 'roomPoly' ? shapePoly(shp, P) : null, ws = tool === 'roomPoly' ? null : buildShape(shp, P.slice(0, shp === 'arc' ? 3 : 2), tool === 'glasskit' ? gKind : newKind)
                return <g style={{ pointerEvents: 'none' }}>{ring ? <path d={ringPath(ring)} fill="#e07000" fillOpacity={0.15} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" /> : null}
                  {ws ? <path d={ws.flatMap(w => footprint(w)).map(ringPath).join('')} fill="#e07000" fillOpacity={0.3} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" /> : null}
                  {lab && <text x={q[0]} y={q[1] - hs * 2} fontSize={fsz} fill="#e07000" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke">{lab}</text>}</g> })()}
              {(() => { const gi = cursor && tool !== 'select' && tool !== 'door' ? snapInfo(cursor, pending ?? pts[pts.length - 1] ?? null).g ?? [] : []; return [...guides, ...gi].map((g, i) => <g key={'gd' + i} style={{ pointerEvents: 'none' }}><line x1={g[0][0]} y1={g[0][1]} x2={g[1][0]} y2={g[1][1]} stroke="#ff2d9b" strokeWidth={1.2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" /><circle cx={g[0][0]} cy={g[0][1]} r={hs * 0.45} fill="#ff2d9b" /><circle cx={g[1][0]} cy={g[1][1]} r={hs * 0.45} fill="#ff2d9b" /></g>) })()}
              {hud && <text x={hud.p[0] + hs * 2} y={hud.p[1] - hs * 2} fontSize={fsz} fill="#c0392b" fontWeight="bold" stroke="#fff" strokeWidth={fsz * 0.25} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{hud.t}</text>}
              {(() => { const from = pending ?? pts[pts.length - 1] ?? null, info = cursor && tool !== 'select' && tool !== 'door' ? snapInfo(cursor, from) : null, mk = snapMark ?? (info && info.kind !== '' && info.kind !== 'grid' ? info.p : null), kd: SnapKind = snapMark ? 'end' : info?.kind ?? ''
                if (!mk) return null; const x = mk[0], y = mk[1], r = hs * 1.3, st = { fill: 'none', stroke: '#00a86b', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' as const }
                return <g style={{ pointerEvents: 'none' }}>
                  {kd === 'mid' ? <polygon points={`${x},${y - r} ${x - r},${y + r * 0.8} ${x + r},${y + r * 0.8}`} {...st} /> : kd === 'cen' ? <circle cx={x} cy={y} r={r} {...st} /> : kd === 'int' ? <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} {...st} /> : kd === 'per' ? <path d={`M${x - r} ${y + r}L${x - r} ${y - r}L${x + r} ${y - r}M${x - r} ${y}L${x} ${y}L${x} ${y - r}`} {...st} /> : kd === 'nea' ? <path d={`M${x - r} ${y - r}L${x + r} ${y - r}L${x - r} ${y + r}L${x + r} ${y + r}Z`} {...st} /> : kd === 'axis' || kd === 'polar' ? <path d={`M${x - r * 1.4} ${y}L${x + r * 1.4} ${y}M${x} ${y - r * 1.4}L${x} ${y + r * 1.4}`} {...st} strokeDasharray="4 3" /> : <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...st} />}
                  <circle cx={x} cy={y} r={hs * 0.3} fill="#00a86b" />
                  {kd && <text x={x + r * 1.6} y={y + r * 2.6} fontSize={fsz * 0.9} fill="#007a4d" stroke="#fff" strokeWidth={fsz * 0.2} paintOrder="stroke">{SNAP_LABEL[kd]}</text>}</g> })()}
            </svg>
            {ed && (() => { const lx = Math.min(Math.max(4, (ed.q[0] - vb.x) / vb.w * size.w + 12), Math.max(4, size.w - 250)), ly = Math.min(Math.max(4, (ed.q[1] - vb.y) / vb.h * size.h + 12), Math.max(4, size.h - 230))
              return <div onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter') applyEd(); if (e.key === 'Escape') setEd(null) }} style={{ position: 'absolute', left: lx, top: ly, width: 238, background: '#fff', border: '1px solid #e07000', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,.25)', padding: 8, display: 'grid', gap: 5, fontSize: 13, zIndex: 5 }}>
                <b>Sửa cạnh bằng số (mm)</b>
                <label className="small">Chiều dài <input autoFocus style={{ width: 70 }} value={edv.len} onChange={e => setEdv({ ...edv, len: e.target.value })} onFocus={e => e.target.select()} /> mm</label>
                <label className="small">Giữ cố định <select value={edv.fix} onChange={e => setEdv({ ...edv, fix: e.target.value })}><option value="c">Điểm giữa</option><option value="a">Đầu A (đầu đầu)</option><option value="b">Đầu B (đầu cuối)</option></select></label>
                <label className="small">Đẩy vuông góc <input style={{ width: 70 }} value={edv.push} onChange={e => setEdv({ ...edv, push: e.target.value })} onFocus={e => e.target.select()} /> mm <span className="muted">(+ theo mũi tên xanh)</span></label>
                {ed.k === 'seg' && <label className="small">Độ dày <input style={{ width: 70 }} value={edv.thick} onChange={e => setEdv({ ...edv, thick: e.target.value })} onFocus={e => e.target.select()} /> mm</label>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm primary" onClick={applyEd}>Áp dụng ↵</button>{ed.k !== 'seg' && <button className="btn sm" onClick={addVertexEd}>＋ Thêm đỉnh tại đây</button>}<button className="btn sm" onClick={() => setEd(null)}>Đóng</button></div></div> })()}
            <div className="muted small" style={{ position: 'absolute', left: 6, bottom: 4, background: 'rgba(255,255,255,.85)', padding: '0 4px' }}>
              {tool === 'axisV' || tool === 'axisH' ? 'Bấm vào vị trí đặt trục (tự hút vào tâm cột / đầu mút) · Esc để dừng' : tool === 'wall' || tool === 'glasskit' ? (shp === 'arc' ? 'Cung: bấm điểm đầu, điểm cuối, rồi điểm nằm trên cung' : shp === 'circle' ? 'Tròn: bấm tâm rồi bấm điểm trên đường tròn' : shp === 'rect' ? 'Chữ nhật: bấm hai góc đối diện' : 'Bấm điểm đầu, rồi các điểm tiếp theo · gõ số mm + Enter để đặt đúng chiều dài · Esc/chuột phải để dừng') : tool === 'dim' ? 'Bấm điểm đầu, điểm cuối, rồi bấm để kéo đường kích thước ra' : tool === 'room' ? 'Bấm vào bên trong một không gian kín' : tool === 'roomPoly' ? (shp === 'line' || shp === 'arc' ? 'Bấm từng góc sàn; bấm lại điểm đầu hoặc Enter để chốt' : shp === 'circle' ? 'Bấm tâm rồi bấm điểm trên đường tròn' : 'Bấm hai góc đối diện') : tool === 'furn' ? 'Bấm để đặt món nội thất' : tool !== 'select' ? 'Bấm sát vào tường để đặt cửa' : 'Cuộn = zoom · kéo nền = dời · bấm tường/cửa để chọn · Del = xoá · Ctrl+Z = hoàn tác'}</div>
          </div>}
        </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {layersPanel}
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
              <label>Cốt sàn (m) <input style={{ width: 60 }} key={'cz' + selRoom.id + (selRoom.z ?? '')} defaultValue={selRoom.z ?? 0} onBlur={e => setRoom(selRoom.id, { z: num(e.target.value, 0) })} /> <span className="muted small">so với ±0.00</span></label>
              <label>Cốt trần (m) <input style={{ width: 60 }} key={'ch' + selRoom.id + (selRoom.ceilH ?? '')} defaultValue={selRoom.ceilH ?? M.hWall} onBlur={e => setRoom(selRoom.id, { ceilH: num(e.target.value, M.hWall) })} /> <span className="muted small">thông thuỷ {Math.max(0, (selRoom.ceilH ?? M.hWall) - (selRoom.z ?? 0)).toFixed(2)} m</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm" onClick={() => dimRoom(selRoom)}>📏 Ghi kích thước các cạnh</button><button className="btn sm" onClick={del}>Xoá phòng</button></div>
              <div className="muted small">Kéo chấm đỉnh để chỉnh phạm vi · bấm đúp lên cạnh để thêm đỉnh · chuột phải lên đỉnh để xoá đỉnh.</div></div> : null}
            {selFurn ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>Nội thất{selFurn.name ? ` – ${selFurn.name}` : ''}</b>
              <label>Loại <select value={selFurn.kind} style={{ maxWidth: 170 }} onChange={e => { const t = furnTypeOf(e.target.value); setFurn(selFurn.id, { kind: t.key, h: t.h }) }}>{FURN_GROUPS.map(g => <optgroup key={g} label={g}>{FURN_TYPES.filter(t => t.group === g).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>)}</select></label>
              <label>Rộng (m) <input style={{ width: 60 }} key={'fw' + selFurn.id + selFurn.w} defaultValue={selFurn.w.toFixed(2)} onBlur={e => setFurn(selFurn.id, { w: Math.max(0.1, num(e.target.value, selFurn.w)) })} /></label>
              <label>Sâu (m) <input style={{ width: 60 }} key={'fd' + selFurn.id + selFurn.d} defaultValue={selFurn.d.toFixed(2)} onBlur={e => setFurn(selFurn.id, { d: Math.max(0.1, num(e.target.value, selFurn.d)) })} /></label>
              <label>Cao (m) <input style={{ width: 60 }} key={'fh' + selFurn.id + selFurn.h} defaultValue={selFurn.h} onBlur={e => setFurn(selFurn.id, { h: Math.max(0.05, num(e.target.value, selFurn.h)) })} /> <span className="muted small">chuẩn {furnTypeOf(selFurn.kind).h}</span></label>
              <label>Cao độ đáy (m) <input style={{ width: 60 }} key={'fz' + selFurn.id + (selFurn.z ?? '')} defaultValue={selFurn.z ?? furnTypeOf(selFurn.kind).z ?? 0} onBlur={e => setFurn(selFurn.id, { z: Math.max(0, num(e.target.value, 0)) })} /> <span className="muted small">tủ treo, gương…</span></label>
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
              <label title="Đổi bề rộng: đầu tường hai bên tự co / giãn khớp theo cửa">Rộng (m) · tường tự khớp <input style={{ width: 70 }} key={'w' + selDoor.id + selDoor.w} defaultValue={selDoor.w} onBlur={e => setDoor(selDoor.id, { w: Math.max(0.3, num(e.target.value, selDoor.w)) })} /></label>
              <label>Cao (m) <input style={{ width: 70 }} key={'h' + selDoor.id + selDoor.h} defaultValue={selDoor.h} onBlur={e => setDoor(selDoor.id, { h: Math.max(0.3, num(e.target.value, selDoor.h)) })} /></label>
              <label>Dày tường/khung (m) <input style={{ width: 60 }} key={'t' + selDoor.id + (selDoor.t ?? '')} defaultValue={selDoor.t ?? 0.2} onBlur={e => setDoor(selDoor.id, { t: Math.max(0.04, num(e.target.value, selDoor.t ?? 0.2)) })} /></label>
              <label>Bệ cao (m) <input style={{ width: 70 }} key={'s' + selDoor.id + selDoor.sill} defaultValue={selDoor.sill} onBlur={e => setDoor(selDoor.id, { sill: Math.max(0, num(e.target.value, selDoor.sill)) })} /></label>
              <button className="btn sm" title="Đưa cửa vào đúng tim tường, khung dày bằng bề dày tường" onClick={() => setDoor(selDoor.id, { ...centerDoor(M.walls, selDoor) })}>Căn tim tường & khớp dày</button>
              <button className="btn sm" onClick={() => setDoor(selDoor.id, { flip: !selDoor.flip })}>Đảo phía mở</button>
              <button className="btn sm" onClick={dup}>Nhân đôi</button>
              <button className="btn sm" onClick={() => { const nm = window.prompt?.('Tên mẫu cửa của bạn') ?? ''; const base = doorSpec(selDoor.lib, customDoors); const id = 'my-' + uid(''); const sp: DoorSpec = { id, group: 'Cửa đi', name: nm || 'Mẫu của tôi', kind: selDoor.kind, w: selDoor.w, h: selDoor.h, sill: selDoor.sill, leaf: base?.leaf ?? 'flush', frame: base?.frame ?? 0.06, leafFinish: selDoor.finish ?? base?.leafFinish ?? 'd-white', frameFinish: selDoor.frameFinish ?? base?.frameFinish ?? 'd-white', handle: base?.handle, panes: base?.panes }; setCustomDoors(c => [sp, ...c]) }}>Lưu thành mẫu của tôi</button>
              <button className="btn sm" onClick={del}>Xoá</button>
              <div className="small muted">Mặt cắt ngang (nhìn từ trên)</div><DoorPlanSection d={selDoor} spec={doorSpec(selDoor.lib, customDoors)} />
              <div className="small muted">Mặt cắt đứng (đầu cửa, bệ)</div><DoorElevSection d={selDoor} spec={doorSpec(selDoor.lib, customDoors)} H={M.hWall} /></div> : null}
            {(selWall || selDoor || selRoom || selFurn || selDim) && <div className="card" style={{ display: 'grid', gap: 5 }}>
              <b>Dời · xoay · co giãn · sao chép</b>
              <div className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>Dời X <input id="tf-dx" style={{ width: 54 }} value={tf.dx} onChange={e => setTf({ ...tf, dx: e.target.value })} /> Y <input style={{ width: 54 }} value={tf.dy} onChange={e => setTf({ ...tf, dy: e.target.value })} /> mm <button className="btn sm" onClick={() => doXf(() => mkMove(nz(tf.dx) / 1000, nz(tf.dy) / 1000))}>Dời</button></div>
              <div className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>Xoay <input id="tf-rot" style={{ width: 54 }} value={tf.rot} onChange={e => setTf({ ...tf, rot: e.target.value })} /> ° quanh tâm <button className="btn sm" onClick={() => doXf(c => mkRot(c, nz(tf.rot) * Math.PI / 180))}>Xoay</button></div>
              <div className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>Co giãn <input id="tf-k" style={{ width: 54 }} value={tf.k} onChange={e => setTf({ ...tf, k: e.target.value })} /> % quanh tâm <button className="btn sm" onClick={() => { const k = nz(tf.k, 100) / 100; if (k > 0.05) doXf(c => mkScale(c, k)) }}>Co giãn</button></div>
              <div className="small" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>Sao chép <input id="tf-n" style={{ width: 36 }} value={tf.n} onChange={e => setTf({ ...tf, n: e.target.value })} /> bản, cách X <input style={{ width: 54 }} value={tf.cx} onChange={e => setTf({ ...tf, cx: e.target.value })} /> Y <input style={{ width: 54 }} value={tf.cy} onChange={e => setTf({ ...tf, cy: e.target.value })} /> mm <button className="btn sm" onClick={doCopies}>Sao chép</button></div>
              <div className="muted small">Phím: ←↑→↓ dời 10 mm (Shift = 100 mm) · Ctrl+C / Ctrl+V sao chép · giữ Ctrl khi kéo = kéo ra bản sao · Alt khi kéo = tắt bắt điểm. X sang phải, Y xuống dưới; xoay dương = chiều kim đồng hồ.</div></div>}
            {selAxis && <div className="card" style={{ display: 'grid', gap: 6 }}><b>Trục {selAxis.name} ({selAxis.dir === 'v' ? 'dọc' : 'ngang'}){selAxis.auto ? ' – tự nhận từ cột' : ''}</b>
              <label>Tên <input style={{ width: 70 }} key={'an' + selAxis.id} defaultValue={selAxis.name} onBlur={e => M && commit({ ...M, axes: (M.axes ?? []).map(a => a.id === selAxis.id ? { ...a, name: e.target.value || a.name } : a) })} /></label>
              <label>Vị trí {selAxis.dir === 'v' ? 'X' : 'Y'} (mm) <input style={{ width: 80 }} key={'ap' + selAxis.id + selAxis.pos} defaultValue={Math.round(selAxis.pos * 1000)} onBlur={e => M && commit({ ...M, axes: (M.axes ?? []).map(a => a.id === selAxis.id ? { ...a, pos: num(e.target.value, a.pos * 1000) / 1000, auto: false } : a) })} /></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><button className="btn sm" onClick={() => M && commit({ ...M, axes: (M.axes ?? []).filter(a => a.id !== selAxis.id) }) }>Xoá trục</button><button className="btn sm" onClick={() => setTool(selAxis.dir === 'v' ? 'axisV' : 'axisH')}>＋ Thêm trục cùng hướng</button></div>
              <div className="muted small">Kéo bong bóng hoặc đường trục để dời (tự bắt đầu mút / giao điểm, giữ Alt = không bắt). Con trỏ tự hút vào trục khi vẽ.</div></div>}
            {!selWall && !selDoor && !selRoom && !selDim && !selFurn && !selAxis && <div className="muted small card">Chọn một đoạn tường, cột, cửa hoặc phòng để sửa.<br />Tường nhập từ DXF kéo được cả khối hoặc từng đỉnh. Tường thêm tay có hai đầu kéo được, sửa được độ dày và độ dài.<br /><br />{M.walls.length} khối tường/cột · {M.doors.length} cửa · {(M.furn ?? []).length} món nội thất</div>}
            {(M.rooms ?? []).length > 0 && <div className="card small" style={{ display: 'grid', gap: 3 }}><b>Danh sách phòng</b>{(M.rooms ?? []).map(r => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: selRoom?.id === r.id ? 700 : 400 }} onClick={() => setSel({ t: 'room', id: r.id })}><span>{r.name}</span><span>{(r.area ?? polyArea(r.poly)).toFixed(1)} m²</span></div>)}<div style={{ borderTop: '1px solid #ddd', paddingTop: 3, display: 'flex', justifyContent: 'space-between' }}><b>Tổng</b><b>{(M.rooms ?? []).reduce((n, r) => n + (r.area ?? polyArea(r.poly)), 0).toFixed(1)} m²</b></div></div>}
          </div>
        </div>
    </>}
  </div>
}

// Soạn mặt bằng & dựng 3D: nhập DXF → sửa tường · cột · cửa trên mặt bằng → xem 3D. (Thử nghiệm, chỉ admin.)
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readDxfPage } from '../lib/dxf'
import type { VecPage } from '../lib/vector'
import { LinesCanvas } from './PlanView'
import Scene3D from './Scene3D'
import { DOOR_KINDS, WALL_KINDS, doorRect, footprint, kindOf, modelFromVec, snapToWall, uid, type Door, type DoorKind, type Model, type Pt, type Wall } from '../lib/plan3d/model'

type Box = { x: number; y: number; w: number; h: number }
type Tool = 'select' | 'wall' | DoorKind
type Sel = { t: 'wall' | 'door'; id: string } | null
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

export default function Plan3D() {
  const [M, setM] = useState<Model | null>(() => { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) as Model : null } catch { return null } })
  const [base, setBase] = useState<VecPage | null>(null)
  const [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [tool, setTool] = useState<Tool>('select'), [sel, setSel] = useState<Sel>(null)
  const [mode, setMode] = useState<'2d' | '3d'>('2d'), [view3, setView3] = useState(0)
  const [ortho, setOrtho] = useState(true), [under, setUnder] = useState(true)
  const hist = useRef<Model[]>([]), [nh, setNh] = useState(0)
  const [vb, setVb] = useState<Box>({ x: 0, y: 0, w: 100, h: 60 }), [size, setSize] = useState({ w: 0, h: 0 })
  const box = useRef<HTMLDivElement>(null), drag = useRef<any>(null)
  const [pending, setPending] = useState<Pt | null>(null), [cursor, setCursor] = useState<Pt | null>(null)

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
  const onEndDown = (e: React.PointerEvent, id: string, which: 'a' | 'b') => { e.stopPropagation(); drag.current = { k: 'end', id, which, orig: M!.walls.find(w => w.id === id), moved: false }; (box.current as HTMLElement).setPointerCapture(e.pointerId) }

  const onDown = (e: React.PointerEvent) => {
    if (!M) return
    if (e.button === 2) { setPending(null); return }
    const p = toModel(e)
    if (tool === 'wall') {
      const q = snapPt(p, pending)
      if (!pending) { setPending(q); return }
      if (Math.hypot(q[0] - pending[0], q[1] - pending[1]) < 0.05) { setPending(null); return }
      const w: Wall = { id: uid('w'), role: 'wall', kind: 'brick', shape: { type: 'seg', a: pending, b: q, t: 0.2 } }
      commit({ ...M, walls: [...M.walls, w] }); setPending(q); return
    }
    if (tool !== 'select') {
      const s = snapToWall(M, p, 0.6); if (!s) { setErr('Bấm sát vào một đoạn tường để đặt cửa.'); return }
      setErr(''); const k = DOOR_KINDS.find(x => x.key === tool)!
      const d: Door = { id: uid('d'), kind: k.key, x: s.x, y: s.y, ang: s.ang, w: k.w, h: k.h, sill: k.sill }
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
    else if (d.k === 'moveDoor') { const s = snapToWall(M, p, 1.2); if (s) setM(cur => cur && { ...cur, doors: cur.doors.map(x => x.id === d.id ? { ...x, x: s.x, y: s.y, ang: s.ang } : x) }) }
  }
  const onUp = () => { drag.current = null }
  const onDouble = () => { setPending(null) }

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
      if (e.key === 'Escape') { setPending(null); setTool('select'); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && M) { e.preventDefault(); del() }
    }
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on)
  })
  const del = () => { if (!sel || !M) return; commit(sel.t === 'wall' ? { ...M, walls: M.walls.filter(w => w.id !== sel.id) } : { ...M, doors: M.doors.filter(d => d.id !== sel.id) }); setSel(null) }
  const setWall = (id: string, patch: Partial<Wall>) => M && commit({ ...M, walls: M.walls.map(w => w.id === id ? { ...w, ...patch } : w) })
  const setDoor = (id: string, patch: Partial<Door>) => M && commit({ ...M, doors: M.doors.map(d => d.id === id ? { ...d, ...patch } : d) })

  const selWall = sel?.t === 'wall' ? M?.walls.find(w => w.id === sel.id) : undefined
  const selDoor = sel?.t === 'door' ? M?.doors.find(d => d.id === sel.id) : undefined
  const vbPt = useMemo(() => M ? { x: vb.x / M.mPt, y: vb.y / M.mPt, w: vb.w / M.mPt, h: vb.h / M.mPt } : vb, [vb, M])
  const hs = vb.w / Math.max(300, size.w) * 5 // bán kính tay nắm theo zoom
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
          <button className={'btn sm' + (tool === 'select' ? ' primary' : '')} onClick={() => { setTool('select'); setPending(null) }}>Chọn / kéo</button>
          <button className={'btn sm' + (tool === 'wall' ? ' primary' : '')} onClick={() => { setTool('wall'); setPending(null) }}>＋ Tường</button>
          {DOOR_KINDS.map(k => <button key={k.key} className={'btn sm' + (tool === k.key ? ' primary' : '')} onClick={() => { setTool(k.key); setPending(null); setErr('') }}>＋ {k.label}</button>)}
          <button className="btn sm" disabled={!nh} onClick={undo}>↩ Hoàn tác</button>
          <label className="small"><input type="checkbox" checked={ortho} onChange={e => setOrtho(e.target.checked)} /> Bắt ngang/dọc</label>
          {base && <label className="small"><input type="checkbox" checked={under} onChange={e => setUnder(e.target.checked)} /> Hiện nét bản vẽ gốc</label>}
          <button className="btn sm" onClick={() => fit(M, size)}>Vừa khung</button>
        </> : <>
          <button className="btn sm" onClick={() => setView3(v => (v === 0 ? 2 : 0))}>Góc nhìn chéo</button><button className="btn sm" onClick={() => setView3(1)}>Từ trên xuống</button>
          <span className="muted small">Kéo = xoay · cuộn = zoom · chuột phải kéo = dời</span></>}
        <span className="small muted" style={{ marginLeft: 'auto' }}>Cao tường mặc định <input style={{ width: 52 }} defaultValue={M.hWall} key={'hw' + M.hWall} onBlur={e => commit({ ...M, hWall: num(e.target.value, M.hWall) })} /> m · cột <input style={{ width: 52 }} defaultValue={M.hCol} key={'hc' + M.hCol} onBlur={e => commit({ ...M, hCol: num(e.target.value, M.hCol) })} /> m</span>
      </div>
      {mode === '3d' ? <Scene3D model={M} view={view3} /> :
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 10, alignItems: 'start' }}>
          <div ref={box} style={{ position: 'relative', height: '72vh', border: '1px solid #ddd', background: '#fff', overflow: 'hidden', touchAction: 'none', userSelect: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onDoubleClick={onDouble} onContextMenu={e => { e.preventDefault(); setPending(null) }}>
            {under && base?.draw?.length ? <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}><LinesCanvas base={base} vb={vbPt} size={size} /></div> : null}
            <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              {M.walls.map(w => <WallPath key={w.id} w={w} sel={selWall?.id === w.id} onDown={onWallDown} />)}
              {M.doors.map(d => <DoorGlyph key={d.id} d={d} sel={selDoor?.id === d.id} onDown={onDoorDown} />)}
              {selWall?.shape.type === 'poly' && selWall.shape.rings.flatMap((r, ri) => (r.length > 260 ? [] : r).map((q, vi) => <circle key={ri + '_' + vi} cx={q[0]} cy={q[1]} r={hs} fill="#fff" stroke="#e07000" strokeWidth={1.4} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onHandleDown(e, selWall.id, ri, vi)} />))}
              {selWall?.shape.type === 'seg' && (['a', 'b'] as const).map(k => { const q = (selWall.shape as { a: Pt; b: Pt })[k]; return <circle key={k} cx={q[0]} cy={q[1]} r={hs * 1.2} fill="#fff" stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={e => onEndDown(e, selWall.id, k)} /> })}
              {tool === 'wall' && pending && cursor && <line x1={pending[0]} y1={pending[1]} x2={snapPt(cursor, pending)[0]} y2={snapPt(cursor, pending)[1]} stroke="#e07000" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
              {tool !== 'select' && tool !== 'wall' && cursor && (() => { const s = snapToWall(M, cursor, 0.6); return s ? <circle cx={s.x} cy={s.y} r={hs * 1.4} fill="#1e5ac8" fillOpacity={0.5} /> : null })()}
            </svg>
            <div className="muted small" style={{ position: 'absolute', left: 6, bottom: 4, background: 'rgba(255,255,255,.85)', padding: '0 4px' }}>
              {tool === 'wall' ? 'Bấm điểm đầu, rồi các điểm tiếp theo · Esc hoặc chuột phải để dừng' : tool !== 'select' ? 'Bấm sát vào tường để đặt cửa' : 'Cuộn = zoom · kéo nền = dời · bấm tường/cửa để chọn · Del = xoá · Ctrl+Z = hoàn tác'}</div>
          </div>
          <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {selWall ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>{selWall.role === 'col' ? 'Cột' : 'Tường'} {selWall.shape.type === 'seg' ? '(thêm tay)' : '(từ DXF)'}</b>
              <label>Loại <select value={selWall.role} onChange={e => setWall(selWall.id, { role: e.target.value as 'wall' | 'col' })}><option value="wall">Tường</option><option value="col">Cột</option></select></label>
              <label>Kết cấu <select value={selWall.kind} onChange={e => setWall(selWall.id, { kind: e.target.value })}>{WALL_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
              <label>Cao (m) <input style={{ width: 70 }} key={selWall.id + (selWall.h ?? 'm')} defaultValue={selWall.h ?? (selWall.role === 'col' ? M.hCol : M.hWall)} onBlur={e => setWall(selWall.id, { h: num(e.target.value, M.hWall) })} /></label>
              {selWall.shape.type === 'seg' && <>
                <label>Dày (m) <input style={{ width: 70 }} key={'t' + selWall.id + selWall.shape.t} defaultValue={selWall.shape.t} onBlur={e => { const s = selWall.shape as { type: 'seg'; a: Pt; b: Pt; t: number }; setWall(selWall.id, { shape: { ...s, t: Math.max(0.05, num(e.target.value, s.t)) } }) }} /></label>
                <label>Dài (m) <input style={{ width: 70 }} key={'l' + selWall.id + segLen.toFixed(3)} defaultValue={segLen.toFixed(2)} onBlur={e => { const s = selWall.shape as { type: 'seg'; a: Pt; b: Pt; t: number }, L = Math.max(0.1, num(e.target.value, segLen)), ux = (s.b[0] - s.a[0]) / (segLen || 1), uy = (s.b[1] - s.a[1]) / (segLen || 1); setWall(selWall.id, { shape: { ...s, b: [s.a[0] + ux * L, s.a[1] + uy * L] } }) }} /></label></>}
              <button className="btn sm" onClick={del}>Xoá</button></div> : null}
            {selDoor ? <div className="card" style={{ display: 'grid', gap: 6 }}>
              <b>Cửa</b>
              <label>Kiểu <select value={selDoor.kind} onChange={e => setDoor(selDoor.id, { kind: e.target.value as DoorKind })}>{DOOR_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
              <label>Rộng (m) <input style={{ width: 70 }} key={'w' + selDoor.id + selDoor.w} defaultValue={selDoor.w} onBlur={e => setDoor(selDoor.id, { w: Math.max(0.3, num(e.target.value, selDoor.w)) })} /></label>
              <label>Cao (m) <input style={{ width: 70 }} key={'h' + selDoor.id + selDoor.h} defaultValue={selDoor.h} onBlur={e => setDoor(selDoor.id, { h: Math.max(0.3, num(e.target.value, selDoor.h)) })} /></label>
              <label>Bệ cao (m) <input style={{ width: 70 }} key={'s' + selDoor.id + selDoor.sill} defaultValue={selDoor.sill} onBlur={e => setDoor(selDoor.id, { sill: Math.max(0, num(e.target.value, selDoor.sill)) })} /></label>
              <button className="btn sm" onClick={() => setDoor(selDoor.id, { flip: !selDoor.flip })}>Đảo phía mở</button>
              <button className="btn sm" onClick={del}>Xoá</button></div> : null}
            {!selWall && !selDoor && <div className="muted small card">Chọn một đoạn tường, cột hoặc cửa để sửa.<br />Tường nhập từ DXF kéo được cả khối hoặc từng đỉnh. Tường thêm tay có hai đầu kéo được, sửa được độ dày và độ dài.<br /><br />{M.walls.length} khối tường/cột · {M.doors.length} cửa · 1 ô = {(M.mPt * 1000).toFixed(0)} mm/pt</div>}
          </div>
        </div>}
    </>}
  </div>
}

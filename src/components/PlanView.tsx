// Khung xem mặt bằng dạng VECTOR (SVG): cuộn chuột để zoom tại con trỏ, kéo để di chuyển, bấm đúp để về vừa khung.
import { useEffect, useRef, useState } from 'react'
import type { PlanVec } from '../lib/planSvg'
import type { PlanResult } from '../lib/planRead'
import type { PlanIssue } from '../lib/planAi'

type Box = { x: number; y: number; w: number; h: number }
export default function PlanView({ vec, res, showRooms, showDoors, showLabels, issues, diffs, ppp }: {
  vec: PlanVec; res: PlanResult; showRooms: boolean; showDoors: boolean; showLabels: boolean
  issues: PlanIssue[] | null; diffs: { kind: string; x: number; y: number; w: number; h: number }[] | null; ppp: number
}) {
  const full: Box = { x: 0, y: 0, w: vec.w, h: vec.h }
  const [vb, setVb] = useState<Box>(full), el = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; vb: Box } | null>(null)
  useEffect(() => setVb({ x: 0, y: 0, w: vec.w, h: vec.h }), [vec])
  const asp = vec.h / vec.w
  // wheel: phải gắn thủ công (passive:false) để chặn cuộn trang
  useEffect(() => {
    const e = el.current; if (!e) return
    const on = (ev: WheelEvent) => {
      ev.preventDefault()
      const r = e.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height
      setVb(v => { const k = Math.exp(ev.deltaY * 0.0015), nw = Math.min(vec.w * 1.2, Math.max(vec.w / 400, v.w * k)), nh = nw * (v.h / v.w); return { x: v.x + (v.w - nw) * fx, y: v.y + (v.h - nh) * fy, w: nw, h: nh } })
    }
    e.addEventListener('wheel', on, { passive: false }); return () => e.removeEventListener('wheel', on)
  }, [vec.w])
  const fs = 4.2, dash = '4 3'
  const arc = (d: PlanResult['doors'][number]) => {
    const a0 = Math.atan2(d.Q[1] - d.H[1], d.Q[0] - d.H[0]), a1 = Math.atan2(d.E[1] - d.H[1], d.E[0] - d.H[0]); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da))
    let s = `M${d.H[0].toFixed(1)} ${d.H[1].toFixed(1)}L${d.Q[0].toFixed(1)} ${d.Q[1].toFixed(1)}`
    for (let t = 0; t <= 16; t++) { const a = a0 + da * t / 16; s += (t ? 'L' : 'M') + (d.H[0] + d.r * Math.cos(a)).toFixed(1) + ' ' + (d.H[1] + d.r * Math.sin(a)).toFixed(1) }
    return s
  }
  return <div ref={el} style={{ position: 'relative', border: '1px solid #ddd', background: '#fff', width: '100%', aspectRatio: `${vec.w} / ${Math.min(vec.h, vec.w * 0.75)}`, maxHeight: '78vh', overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
    onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, vb } }}
    onPointerMove={e => { const d = drag.current; if (!d) return; const r = e.currentTarget.getBoundingClientRect(); const s = d.vb.w / r.width; setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * s, y: d.vb.y - (e.clientY - d.y) * s }) }}
    onPointerUp={() => { drag.current = null }} onDoubleClick={() => setVb(full)}>
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
      {showRooms && vec.rooms.map(r => <path key={r.id} d={r.d} fill={r.c} fillRule="evenodd" />)}
      <path d={vec.walls} fill="#9a9a9a" fillRule="evenodd" stroke="#000" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {res.extra.map((s, i) => <line key={i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} stroke="#e07000" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
      {showDoors && <g fill="none" stroke="#1e5ac8" strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke">
        {res.doors.map((d, i) => <path key={i} d={arc(d)} vectorEffect="non-scaling-stroke" />)}
        {res.closures.map((l, i) => <line key={'c' + i} opacity={0.5} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />)}</g>}
      {showLabels && <g textAnchor="middle" fill="#000" fontFamily="Arial" style={{ userSelect: 'none', pointerEvents: 'none' }}>{res.rooms.map(r => { const f = Math.min(fs, r.w * 0.13, r.h * 0.4); return f >= 1.3 ? <text key={r.id} x={r.cx} y={r.cy} fontSize={f} stroke="#fff" strokeWidth={f * 0.18} paintOrder="stroke">{r.id} · {r.area.toFixed(1)} m²</text> : null })}</g>}
      {diffs?.map((d, i) => <rect key={'d' + i} x={d.x - 2} y={d.y - 2} width={d.w + 4} height={d.h + 4} fill="none" stroke={d.kind === 'dxfOnly' ? '#ff7a00' : '#b020c0'} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      {issues?.map(it => <g key={it.n}><rect x={it.box[0] / ppp} y={it.box[1] / ppp} width={(it.box[2] - it.box[0]) / ppp} height={(it.box[3] - it.box[1]) / ppp} fill="none" stroke="#d4202a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <text x={it.box[0] / ppp + 1} y={it.box[1] / ppp - 1.5} fill="#d4202a" fontSize={fs * 1.3} fontWeight="bold" fontFamily="Arial">{it.n}</text></g>)}
    </svg>
    <div style={{ position: 'absolute', right: 6, bottom: 6, display: 'flex', gap: 4 }} onPointerDown={e => e.stopPropagation()}>
      <button className="btn sm" onClick={() => setVb(v => ({ x: v.x + v.w * 0.25, y: v.y + v.h * 0.25, w: v.w / 2, h: v.h / 2 }))}>＋</button>
      <button className="btn sm" onClick={() => setVb(v => ({ x: v.x - v.w * 0.5, y: v.y - v.h * 0.5, w: v.w * 2, h: v.h * 2 }))}>－</button>
      <button className="btn sm" onClick={() => setVb(full)}>Vừa khung</button></div>
    <div className="muted small" style={{ position: 'absolute', left: 6, bottom: 4, background: 'rgba(255,255,255,.8)', padding: '0 4px' }}>Cuộn chuột = zoom · kéo = di chuyển · bấm đúp = vừa khung · zoom {Math.round(vec.w / vb.w * 100)}%</div>
  </div>
}

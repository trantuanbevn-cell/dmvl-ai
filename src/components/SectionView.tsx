// Cửa sổ MẶT CẮT (lớn): chọn đường cắt, đảo hướng nhìn, zoom / kéo bản vẽ, ghi dim và ghi chú, ghi ngày, ký hiệu vật liệu (mã danh mục) ngay trên hình, xuất SVG / PNG.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Model } from '../lib/plan3d/model'
import { buildSection, type MatFor, type Sec, type SecDim, type SecShape, type Hatch } from '../lib/plan3d/section'

const PAPER = '#f4efe6', INK = '#2b2723', WARM = '#8a8478', GREEN = '#2f7a4d', RED = '#c0392b'
const mixHex = (c: string, t: string, k: number) => {
  const h = (s: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [200, 200, 200] }
  const x = h(c), y = h(t); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')
}
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }
/** Mẫu gạch vật liệu (kích thước theo mét) */
function Patterns() {
  const s = 0.08, sw = 0.006
  return <defs>
    <pattern id="h-brick" width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d={`M0 0H${s}`} stroke={INK} strokeWidth={sw} /></pattern>
    <pattern id="h-steel" width={s} height={s} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><path d={`M0 0H${s}`} stroke={INK} strokeWidth={sw * 1.4} /></pattern>
    <pattern id="h-concrete" width={s} height={s} patternUnits="userSpaceOnUse"><circle cx={s * 0.25} cy={s * 0.3} r={0.006} fill={INK} /><circle cx={s * 0.72} cy={s * 0.7} r={0.008} fill={INK} /><path d={`M${s * 0.6} ${s * 0.2}l${s * 0.1} ${s * 0.1}l${-s * 0.2} 0z`} fill="none" stroke={INK} strokeWidth={sw * 0.7} /></pattern>
    <pattern id="h-plaster" width={s} height={s} patternUnits="userSpaceOnUse"><circle cx={s * 0.3} cy={s * 0.3} r={0.005} fill={WARM} /><circle cx={s * 0.75} cy={s * 0.75} r={0.005} fill={WARM} /></pattern>
    <pattern id="h-gypsum" width={s * 0.7} height={s} patternUnits="userSpaceOnUse"><path d={`M0 0V${s}`} stroke={WARM} strokeWidth={sw * 0.8} /></pattern>
    <pattern id="h-insul" width={s * 1.5} height={s} patternUnits="userSpaceOnUse"><path d={`M0 ${s * 0.5}Q${s * 0.19} 0 ${s * 0.375} ${s * 0.5}T${s * 0.75} ${s * 0.5}T${s * 1.125} ${s * 0.5}T${s * 1.5} ${s * 0.5}`} fill="none" stroke={INK} strokeWidth={sw * 0.8} /></pattern>
    <pattern id="h-wood" width={s} height={s * 0.5} patternUnits="userSpaceOnUse"><path d={`M0 ${s * 0.25}H${s}`} stroke="#7a5a35" strokeWidth={sw} /></pattern>
    <pattern id="h-stone" width={s} height={s} patternUnits="userSpaceOnUse"><path d={`M0 0L${s} ${s}M${s} 0L0 ${s}`} stroke={WARM} strokeWidth={sw * 0.8} /></pattern>
    <pattern id="h-glass" width={s * 2} height={s * 2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d={`M0 ${s}H${s * 0.8}`} stroke="#5d9fb2" strokeWidth={sw} /></pattern>
  </defs>
}
const hatchFill = (h: Hatch) => (h === 'none' || h === 'air' ? undefined : `url(#h-${h})`)
type VB = { x: number; y: number; w: number; h: number }
type Tool = 'pan' | 'dim' | 'note'
const TOP = 1.7

export default function SectionView({ model, sections, activeId, onPick, onChange, onClose, mat, matNote }: {
  model: Model; sections: Sec[]; activeId: string; onPick: (id: string) => void; onChange: (s: Sec[]) => void; onClose: () => void; mat?: MatFor; matNote?: string
}) {
  const sec = sections.find(s => s.id === activeId) ?? sections[0]
  const svgRef = useRef<SVGSVGElement>(null), wrap = useRef<HTMLDivElement>(null)
  const R = useMemo(() => sec ? buildSection(model, sec, mat) : null, [model, sec, mat])
  const [tool, setTool] = useState<Tool>('pan'), [vb, setVb] = useState<VB | null>(null), [pts, setPts] = useState<[number, number][]>([]), [cur, setCur] = useState<[number, number] | null>(null), [selId, setSelId] = useState('')
  const drag = useRef<{ x: number; y: number; vb: VB; moved: boolean } | null>(null)
  const set = (patch: Partial<Sec>) => sec && onChange(sections.map(s => s.id === sec.id ? { ...s, ...patch } : s))
  const del = () => { if (!sec) return; const rest = sections.filter(s => s.id !== sec.id); onChange(rest); if (rest[0]) onPick(rest[0].id); else onClose() }

  const fs = R ? Math.max(0.1, Math.min(0.2, R.L / 70)) : 0.1
  const full = useMemo<VB | null>(() => R && !R.empty ? { x: -0.9, y: 0, w: R.L + 1.8, h: R.zMax - R.zMin + 2.6 } : null, [R])
  useEffect(() => { setVb(full); setPts([]); setSelId('') }, [full?.w, full?.h, sec?.id]) // eslint-disable-line
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (pts.length) setPts([]); else if (tool !== 'pan') setTool('pan') } if ((e.key === 'Delete' || e.key === 'Backspace') && selId && sec && !(e.target as HTMLElement).matches?.('input,textarea')) delSel() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  const Zf = (z: number) => (R ? R.zMax - z + TOP : 0), zOf = (y: number) => (R ? R.zMax - y + TOP : 0)
  const toSvg = (e: { clientX: number; clientY: number }): [number, number] => { const el = svgRef.current!, pt = el.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(el.getScreenCTM()!.inverse()); return [q.x, q.y] }
  const verts = useMemo(() => { const v: [number, number][] = []; for (const s of R?.shapes ?? []) for (const x of [s.x0, s.x1]) for (const z of [s.z0, s.z1]) v.push([x, z]); return v }, [R])
  /** toạ độ trên bản vẽ (x, z) – hút vào góc vật thể gần nhất */
  const snap = (e: { clientX: number; clientY: number }): [number, number] => {
    const [sx, sy] = toSvg(e), x = sx, z = zOf(sy), tol = (vb?.w ?? 10) * 0.012
    let best: [number, number] | null = null, bd = tol
    for (const p of verts) { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; best = p } }
    return best ?? [x, z]
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!vb) return; const [sx, sy] = toSvg(e), k = e.deltaY > 0 ? 1.15 : 1 / 1.15
    const w = Math.min(full!.w * 3, Math.max(0.3, vb.w * k)), r = w / vb.w, h = vb.h * r
    setVb({ x: sx - (sx - vb.x) * r, y: sy - (sy - vb.y) * r, w, h })
  }
  const onDown = (e: React.PointerEvent) => {
    if (!vb) return
    if (e.button === 1 || tool === 'pan') { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId); return }
    if (e.button !== 0) return
    const p = snap(e)
    if (tool === 'note') { const t = window.prompt('Nội dung ghi chú:'); if (t?.trim()) set({ notes: [...(sec?.notes ?? []), { id: uid('n'), x: p[0], z: p[1], t: t.trim() }] }); return }
    if (tool === 'dim') {
      const n = [...pts, p]
      if (n.length < 3) { setPts(n); return }
      const [a, b] = n, horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), off = horiz ? p[1] - Math.max(a[1], b[1]) : p[0] - Math.max(a[0], b[0])
      set({ dims: [...(sec?.dims ?? []), { id: uid('d'), a, b, off }] }); setPts([]); return
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag.current && vb) {
      const el = svgRef.current!, r = el.getBoundingClientRect(), k = Math.max(vb.w / r.width, vb.h / r.height), d = drag.current
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true
      setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * k, y: d.vb.y - (e.clientY - d.y) * k }); return
    }
    if (tool !== 'pan' && pts.length) setCur(snap(e))
  }
  const onUp = () => { if (drag.current && !drag.current.moved) setSelId(''); drag.current = null }
  const delSel = () => { if (!sec || !selId) return; set({ dims: (sec.dims ?? []).filter(d => d.id !== selId), notes: (sec.notes ?? []).filter(n => n.id !== selId) }); setSelId('') }
  const editDim = (d: SecDim) => { const t = window.prompt('Chữ ghi đè (trống = số đo thật, mm):', d.txt ?? ''); if (t !== null) set({ dims: (sec?.dims ?? []).map(x => x.id === d.id ? { ...x, txt: t.trim() || undefined } : x) }) }

  const dl = (name: string, blob: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const svgText = () => { const e = svgRef.current; if (!e || !full) return ''; const c = e.cloneNode(true) as SVGSVGElement; c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('viewBox', `${full.x} ${full.y} ${full.w} ${full.h}`); c.removeAttribute('style'); c.setAttribute('width', '2400'); c.setAttribute('height', String(Math.round(2400 * full.h / full.w))); return new XMLSerializer().serializeToString(c) }
  const exportSvg = () => dl(`mat-cat-${sec?.name ?? 'A'}.svg`, new Blob([svgText()], { type: 'image/svg+xml' }))
  const exportPng = () => {
    if (!full || !sec) return
    const W = 2800, H = Math.round(W * full.h / full.w), img = new Image()
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!; g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); cv.toBlob(b => b && dl(`mat-cat-${sec.name}.png`, b), 'image/png') }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }

  const dimGlyph = (d: SecDim) => {
    const horiz = Math.abs(d.b[0] - d.a[0]) >= Math.abs(d.b[1] - d.a[1]), len = horiz ? Math.abs(d.b[0] - d.a[0]) : Math.abs(d.b[1] - d.a[1])
    const txt = d.txt ?? String(Math.round(len * 1000)), on = selId === d.id, c = on ? '#e07000' : RED, tk = fs * 0.35
    const hit = { onPointerDown: (e: React.PointerEvent) => { if (tool === 'pan') { e.stopPropagation(); setSelId(d.id) } }, onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); editDim(d) }, style: { cursor: 'pointer' } as React.CSSProperties }
    if (horiz) {
      const zl = Math.max(d.a[1], d.b[1]) + d.off, x0 = Math.min(d.a[0], d.b[0]), x1 = Math.max(d.a[0], d.b[0]), y = Zf(zl)
      return <g key={d.id} {...hit}>
        {[d.a, d.b].map((p, i) => <line key={i} x1={p[0]} x2={p[0]} y1={Zf(p[1]) + (zl > p[1] ? -0.03 : 0.03)} y2={y + (zl > p[1] ? -tk : tk)} stroke={c} strokeWidth={0.006} />)}
        <line x1={x0} x2={x1} y1={y} y2={y} stroke={c} strokeWidth={0.01} />
        {[x0, x1].map((x, i) => <line key={i} x1={x - tk / 2} x2={x + tk / 2} y1={y + tk / 2} y2={y - tk / 2} stroke={c} strokeWidth={0.012} />)}
        <text x={(x0 + x1) / 2} y={y - fs * 0.25} fontSize={fs * 0.9} textAnchor="middle" fill={c} stroke={PAPER} strokeWidth={fs * 0.2} paintOrder="stroke">{txt}</text>
        <line x1={x0} x2={x1} y1={y} y2={y} stroke="transparent" strokeWidth={0.12} />
      </g>
    }
    const xl = Math.max(d.a[0], d.b[0]) + d.off, z0 = Math.min(d.a[1], d.b[1]), z1 = Math.max(d.a[1], d.b[1])
    return <g key={d.id} {...hit}>
      {[d.a, d.b].map((p, i) => <line key={i} y1={Zf(p[1])} y2={Zf(p[1])} x1={p[0] + (xl > p[0] ? 0.03 : -0.03)} x2={xl + (xl > p[0] ? -tk : tk)} stroke={c} strokeWidth={0.006} />)}
      <line x1={xl} x2={xl} y1={Zf(z0)} y2={Zf(z1)} stroke={c} strokeWidth={0.01} />
      {[z0, z1].map((z, i) => <line key={i} x1={xl - tk / 2} x2={xl + tk / 2} y1={Zf(z) + tk / 2} y2={Zf(z) - tk / 2} stroke={c} strokeWidth={0.012} />)}
      <text transform={`translate(${xl - fs * 0.25} ${Zf((z0 + z1) / 2)}) rotate(-90)`} fontSize={fs * 0.9} textAnchor="middle" fill={c} stroke={PAPER} strokeWidth={fs * 0.2} paintOrder="stroke">{txt}</text>
      <line x1={xl} x2={xl} y1={Zf(z0)} y2={Zf(z1)} stroke="transparent" strokeWidth={0.12} />
    </g>
  }

  const body = () => {
    if (!R || !sec || !vb) return null
    if (R.empty) return <div className="muted" style={{ padding: 30 }}>Đường cắt này không đi qua tường hay sàn nào. Hãy vẽ lại đường cắt đi xuyên qua công trình.</div>
    const maxDepth = Math.max(1, ...R.shapes.filter(s => s.kind === 'beyond').map(s => s.depth))
    const X = (x: number) => x
    const drawShape = (s: SecShape, i: number) => {
      const w = s.x1 - s.x0, h = s.z1 - s.z0; if (w <= 0.001 || h <= 0.001) return null
      const near = s.kind === 'beyond' || s.kind === 'furn' || s.kind === 'door' || s.kind === 'glass'
      const fill = near && s.kind !== 'door' ? mixHex(s.fill, PAPER, Math.min(0.3, s.depth / maxDepth * 0.3)) : s.fill
      const cut = s.kind === 'cut' || s.kind === 'cutfurn'
      const stroke = cut ? INK : s.kind === 'slab' ? '#4a443c' : '#9a9384', sw = cut ? 0.012 : s.kind === 'slab' ? 0.008 : 0.006
      return <g key={i}>
        <rect x={X(s.x0)} y={Zf(s.z1)} width={w} height={h} fill={fill} fillOpacity={s.kind === 'glass' ? 0.55 : s.kind === 'cutfurn' ? 0.75 : 1} stroke={stroke} strokeWidth={sw} />
        {s.hatch !== 'none' && hatchFill(s.hatch) && <rect x={X(s.x0)} y={Zf(s.z1)} width={w} height={h} fill={hatchFill(s.hatch)} fillOpacity={s.kind === 'cut' ? 0.8 : 0.6} />}
      </g>
    }
    // ký hiệu vật liệu: bong bóng số + MÃ danh mục (hoặc tên thư viện) ngay trên hình
    const bub = R.legend.map((l, i) => { const row = i % 4, by = Zf(R.zMax) - 0.3 - row * (fs * 2.5); return { l, bx: X(l.at[0]), by } })
    const dimPrev = tool === 'dim' && pts.length && cur ? (() => { const a = pts[0], b = pts.length > 1 ? pts[1] : cur, horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), off = pts.length > 1 ? (horiz ? cur[1] - Math.max(a[1], b[1]) : cur[0] - Math.max(a[0], b[0])) : 0.4; return dimGlyph({ id: 'prev', a, b, off }) })() : null
    return <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ width: '100%', height: '100%', background: PAPER, display: 'block', cursor: tool === 'pan' ? (drag.current ? 'grabbing' : 'grab') : 'crosshair', touchAction: 'none', userSelect: 'none' }} fontFamily="system-ui,Arial,sans-serif"
      onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      <Patterns />
      <rect x={-5} y={-5} width={R.L + 10} height={R.zMax - R.zMin + 12} fill={PAPER} />
      {R.levels.map((lv, i) => <g key={i}>
        <line x1={-0.8} x2={R.L + 0.6} y1={Zf(lv.z)} y2={Zf(lv.z)} stroke="#b8b0a0" strokeWidth={0.005} strokeDasharray="0.12 0.06" />
        <path d={`M-0.7 ${Zf(lv.z)}l${fs * 0.5} ${-fs * 0.7}h${-fs}z`} fill={INK} />
        <text x={-0.7 + fs * 0.8} y={Zf(lv.z) - fs * 0.15} fontSize={fs} fill={INK}>{lv.text}</text>
      </g>)}
      {R.shapes.map(drawShape)}
      {R.rooms.map((r, i) => (r.x1 - r.x0) > fs * 4 && <text key={i} x={(r.x0 + r.x1) / 2} y={Zf(r.ceil) + fs * 1.6} fontSize={fs * 0.9} textAnchor="middle" fill="#6b5b45">{r.name || 'Phòng'} · trần +{r.ceil.toFixed(2)}</text>)}
      {bub.map(({ l, bx, by }) => { const c = l.src === 'catalog' ? GREEN : INK, tag = l.code ?? l.name; return <g key={l.n}>
        <line x1={bx} y1={Zf(l.at[1])} x2={bx} y2={by + fs * 0.9} stroke={c} strokeWidth={0.006} />
        <circle cx={bx} cy={Zf(l.at[1])} r={0.025} fill={c} />
        <circle cx={bx} cy={by} r={fs * 0.9} fill="#fff" stroke={c} strokeWidth={0.012} />
        <text x={bx} y={by + fs * 0.35} fontSize={fs} textAnchor="middle" fill={INK} fontWeight={700}>{l.n}</text>
        <text x={bx + fs * 1.1} y={by + fs * 0.3} fontSize={fs * 0.85} fill={c} fontWeight={600}>{tag.length > 26 ? tag.slice(0, 25) + '…' : tag}</text>
      </g> })}
      {(sec.dims ?? []).map(dimGlyph)}
      {dimPrev}
      {tool === 'dim' && pts.map((p, i) => <circle key={i} cx={p[0]} cy={Zf(p[1])} r={0.04} fill={RED} />)}
      {(sec.notes ?? []).map(n => { const on = selId === n.id; return <g key={n.id} style={{ cursor: 'pointer' }} onPointerDown={e => { if (tool === 'pan') { e.stopPropagation(); setSelId(n.id) } }} onDoubleClick={e => { e.stopPropagation(); const t = window.prompt('Sửa ghi chú:', n.t); if (t !== null) set({ notes: (sec.notes ?? []).map(x => x.id === n.id ? { ...x, t: t.trim() || n.t } : x) }) }}>
        <circle cx={n.x} cy={Zf(n.z)} r={0.03} fill={on ? '#e07000' : RED} />
        <text x={n.x + 0.08} y={Zf(n.z) - 0.05} fontSize={fs * 0.95} fill={on ? '#e07000' : RED} stroke={PAPER} strokeWidth={fs * 0.2} paintOrder="stroke">{n.t}</text>
      </g> })}
      {/* khung tên bản vẽ */}
      <g>
        <text x={-0.8} y={R.zMax - R.zMin + TOP + 0.6} fontSize={fs * 1.7} fontWeight={700} fill={INK}>MẶT CẮT {sec.name}</text>
        <text x={-0.8} y={R.zMax - R.zMin + TOP + 0.6 + fs * 1.3} fontSize={fs * 0.9} fill={WARM}>Ngày: {sec.date ?? today()} · dài {R.L.toFixed(2)} m · nhìn {sec.flip ? 'phía bên kia' : 'phía mặc định'}{sec.depth ? ` · lấy sâu ${sec.depth} m` : ''}</text>
      </g>
    </svg>
  }

  const tb = (t: Tool, label: string, title: string) => <button className={'btn sm' + (tool === t ? ' primary' : '')} title={title} onClick={() => { setTool(t); setPts([]) }}>{label}</button>
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: '98vw', maxWidth: '98vw', height: '96vh', maxHeight: '96vh', display: 'flex', flexDirection: 'column', padding: 10, overflow: 'hidden' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="row gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <b>✂ Mặt cắt</b>
            <select value={sec?.id ?? ''} onChange={e => onPick(e.target.value)}>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            {sec && <>
              <input style={{ width: 64 }} value={sec.name} onChange={e => set({ name: e.target.value })} title="Tên mặt cắt" />
              <button className="btn sm" title="Đổi sang nhìn phía bên kia đường cắt" onClick={() => set({ flip: !sec.flip })}>⇄ Đảo hướng</button>
              <label className="small" title="Chỉ lấy vật thể sau mặt cắt trong khoảng này (m)">Sâu <input style={{ width: 46 }} value={sec.depth ?? ''} placeholder="hết" onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); set({ depth: v > 0 ? v : undefined }) }} /> m</label>
              <label className="small">Ngày <input style={{ width: 92 }} value={sec.date ?? today()} onChange={e => set({ date: e.target.value })} /></label>
              <span style={{ borderLeft: '1px solid #ccc', height: 20 }} />
              {tb('pan', '✋ Chọn / kéo', 'Kéo để dời bản vẽ, cuộn chuột để zoom, bấm dim / ghi chú để chọn (Del = xoá, nhấp đúp = sửa chữ)')}
              {tb('dim', '📏 Dim', 'Bấm 2 điểm cần đo (tự hút vào góc vật thể) rồi bấm điểm thứ 3 để đặt đường dim')}
              {tb('note', '✎ Ghi chú', 'Bấm vào vị trí cần ghi chú')}
              {selId && <button className="btn sm" onClick={delSel}>🗑 Xoá mục chọn</button>}
              <button className="btn sm" onClick={() => setVb(full)}>⤢ Vừa khung</button>
              <button className="btn sm" onClick={exportSvg}>⬇ SVG</button><button className="btn sm" onClick={exportPng}>⬇ PNG</button>
              <button className="btn sm" onClick={del}>🗑 Xoá mặt cắt</button>
            </>}
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="small muted" style={{ margin: '2px 0' }}>Cuộn chuột = zoom · kéo = dời · {tool === 'dim' ? 'Dim: bấm điểm 1, điểm 2, rồi vị trí đường dim · Esc = huỷ' : tool === 'note' ? 'Ghi chú: bấm vào vị trí cần ghi' : 'nhấp đúp dim / ghi chú để sửa chữ'}. Số xanh = vật liệu từ danh mục (mã hiện ngay cạnh số); số đen = thư viện. {matNote}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 8, flex: 1, minHeight: 0 }}>
          <div ref={wrap} style={{ minHeight: 0, border: '1px solid #d9d2c4', background: PAPER }}>{body()}</div>
          <div style={{ display: 'grid', gap: 6, alignContent: 'start', overflowY: 'auto', minHeight: 0 }}>
            <b className="small">Bảng vật liệu</b>
            {R?.legend.map(l => (
              <div key={l.n} style={{ display: 'grid', gridTemplateColumns: '24px 26px 1fr', gap: 6, alignItems: 'start', fontSize: 12 }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${l.src === 'catalog' ? GREEN : INK}`, textAlign: 'center', fontWeight: 700, lineHeight: '16px' }}>{l.n}</span>
                <svg width="26" height="20" viewBox="0 0 26 20"><rect width="26" height="20" fill={l.color} stroke="#555" /><rect width="26" height="20" fill={hatchFill(l.hatch) ?? 'none'} /></svg>
                <div><div>{l.name}</div>
                  <div className="muted">{l.src === 'catalog' ? <span style={{ color: GREEN }}>Danh mục{l.code ? ' · ' + l.code : ''}</span> : 'Thư viện'}{l.note ? <span style={{ color: l.note.startsWith('danh mục chưa') ? '#a85a00' : undefined }}> · {l.note}</span> : null}</div></div>
              </div>))}
            {R && !R.legend.length && <span className="muted small">Chưa có vật liệu.</span>}
          </div>
        </div>
      </div>
    </div>)
}

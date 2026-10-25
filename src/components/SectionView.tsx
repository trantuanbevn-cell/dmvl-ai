// Cửa sổ MẶT CẮT: chọn đường cắt đã vẽ trên mặt bằng, đảo hướng nhìn, xem lớp cấu tạo (lấy vật liệu từ danh mục), xuất SVG / PNG.
import { useMemo, useRef } from 'react'
import type { Model } from '../lib/plan3d/model'
import { buildSection, type MatFor, type Sec, type SecShape, type Hatch } from '../lib/plan3d/section'

const PAPER = '#f4efe6', INK = '#2b2723', WARM = '#8a8478'
const mixHex = (c: string, t: string, k: number) => {
  const h = (s: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(s.trim()); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [200, 200, 200] }
  const x = h(c), y = h(t); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')
}
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

export default function SectionView({ model, sections, activeId, onPick, onChange, onClose, mat, matNote }: {
  model: Model; sections: Sec[]; activeId: string; onPick: (id: string) => void; onChange: (s: Sec[]) => void; onClose: () => void; mat?: MatFor; matNote?: string
}) {
  const sec = sections.find(s => s.id === activeId) ?? sections[0]
  const svgRef = useRef<SVGSVGElement>(null)
  const R = useMemo(() => sec ? buildSection(model, sec, mat) : null, [model, sec, mat])
  const set = (patch: Partial<Sec>) => sec && onChange(sections.map(s => s.id === sec.id ? { ...s, ...patch } : s))
  const del = () => { if (!sec) return; const rest = sections.filter(s => s.id !== sec.id); onChange(rest); if (rest[0]) onPick(rest[0].id); else onClose() }

  const dl = (name: string, blob: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const svgText = () => { const e = svgRef.current; if (!e) return ''; const c = e.cloneNode(true) as SVGSVGElement; c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return new XMLSerializer().serializeToString(c) }
  const exportSvg = () => dl(`mat-cat-${sec?.name ?? 'A'}.svg`, new Blob([svgText()], { type: 'image/svg+xml' }))
  const exportPng = () => {
    const e = svgRef.current; if (!e || !sec) return
    const vb = e.viewBox.baseVal, W = 2400, H = Math.round(W * vb.height / vb.width), img = new Image()
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!; g.fillStyle = PAPER; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H); cv.toBlob(b => b && dl(`mat-cat-${sec.name}.png`, b), 'image/png') }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }

  const body = () => {
    if (!R || !sec) return null
    if (R.empty) return <div className="muted" style={{ padding: 30 }}>Đường cắt này không đi qua tường hay sàn nào. Hãy vẽ lại đường cắt đi xuyên qua công trình.</div>
    const x0 = -0.9, W = R.L + 1.8, Hh = R.zMax - R.zMin + 2.4
    const X = (x: number) => x, Z = (z: number) => R.zMax - z + 1.7
    const maxDepth = Math.max(1, ...R.shapes.filter(s => s.kind === 'beyond').map(s => s.depth))
    const fs = Math.max(0.1, Math.min(0.2, R.L / 70))
    const drawShape = (s: SecShape, i: number) => {
      const w = s.x1 - s.x0, h = s.z1 - s.z0; if (w <= 0.001 || h <= 0.001) return null
      const near = s.kind === 'beyond' || s.kind === 'furn' || s.kind === 'door' || s.kind === 'glass'
      const fill = near && s.kind !== 'door' ? mixHex(s.fill, PAPER, Math.min(0.3, s.depth / maxDepth * 0.3)) : s.fill
      const cut = s.kind === 'cut' || s.kind === 'cutfurn'
      const stroke = cut ? INK : s.kind === 'slab' ? '#4a443c' : '#9a9384'
      const sw = cut ? 0.012 : s.kind === 'slab' ? 0.008 : 0.006
      return <g key={i}>
        <rect x={X(s.x0)} y={Z(s.z1)} width={w} height={h} fill={fill} fillOpacity={s.kind === 'glass' ? 0.55 : s.kind === 'cutfurn' ? 0.75 : 1} stroke={stroke} strokeWidth={sw} />
        {s.hatch !== 'none' && hatchFill(s.hatch) && <rect x={X(s.x0)} y={Z(s.z1)} width={w} height={h} fill={hatchFill(s.hatch)} fillOpacity={s.kind === 'cut' ? 0.8 : 0.6} />}
      </g>
    }
    // chuyển số thứ tự vật liệu → bong bóng chú thích phía trên bản vẽ
    const bub = R.legend.map((l, i) => { const row = i % 3, by = Z(R.zMax) - 0.28 - row * (fs * 2.6); return { l, bx: X(l.at[0]), by } })
    return <svg ref={svgRef} viewBox={`${x0} 0 ${W} ${Hh + 0.2}`} style={{ width: '100%', background: PAPER, border: '1px solid #d9d2c4' }} fontFamily="system-ui,Arial,sans-serif">
      <Patterns />
      <rect x={x0} y={0} width={W} height={Hh + 0.2} fill={PAPER} />
      {/* cốt */}
      {R.levels.map((lv, i) => <g key={i}>
        <line x1={x0 + 0.1} x2={R.L + 0.6} y1={Z(lv.z)} y2={Z(lv.z)} stroke="#b8b0a0" strokeWidth={0.005} strokeDasharray="0.12 0.06" />
        <path d={`M${x0 + 0.2} ${Z(lv.z)}l${fs * 0.5} ${-fs * 0.7}h${-fs}z`} fill={INK} />
        <text x={x0 + 0.2 + fs * 0.8} y={Z(lv.z) - fs * 0.15} fontSize={fs} fill={INK}>{lv.text}</text>
      </g>)}
      {R.shapes.map(drawShape)}
      {/* tên phòng */}
      {R.rooms.map((r, i) => (r.x1 - r.x0) > fs * 4 && <text key={i} x={(r.x0 + r.x1) / 2} y={Z(r.ceil) + fs * 1.6} fontSize={fs * 0.9} textAnchor="middle" fill="#6b5b45">{r.name || 'Phòng'} · trần +{r.ceil.toFixed(2)}</text>)}
      {/* chú thích */}
      {bub.map(({ l, bx, by }) => <g key={l.n}>
        <line x1={bx} y1={Z(l.at[1])} x2={bx} y2={by + fs * 0.9} stroke={l.src === 'catalog' ? '#2f7a4d' : INK} strokeWidth={0.006} />
        <circle cx={bx} cy={Z(l.at[1])} r={0.025} fill={l.src === 'catalog' ? '#2f7a4d' : INK} />
        <circle cx={bx} cy={by} r={fs * 0.9} fill="#fff" stroke={l.src === 'catalog' ? '#2f7a4d' : INK} strokeWidth={0.012} />
        <text x={bx} y={by + fs * 0.35} fontSize={fs} textAnchor="middle" fill={INK} fontWeight={700}>{l.n}</text>
      </g>)}
      <text x={x0 + 0.2} y={Hh - fs * 1.6} fontSize={fs * 1.6} fontWeight={700} fill={INK}>MẶT CẮT {sec.name}</text>
      <text x={x0 + 0.2} y={Hh - fs * 0.3} fontSize={fs * 0.85} fill={WARM}>Hướng nhìn: {sec.flip ? 'phía bên kia' : 'phía mặc định'} · dài {R.L.toFixed(2)} m{sec.depth ? ` · lấy sâu ${sec.depth} m` : ''}</text>
      <text x={X(0)} y={Z(R.zMin) + 0.3} fontSize={fs * 0.8} fill={WARM}>0</text>
      <text x={X(R.L)} y={Z(R.zMin) + 0.3} fontSize={fs * 0.8} fill={WARM} textAnchor="end">{R.L.toFixed(2)} m</text>
    </svg>
  }

  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(1280px,96vw)', maxHeight: '94vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>✂ Mặt cắt không gian</h3>
          <div className="row gap" style={{ flexWrap: 'wrap' }}>
            <select value={sec?.id ?? ''} onChange={e => onPick(e.target.value)}>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            {sec && <>
              <input style={{ width: 70 }} value={sec.name} onChange={e => set({ name: e.target.value })} title="Tên mặt cắt" />
              <button className="btn sm" title="Đổi sang nhìn phía bên kia đường cắt" onClick={() => set({ flip: !sec.flip })}>⇄ Đảo hướng nhìn</button>
              <label className="small" title="Chỉ lấy các vật thể sau mặt cắt trong khoảng này (m). Trống = hết">Sâu <input style={{ width: 50 }} value={sec.depth ?? ''} placeholder="hết" onChange={e => { const v = parseFloat(e.target.value.replace(',', '.')); set({ depth: v > 0 ? v : undefined }) }} /> m</label>
              <button className="btn sm" onClick={exportSvg}>⬇ SVG</button><button className="btn sm" onClick={exportPng}>⬇ PNG</button>
              <button className="btn sm" onClick={del}>🗑 Xoá</button>
            </>}
            <button className="btn ghost sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: '4px 0' }}>Lớp cấu tạo: hai mặt tường, sàn và trần lấy theo vật liệu của phòng đó trong <b>danh mục</b> (số xanh); phần chưa có trong danh mục dùng thư viện (số đen). {matNote}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 270px', gap: 10, alignItems: 'start' }}>
          <div>{body()}</div>
          <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
            <b className="small">Bảng vật liệu</b>
            {R?.legend.map(l => (
              <div key={l.n} style={{ display: 'grid', gridTemplateColumns: '26px 28px 1fr', gap: 6, alignItems: 'start', fontSize: 12 }}>
                <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${l.src === 'catalog' ? '#2f7a4d' : INK}`, textAlign: 'center', fontWeight: 700, lineHeight: '18px' }}>{l.n}</span>
                <svg width="28" height="22" viewBox="0 0 28 22"><rect width="28" height="22" fill={l.color} stroke="#555" /><rect width="28" height="22" fill={hatchFill(l.hatch) ?? 'none'} /><defs /></svg>
                <div><div>{l.name}</div>
                  <div className="muted">{l.src === 'catalog' ? <span style={{ color: '#2f7a4d' }}>Danh mục{l.code ? ' · ' + l.code : ''}</span> : 'Thư viện'}{l.note ? <span style={{ color: l.note.startsWith('danh mục chưa') ? '#a85a00' : undefined }}> · {l.note}</span> : null}</div></div>
              </div>))}
            {R && !R.legend.length && <span className="muted small">Chưa có vật liệu.</span>}
          </div>
        </div>
      </div>
    </div>)
}

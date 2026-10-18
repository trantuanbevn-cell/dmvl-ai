// Mặt cắt kiểu SketchUp: nét đen, tường tô gạch chéo. Cắt ngang qua cửa (nhìn từ trên), cắt đứng qua cửa (đầu cửa – bệ), và cắt cấu tạo lớp của tường.
import type { Door } from '../lib/plan3d/model'
import type { DoorSpec, WallType, Layer } from '../lib/plan3d/library'

const HATCH: Record<Layer['hatch'], { bg: string; fg: string; kind: 'diag' | 'cross' | 'dots' | 'solid' | 'none' }> = {
  plaster: { bg: '#f4efe6', fg: '#b9ab94', kind: 'dots' }, brick: { bg: '#f1d9cd', fg: '#b86a4e', kind: 'diag' }, concrete: { bg: '#e1e1e1', fg: '#777', kind: 'dots' },
  gypsum: { bg: '#f7f7f3', fg: '#9a9a90', kind: 'solid' }, glass: { bg: '#d6eef4', fg: '#5a9fb0', kind: 'none' }, wood: { bg: '#e9cfa8', fg: '#8a6232', kind: 'diag' },
  air: { bg: '#ffffff', fg: '#bbb', kind: 'none' }, stone: { bg: '#e6e0d6', fg: '#7d7468', kind: 'cross' }, steel: { bg: '#cfd4d8', fg: '#555', kind: 'solid' }, insul: { bg: '#fbf3c8', fg: '#c7b64a', kind: 'cross' },
}
function Defs() {
  return <defs>{(Object.keys(HATCH) as Layer['hatch'][]).map(k => { const h = HATCH[k]; return <pattern key={k} id={'h-' + k} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill={h.bg} />
    {h.kind === 'diag' && <path d="M-1 7L7 -1M-1 1L1 -1M5 7L7 5" stroke={h.fg} strokeWidth="0.8" />}{h.kind === 'cross' && <path d="M-1 7L7 -1M7 7L-1 -1" stroke={h.fg} strokeWidth="0.5" />}{h.kind === 'dots' && <><circle cx="1.5" cy="1.5" r="0.7" fill={h.fg} /><circle cx="4.5" cy="4.5" r="0.7" fill={h.fg} /></>}</pattern> })}</defs>
}
const ink = '#111'

/** Mặt cắt ngang qua cửa (nhìn từ trên xuống): tường 2 bên, khung, cánh, ốp viền; ghi kích thước */
export function DoorPlanSection({ d, spec, T = 0.2 }: { d: Door; spec?: DoorSpec; T?: number }) {
  const S = 140 / Math.max(d.w + 0.5, 1.2), pad = 14, W = (d.w + 0.5) * S + pad * 2, H = T * S + 44, x0 = pad + 0.25 * S, fw = (spec?.frame ?? 0.06), y0 = 12
  const lw = Math.max(1, S * 0.045), r = (x: number, y: number, w: number, h: number, f: string, sw = 1) => <rect x={x} y={y} width={w} height={h} fill={f} stroke={ink} strokeWidth={sw} />
  const win = d.kind === 'window' || spec?.leaf === 'fixed' || spec?.leaf === 'casement' || spec?.leaf === 'sliding' || spec?.leaf === 'awning'
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', background: '#fff', border: '1px solid #ddd' }}><Defs />
    {r(pad, y0, 0.25 * S, T * S, 'url(#h-brick)')}{r(x0 + d.w * S, y0, 0.25 * S, T * S, 'url(#h-brick)')}
    {r(x0, y0 + (T * S - T * S) / 2, fw * S, T * S, '#e6d3b0')}{r(x0 + d.w * S - fw * S, y0, fw * S, T * S, '#e6d3b0')}
    {win ? r(x0 + fw * S, y0 + T * S / 2 - lw / 2, (d.w - 2 * fw) * S, lw, '#cfe9f0') : r(x0 + fw * S, y0 + T * S / 2 - lw / 2, (d.w - 2 * fw) * S, lw, '#c8a272')}
    {r(x0 - 0.04 * S, y0 - 3, 0.04 * S, 3, '#e6d3b0')}
    <g stroke={ink} strokeWidth="0.8" fontSize="9" fill={ink}><path d={`M${x0} ${y0 + T * S + 12}H${x0 + d.w * S}M${x0} ${y0 + T * S + 8}V${y0 + T * S + 16}M${x0 + d.w * S} ${y0 + T * S + 8}V${y0 + T * S + 16}`} /><text x={x0 + d.w * S / 2} y={y0 + T * S + 25} textAnchor="middle" stroke="none">{Math.round(d.w * 1000)}</text></g>
  </svg>
}
/** Mặt cắt đứng (qua giữa ô cửa): sàn, bệ, khung đầu, cánh, vùng tường trên đầu cửa */
export function DoorElevSection({ d, spec, H = 3.3, T = 0.2 }: { d: Door; spec?: DoorSpec; H?: number; T?: number }) {
  const S = 120 / H, pad = 16, W = (T + 0.5) * S + pad * 2 + 30, Hh = H * S + pad * 2, fy = (y: number) => pad + (H - y) * S, x0 = pad + 0.15 * S, fw = spec?.frame ?? 0.06
  const top = d.sill + d.h, win = d.kind === 'window'
  const R = (x: number, y1: number, y2: number, w: number, f: string, sw = 1) => <rect x={x} y={fy(y2)} width={w} height={(y2 - y1) * S} fill={f} stroke={ink} strokeWidth={sw} />
  return <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', background: '#fff', border: '1px solid #ddd' }}><Defs />
    {R(x0, top, H, T * S / S, 'url(#h-brick)')}{d.sill > 0 && R(x0, 0, d.sill, T * S / S, 'url(#h-brick)')}
    <rect x={x0} y={fy(H)} width={T * S} height={(H - top) * S} fill="url(#h-brick)" stroke={ink} />{d.sill > 0 && <rect x={x0} y={fy(d.sill)} width={T * S} height={d.sill * S} fill="url(#h-brick)" stroke={ink} />}
    <rect x={x0 - 3} y={fy(top)} width={T * S + 6} height={fw * S} fill="#e6d3b0" stroke={ink} />
    {win && <rect x={x0 - 3} y={fy(d.sill + fw)} width={T * S + 10} height={fw * S} fill="#e6d3b0" stroke={ink} />}
    <rect x={x0 + T * S / 2 - 1.5} y={fy(top - fw)} width="3" height={(d.h - fw - (win ? fw : 0)) * S} fill={win ? '#cfe9f0' : '#c8a272'} stroke={ink} strokeWidth="0.8" />
    <path d={`M${pad - 6} ${fy(0)}H${W - pad - 18}`} stroke={ink} strokeWidth="2" />
    <g stroke={ink} strokeWidth="0.8" fontSize="9" fill={ink}><path d={`M${x0 + T * S + 14} ${fy(d.sill)}V${fy(top)}M${x0 + T * S + 10} ${fy(d.sill)}H${x0 + T * S + 18}M${x0 + T * S + 10} ${fy(top)}H${x0 + T * S + 18}`} />
      <text x={x0 + T * S + 22} y={(fy(d.sill) + fy(top)) / 2 + 3} stroke="none">{Math.round(d.h * 1000)}</text>
      {d.sill > 0 && <text x={x0 + T * S + 22} y={fy(d.sill / 2) + 3} stroke="none">{Math.round(d.sill * 1000)}</text>}
      <text x={x0 + T * S + 22} y={fy(H) + 8} stroke="none">{Math.round(H * 1000)}</text></g>
  </svg>
}
/** Mặt cắt cấu tạo lớp của tường */
export function WallLayerSection({ type, finishColor }: { type: WallType; finishColor?: string }) {
  const S = 360 / Math.max(type.t, 0.1) / 1.6, H = 60, W = type.t * S + 150; let x = 6
  return <svg viewBox={`0 0 ${W} ${H + 50}`} style={{ width: '100%', background: '#fff', border: '1px solid #ddd' }}><Defs />
    {type.layers.map((l, i) => { const w = Math.max(l.t * S, 2), el = <g key={i}><rect x={x} y={8} width={w} height={H} fill={`url(#h-${l.hatch})`} stroke={ink} strokeWidth="1" />
      <path d={`M${x + w / 2} ${H + 8}v${10 + (i % 2) * 14}`} stroke="#555" strokeWidth="0.6" /><text x={x + w / 2} y={H + 30 + (i % 2) * 14} fontSize="8.5" textAnchor={i < type.layers.length / 2 ? 'start' : 'end'} fill="#222">{l.name} · {Math.round(l.t * 1000)}</text></g>; x += w; return el })}
    {finishColor && <rect x={2} y={8} width={4} height={H} fill={finishColor} stroke={ink} strokeWidth="0.6" />}
    <g stroke={ink} strokeWidth="0.8"><path d={`M6 ${H + 46}H${x}M6 ${H + 42}v8M${x} ${H + 42}v8`} /><text x={(6 + x) / 2} y={H + 44} fontSize="9" textAnchor="middle" stroke="none" fill={ink}>{Math.round(type.t * 1000)} mm</text></g>
  </svg>
}

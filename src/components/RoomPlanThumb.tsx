import type { RoomPlan } from '../lib/roomPlan'

/** Ảnh mặt bằng cắt quanh phòng, vùng phòng tô đỏ. ctx = lấy rộng hơn để thấy khu vực xung quanh. */
export default function RoomPlanThumb({ p, ctx, w = 120, h = 80, onClick }: { p: RoomPlan; ctx?: boolean; w?: number | string; h?: number | string; onClick?: () => void }) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const pl of p.polys) for (const q of pl) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]) }
  const pw = (x1 - x0) * p.W, ph = (y1 - y0) * p.H, pad = Math.max(pw, ph) * (ctx ? 1.2 : 0.35) + 20
  const vx = x0 * p.W - pad, vy = y0 * p.H - pad, vw = pw + 2 * pad, vh = ph + 2 * pad
  return <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" style={{ width: w, height: h, background: '#fff', border: '1px solid var(--line)', cursor: onClick ? 'zoom-in' : undefined }} onClick={onClick}>
    <image href={p.url} x={0} y={0} width={p.W} height={p.H} />
    {p.polys.map((pl, i) => <polygon key={i} points={pl.map(q => `${q[0] * p.W},${q[1] * p.H}`).join(' ')} fill="rgba(229,57,53,.28)" stroke="#e53935" strokeWidth={Math.max(vw, vh) / 150} />)}
  </svg>
}

import { clampBox, contextRegion, arrowGeom } from '../lib/crop'

/** Hiển thị vùng crop RỘNG (có bối cảnh xung quanh) kèm khung + mũi tên đỏ chỉ vào đối tượng – bằng CSS/SVG, không tạo ảnh mới */
export default function Crop({ url, bbox, pageW, pageH, height = 90, maxWidth = 200, onClick, active, arrow = true }: {
  url?: string; bbox?: number[] | null; pageW?: number | null; pageH?: number | null; height?: number; maxWidth?: number; onClick?: () => void; active?: boolean; arrow?: boolean
}) {
  if (!url || !bbox) return <div className="crop empty" style={{ height, width: height * 1.2 }} onClick={onClick}>không có ảnh</div>
  clampBox(bbox)
  const { rx, ry, rw, rh } = contextRegion(bbox)
  const W = pageW ?? 1600, H = pageH ?? 1000
  let ch = height, cw = (rw * W) / (rh * H) * ch
  if (cw > maxWidth) { cw = maxWidth; ch = cw * (rh * H) / (rw * W) }
  const a = arrowGeom(bbox)
  const lw = Math.max(1.5, Math.max(cw, ch) / 70)
  const hl = lw * 5, hw = lw * 3
  const x1 = a.tail.x * cw, y1 = a.tail.y * ch, x2 = a.tip.x * cw, y2 = a.tip.y * ch
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const head = `${x2},${y2} ${x2 - Math.cos(ang) * hl + Math.sin(ang) * hw},${y2 - Math.sin(ang) * hl - Math.cos(ang) * hw} ${x2 - Math.cos(ang) * hl - Math.sin(ang) * hw},${y2 - Math.sin(ang) * hl + Math.cos(ang) * hw}`
  return (
    <div className={'crop' + (active ? ' active' : '')} onClick={onClick} style={{
      width: cw, height: ch, backgroundImage: `url("${url}")`, position: 'relative',
      backgroundSize: `${100 / rw}% ${100 / rh}%`,
      backgroundPosition: `${rw >= 1 ? 0 : (rx / (1 - rw)) * 100}% ${rh >= 1 ? 0 : (ry / (1 - rh)) * 100}%`,
    }}>
      {arrow && <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <rect x={a.box.x * cw} y={a.box.y * ch} width={a.box.w * cw} height={a.box.h * ch} fill="none" stroke="#e11d1d" strokeWidth={lw * 0.7} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={lw * 2.2} strokeLinecap="round" />
        <polygon points={head} fill="#fff" stroke="#fff" strokeWidth={lw} strokeLinejoin="round" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e11d1d" strokeWidth={lw} strokeLinecap="round" />
        <polygon points={head} fill="#e11d1d" />
      </svg>}
    </div>
  )
}

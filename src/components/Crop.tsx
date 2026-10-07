import { clampBox } from '../lib/crop'

/** Hiển thị vùng crop bằng CSS (không cần tạo ảnh mới) */
export default function Crop({ url, bbox, pageW, pageH, height = 90, maxWidth = 180, onClick, active }: {
  url?: string; bbox?: number[] | null; pageW?: number | null; pageH?: number | null; height?: number; maxWidth?: number; onClick?: () => void; active?: boolean
}) {
  if (!url || !bbox) return <div className="crop empty" style={{ height, width: height * 1.2 }} onClick={onClick}>không có ảnh</div>
  const [x, y, w, h] = clampBox(bbox)
  const W = pageW ?? 1600, H = pageH ?? 1000
  let ch = height, cw = (w * W) / (h * H) * ch
  if (cw > maxWidth) { cw = maxWidth; ch = cw * (h * H) / (w * W) }
  return (
    <div className={'crop' + (active ? ' active' : '')} onClick={onClick} style={{
      width: cw, height: ch, backgroundImage: `url("${url}")`,
      backgroundSize: `${100 / w}% ${100 / h}%`,
      backgroundPosition: `${w >= 1 ? 0 : (x / (1 - w)) * 100}% ${h >= 1 ? 0 : (y / (1 - h)) * 100}%`,
    }} />
  )
}

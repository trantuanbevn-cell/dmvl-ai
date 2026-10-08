import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampBox, contextRegion, viewGeom, type CropViewT } from '../lib/crop'

/** Hiển thị vùng crop RỘNG (có bối cảnh xung quanh) kèm khung + mũi tên đỏ chỉ vào đối tượng – bằng CSS/SVG, không tạo ảnh mới.
 *  view: phần người dùng đã chỉnh tay (vùng cắt / mũi tên); replUrl: ảnh thay thế do người dùng tải lên */
type P = { url?: string; bbox?: number[] | null; pageW?: number | null; pageH?: number | null; height?: number; maxWidth?: number; onClick?: () => void; active?: boolean; arrow?: boolean; view?: CropViewT | null; replUrl?: string; onEdit?: () => void }
function CropView({ url, bbox, pageW, pageH, height = 90, maxWidth = 200, onClick, active, arrow = true, view, replUrl, onDouble }: P & { onDouble?: () => void }) {
  if ((!url && !(view?.img && replUrl)) || !bbox) return <div className="crop empty" style={{ height, width: height * 1.2 }} onClick={onClick}>không có ảnh</div>
  clampBox(bbox)
  const def = contextRegion(bbox)
  const W = pageW ?? 1600, H = pageH ?? 1000
  // khung hiển thị: theo vùng cắt (mặc định hoặc đã chỉnh); ảnh thay thế dùng khung mặc định để giữ bố cục bảng
  const G = viewGeom(bbox, view?.img && replUrl ? null : view)
  const sizeReg = view?.img && replUrl ? def : G
  let ch = height, cw = (sizeReg.rw * W) / (sizeReg.rh * H) * ch
  if (cw > maxWidth) { cw = maxWidth; ch = cw * (sizeReg.rh * H) / (sizeReg.rw * W) }
  if (view?.img && replUrl) return (
    <div className={'crop repl' + (active ? ' active' : '')} onClick={onClick} onDoubleClick={onDouble} title={onDouble ? 'Kích đúp để phóng to' : undefined}
      style={{ width: cw, height: ch, backgroundImage: `url("${replUrl}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundColor: '#f3ede6' }} />)
  const { rx, ry, rw, rh } = G
  const lw = Math.max(1.5, Math.max(cw, ch) / 70)
  const hl = lw * 5, hw = lw * 3
  const x1 = G.tail.x * cw, y1 = G.tail.y * ch, x2 = G.tip.x * cw, y2 = G.tip.y * ch
  const ang = Math.atan2(y2 - y1, x2 - x1)
  const head = `${x2},${y2} ${x2 - Math.cos(ang) * hl + Math.sin(ang) * hw},${y2 - Math.sin(ang) * hl - Math.cos(ang) * hw} ${x2 - Math.cos(ang) * hl - Math.sin(ang) * hw},${y2 - Math.sin(ang) * hl + Math.cos(ang) * hw}`
  return (
    <div className={'crop' + (active ? ' active' : '')} onClick={onClick} onDoubleClick={onDouble} title={onDouble ? 'Kích đúp để phóng to' : undefined} style={{
      width: cw, height: ch, backgroundImage: `url("${url}")`, position: 'relative',
      backgroundSize: `${100 / rw}% ${100 / rh}%`,
      backgroundPosition: `${rw >= 1 ? 0 : (rx / (1 - rw)) * 100}% ${rh >= 1 ? 0 : (ry / (1 - rh)) * 100}%`,
    }}>
      {arrow && !G.hide && <svg width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <rect x={G.box.x * cw} y={G.box.y * ch} width={G.box.w * cw} height={G.box.h * ch} fill="none" stroke="#e11d1d" strokeWidth={lw * 0.7} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={lw * 2.2} strokeLinecap="round" />
        <polygon points={head} fill="#fff" stroke="#fff" strokeWidth={lw} strokeLinejoin="round" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e11d1d" strokeWidth={lw} strokeLinecap="round" />
        <polygon points={head} fill="#e11d1d" />
      </svg>}
    </div>
  )
}
export { CropView }

/** Kích đúp ảnh crop → phóng to giữa màn hình (có chuyển sang xem toàn trang). Esc hoặc bấm ra ngoài để đóng */
function Lightbox({ url, bbox, pageW, pageH, view, replUrl, onEdit, onClose }: P & { onClose: () => void }) {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const [x, y, w, h] = clampBox(bbox!)
  return createPortal(
    <div className="lightbox" onMouseDown={onClose}>
      <div className="lb-bar" onMouseDown={e => e.stopPropagation()}>
        <button className={'chip' + (!full ? ' on' : '')} onClick={() => setFull(false)}>Vùng quanh vật liệu</button>
        <button className={'chip' + (full ? ' on' : '')} onClick={() => setFull(true)}>Toàn trang</button>
        {onEdit && <button className="chip" onClick={() => { onClose(); onEdit() }}>✎ Chỉnh sửa ảnh</button>}
        <button className="chip" onClick={onClose}>✕ Đóng (Esc)</button>
      </div>
      <div className="lb-body" onMouseDown={e => e.stopPropagation()}>
        {!full
          ? <CropView url={url} bbox={bbox} pageW={pageW} pageH={pageH} view={view} replUrl={replUrl} height={Math.round(window.innerHeight * 0.82)} maxWidth={Math.round(window.innerWidth * 0.94)} />
          : <div className="lb-full"><img src={url} alt="" draggable={false} /><svg viewBox="0 0 1 1" preserveAspectRatio="none"><rect x={x} y={y} width={w} height={h} fill="none" stroke="#e11d1d" strokeWidth={3} vectorEffect="non-scaling-stroke" /></svg></div>}
      </div>
    </div>, document.body)
}

export default function Crop(p: P) {
  const [open, setOpen] = useState(false)
  const can = (!!p.url || !!(p.view?.img && p.replUrl)) && !!p.bbox
  return <>
    <CropView {...p} onDouble={can ? () => setOpen(true) : undefined} />
    {open && can && <Lightbox {...p} url={p.url} onClose={() => setOpen(false)} />}
  </>
}

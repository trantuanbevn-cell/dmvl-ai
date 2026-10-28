import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectData } from '../lib/useProject'
import { roomPages, roomRect, rectBg } from '../lib/roomPages'

/** Phòng đã gán vị trí nhưng chưa khoanh vật liệu: hiện ảnh phối cảnh của phòng (không mũi tên).
 *  Bấm 1 lần / nút ✎ → mở công cụ khoanh tay; kích đúp → phóng to xem cả trang */
export default function RoomShotFallback({ d, roomId, height = 64, width = 90, onClick }: { d: ProjectData; roomId: string; height?: number; width?: number; onClick?: () => void }) {
  const [zoom, setZoom] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const room = d.rooms.find(r => r.id === roomId)
  const pgs = roomPages(d.pages, roomId)
  const pg = pgs.find(p => p.kind === 'render') ?? pgs[0]
  const url = pg ? d.urls[pg.thumb_path ?? pg.image_path] : undefined
  const bigUrl = pg ? d.urls[pg.image_path] ?? url : undefined
  const rect = pg ? roomRect(pg, roomId) : null
  const style = url ? (rect ? rectBg(url, pg!, rect, width / height) : { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }) : {}
  useEffect(() => {
    if (!zoom) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [zoom])
  const single = (ev: React.MouseEvent) => { ev.stopPropagation(); if (!onClick) return; window.clearTimeout(timer.current); timer.current = window.setTimeout(onClick, 260) }
  const dbl = (ev: React.MouseEvent) => { ev.stopPropagation(); window.clearTimeout(timer.current); if (bigUrl) setZoom(true) }
  return <span className="shot-wrap" title={url ? 'Chưa khoanh vật liệu – kích đúp để phóng to, bấm ✎ để khoanh tay' : 'Phòng này chưa có ảnh phối cảnh'} onClick={single} onDoubleClick={dbl} style={{ cursor: url ? 'zoom-in' : 'default' }}>
    <span className="crop" style={{ display: 'inline-block', width, height, opacity: url ? 0.85 : 1, background: url ? undefined : '#eee', ...style }}>{!url && <span className="small muted" style={{ fontSize: 10 }}>chưa có ảnh</span>}</span>
    <div className="shot-cap">{room?.code} · chưa khoanh{onClick ? ' ✎' : ''}</div>
    {zoom && bigUrl && createPortal(
      <div className="lightbox" onMouseDown={() => setZoom(false)}>
        <div className="lb-bar" onMouseDown={e => e.stopPropagation()}>
          {onClick && <button className="chip on" onClick={() => { setZoom(false); onClick() }}>✎ Khoanh tay vật liệu</button>}
          <button className="chip" onClick={() => setZoom(false)}>✕ Đóng (Esc)</button>
        </div>
        <div className="lb-body" onMouseDown={e => e.stopPropagation()}>
          <div className="lb-full"><img loading="lazy" decoding="async" src={bigUrl} alt="" draggable={false} /></div>
        </div>
      </div>, document.body)}
  </span>
}

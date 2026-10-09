import type { ProjectData } from '../lib/useProject'
import { roomPages, roomRect, rectBg } from '../lib/roomPages'

/** Phòng đã gán vị trí nhưng chưa khoanh vật liệu: hiện ảnh phối cảnh của phòng (không mũi tên) để vẫn thấy được phòng nào – bấm để khoanh */
export default function RoomShotFallback({ d, roomId, height = 64, width = 90, onClick }: { d: ProjectData; roomId: string; height?: number; width?: number; onClick?: () => void }) {
  const room = d.rooms.find(r => r.id === roomId)
  const pgs = roomPages(d.pages, roomId)
  const pg = pgs.find(p => p.kind === 'render') ?? pgs[0]
  const url = pg ? d.urls[pg.thumb_path ?? pg.image_path] : undefined
  const rect = pg ? roomRect(pg, roomId) : null
  const style = url ? (rect ? rectBg(url, pg!, rect, width / height) : { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }) : {}
  return <span className="shot-wrap" title={url ? 'Chưa khoanh vật liệu trong phòng này – bấm để khoanh' : 'Phòng này chưa có ảnh phối cảnh'} onClick={ev => { ev.stopPropagation(); onClick?.() }} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    <span className="crop" style={{ display: 'inline-block', width, height, opacity: url ? 0.85 : 1, background: url ? undefined : '#eee', ...style }}>{!url && <span className="small muted" style={{ fontSize: 10 }}>chưa có ảnh</span>}</span>
    <div className="shot-cap">{room?.code} · chưa khoanh{onClick ? ' ✎' : ''}</div>
  </span>
}

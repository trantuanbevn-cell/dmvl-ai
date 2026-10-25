// Cửa sổ CROP KHÔNG GIAN isometric của từng phòng + cột vật liệu (từ danh mục) có đường dẫn chú thích. Xuất SVG / PNG.
import { useEffect, useMemo, useState } from 'react'
import type { Model } from '../lib/plan3d/model'
import { renderRoomIso, type IsoResult } from '../lib/plan3d/roomIso'
import type { MatFor } from '../lib/plan3d/section'

const INK = '#2b2723'
export default function RoomIsoView({ model, roomId, onPick, onClose, mat }: { model: Model; roomId: string; onPick: (id: string) => void; onClose: () => void; mat?: MatFor }) {
  const rooms = model.rooms ?? []
  const room = rooms.find(r => r.id === roomId) ?? rooms[0]
  const [az, setAz] = useState(0), [res, setRes] = useState<IsoResult | null>(null), [err, setErr] = useState('')
  useEffect(() => {
    if (!room) return
    const t = setTimeout(() => { try { setRes(renderRoomIso(model, room, az, mat)); setErr('') } catch (e) { setErr('Không dựng được 3D: ' + (e as Error).message) } }, 30)
    return () => clearTimeout(t)
  }, [model, room?.id, az, mat]) // eslint-disable-line
  const colW = 360, W = res?.w ?? 1000, H = res?.h ?? 720
  const rowH = useMemo(() => Math.min(86, (H - 40) / Math.max(1, res?.labels.length ?? 1)), [res, H])
  const svgId = 'room-iso-svg'
  const svgText = () => { const e = document.getElementById(svgId) as SVGSVGElement | null; if (!e) return ''; const c = e.cloneNode(true) as SVGSVGElement; c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink'); return new XMLSerializer().serializeToString(c) }
  const dl = (name: string, blob: Blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) }
  const exportSvg = () => dl(`crop-${room?.name ?? 'phong'}.svg`, new Blob([svgText()], { type: 'image/svg+xml' }))
  const exportPng = () => { const img = new Image(), w = W + colW; img.onload = () => { const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = H * 2; const g = cv.getContext('2d')!; g.fillStyle = '#f4efe6'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height); cv.toBlob(b => b && dl(`crop-${room?.name ?? 'phong'}.png`, b), 'image/png') }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText()) }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ width: 'min(1500px,97vw)', maxHeight: '94vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>🧊 Crop không gian (isometric)</h3>
          <div className="row gap" style={{ flexWrap: 'wrap' }}>
            <select value={room?.id ?? ''} onChange={e => onPick(e.target.value)}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name || 'Phòng không tên'}</option>)}</select>
            <button className="btn sm" title="Xoay sang góc nhìn kế tiếp" onClick={() => setAz(a => (a + 1) % 4)}>⟳ Xoay góc nhìn ({az + 1}/4)</button>
            <button className="btn sm" disabled={!res} onClick={exportSvg}>⬇ SVG</button><button className="btn sm" disabled={!res} onClick={exportPng}>⬇ PNG</button>
            <button className="btn ghost sm" onClick={onClose}>✕</button>
          </div>
        </div>
        <p className="small muted" style={{ margin: '4px 0' }}>Tường phía người nhìn được hạ thấp để thấy bên trong. Vật liệu sàn / tường lấy từ danh mục của phòng cùng tên (số xanh); chưa có thì dùng thư viện (số đen).</p>
        {err && <div style={{ color: '#b00020' }}>{err}</div>}
        {!rooms.length && <div className="muted">Chưa có phòng nào trên mặt bằng. Vẽ sàn / bấm vào trong phòng trước.</div>}
        {res && <svg id={svgId} viewBox={`0 0 ${W + colW} ${H}`} style={{ width: '100%', background: '#f4efe6', border: '1px solid #d9d2c4' }} fontFamily="system-ui,Arial,sans-serif">
          <rect width={W + colW} height={H} fill="#f4efe6" />
          <image href={res.url} xlinkHref={res.url} x={0} y={0} width={W} height={H} />
          <text x={24} y={H - 24} fontSize={26} fontWeight={700} fill={INK}>{room?.name || 'Phòng'}{room?.area ? '' : ''}</text>
          {res.labels.map((l, i) => {
            const ry = 30 + i * rowH + rowH / 2, c = l.src === 'catalog' ? '#2f7a4d' : INK
            return <g key={l.n}>
              <polyline points={`${l.x},${l.y} ${W + 10},${ry}`} fill="none" stroke={c} strokeWidth={1.4} />
              <circle cx={l.x} cy={l.y} r={5} fill={c} />
              <rect x={W + 14} y={ry - 20} width={40} height={40} fill={l.color} stroke="#555" />
              <text x={W + 66} y={ry - 4} fontSize={16} fill={INK} fontWeight={700}>{l.n}. {l.name.slice(0, 34)}</text>
              <text x={W + 66} y={ry + 14} fontSize={13} fill={c}>{l.src === 'catalog' ? 'Danh mục' + (l.code ? ' · ' + l.code : '') : 'Thư viện'}{l.note ? ' · ' + l.note.slice(0, 40) : ''}</text>
            </g>
          })}
        </svg>}
        {!res && !err && rooms.length > 0 && <div className="muted" style={{ padding: 30 }}>Đang dựng…</div>}
      </div>
    </div>)
}

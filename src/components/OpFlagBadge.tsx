import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectData } from '../lib/useProject'
import { flagsFor, LUX_DEFAULT } from '../lib/opFlags'

/** Nút đỏ ⚠ "vận hành yêu cầu sửa": bấm xem góp ý của vận hành + tiêu chuẩn Westin (kể cả lux) + nội dung cần sửa. Chỉ hiện trong ứng dụng, không xuất file. */
export default function OpFlagBadge({ d, entryId }: { d: ProjectData; entryId: string }) {
  const [open, setOpen] = useState(false)
  const e = d.entries.find(x => x.id === entryId); if (!e) return null
  const hits = flagsFor(d, e); if (!hits.length) return null
  const need = hits.some(h => h.flag.flip)
  return (<>
    <button className="opflag-btn" onClick={ev => { ev.stopPropagation(); setOpen(true) }} title="Vận hành có góp ý cần sửa cho vật liệu này – bấm để xem">
      🔴 {need ? 'Vận hành yêu cầu sửa' : 'Lưu ý của vận hành'} ({hits.length})
    </button>
    {open && createPortal(
      <div className="modal-bg center" onMouseDown={() => setOpen(false)}>
        <div className="modal" style={{ width: 'min(820px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={ev => ev.stopPropagation()}>
          <div className="row between"><h3 style={{ margin: 0, color: '#b3261e' }}>🔴 {e.name_vn} – vận hành yêu cầu</h3><button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button></div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>Góp ý của đơn vị vận hành + đối chiếu Westin Design Standards. Người làm đọc, sửa vật liệu theo mục “Cần sửa”, rồi bấm <b>Duyệt</b> (xanh) để tắt cảnh báo. Không đưa vào file xuất.</p>
          {hits.map(({ flag, rooms, lux }) => (
            <div key={flag.id} className="oprule-card">
              <div><b>{flag.title}</b>{!flag.flip && <span className="small muted"> · chỉ nhắc, không đổi trạng thái</span>}</div>
              <div className="oprule-lab">Yêu cầu của vận hành</div>
              <div className="oprule-txt">{flag.op}</div>
              {flag.std && <><div className="oprule-lab">Tiêu chuẩn Westin</div><div className="oprule-txt">{flag.std}</div></>}
              {rooms.length > 0 && <div className="small" style={{ margin: '4px 0' }}>Phòng liên quan: {rooms.map(r => r.name_vn).join('; ')}</div>}
              {flag.id === 'lux' && <>
                <div className="oprule-lab">Độ rọi theo phòng của vật liệu này (15C.12)</div>
                {lux.length ? lux.map(l => <div key={l.space} className="oprule-txt"><b>{l.space}</b> ({l.page}): {l.lux}. CCT {l.cct}, CRI ≥ {l.cri}.</div>) : <div className="oprule-txt">{LUX_DEFAULT}</div>}
              </>}
              <div className="oprule-lab" style={{ color: '#b3261e' }}>Cần sửa</div>
              <div className="oprule-txt"><b>{flag.fix}</b></div>
            </div>))}
        </div>
      </div>, document.body)}
  </>)
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectData } from '../lib/useProject'
import { rulesFor, EL_VN } from '../lib/opRules'

/** Nhắc quy định vận hành (Marriott…) áp cho vật liệu này – chỉ hiện trong ứng dụng, không đưa vào file xuất */
export default function OpRuleBadge({ d, entryId, compact }: { d: ProjectData; entryId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const hits = rulesFor(d, entryId)
  if (!hits.length) return null
  return (<>
    <button className="oprule-btn" onClick={ev => { ev.stopPropagation(); setOpen(true) }} title="Có quy định vận hành của chủ đầu tư/thương hiệu cho hạng mục này – bấm để xem">
      ⚠ Có quy định vận hành{compact ? '' : ` (${hits.length})`}{!compact && <span className="oprule-sub"> – bấm để xem EN/VN</span>}
    </button>
    {open && createPortal(
      <div className="modal-bg center" onMouseDown={() => setOpen(false)}>
        <div className="modal" style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
          <div className="row between"><h3 style={{ margin: 0, color: '#b3261e' }}>⚠ Quy định vận hành áp dụng cho hạng mục này</h3><button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button></div>
          <p className="small muted" style={{ margin: '4px 0 8px' }}>Chỉ để nhắc người làm đối chiếu – không đưa vào file xuất. Nếu vật liệu đang chọn khác với quy định, hãy sửa lại hoặc báo quản lý dự án.</p>
          {hits.map(({ rule, rooms, els }) => (
            <div key={rule.id} className="oprule-card">
              <div><b>{rule.title_vn}</b></div>
              <div className="small muted">{rule.title_en}</div>
              <div className="small" style={{ margin: '4px 0' }}>Áp dụng: {els.map(x => EL_VN[x] ?? x).join(', ')} · {rooms.map(r => `${r.code} ${r.name_vn}`).join('; ')}</div>
              <div className="oprule-lab">English (nguyên văn)</div>
              <div className="oprule-txt en">{rule.body_en}</div>
              <div className="oprule-lab">Tiếng Việt</div>
              <div className="oprule-txt">{rule.body_vn}</div>
              {rule.source && <div className="small muted">Nguồn: {rule.source}</div>}
            </div>))}
        </div>
      </div>, document.body)}
  </>)
}

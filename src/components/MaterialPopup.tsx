import { useEffect, useState } from 'react'
import RoomSections from './RoomSections'
import { supabase } from '../lib/supabase'
import { syncLibrary } from '../lib/matLibrary'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Lang } from '../lib/sections'

/** Bảng vật liệu phóng to ở giữa màn hình: đúng một dòng của "Theo vật liệu" (đủ thông tin, ảnh phối cảnh, vị trí các phòng) – để đối chiếu trực quan vị trí khoanh với vật liệu */
export default function MaterialPopup({ d, entryId, lang: l0, onClose, onDetail }: { d: ProjectData; entryId: string; lang: Lang; onClose: () => void; onDetail: (id: string) => void }) {
  const { canEdit } = useAuth()
  const [lang, setLang] = useState<Lang>(l0)
  const e = d.entries.find(x => x.id === entryId)
  useEffect(() => { const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  if (!e) return null
  const setStatus = async (status: 'approved' | 'review') => { await supabase.from('entries').update({ status }).eq('id', e.id); if (status === 'approved') syncLibrary(e.project_id, [{ ...e, status }]); d.reload() }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal dup-modal" style={{ width: 'min(1250px, 96vw)', padding: 14 }} onMouseDown={ev => ev.stopPropagation()}>
        <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{e.code} · {e.name_vn}</b>
            {([['vn', 'Tiếng Việt'], ['en', 'English'], ['both', 'Song ngữ']] as const).map(([k, l]) => <button key={k} className={'chip' + (lang === k ? ' on' : '')} onClick={() => setLang(k)}>{l}</button>)}
          </div>
          <div className="row gap sm-gap">
            {canEdit && e.status !== 'approved' && <button className="btn sm" onClick={() => setStatus('approved')} title="Vật liệu ở vị trí này đúng → duyệt">✓ Đúng – duyệt</button>}
            {canEdit && e.status === 'approved' && <button className="btn sm" onClick={() => setStatus('review')} title="Đánh dấu cần xem lại">⚠ Cần xem lại</button>}
            <button className="btn ghost sm" onClick={() => onDetail(e.id)}>Khung chỉnh chi tiết</button>
            <button className="btn sm" onClick={onClose}>✕ Đóng</button>
          </div>
        </div>
        <RoomSections d={d} room={null} lang={lang} filter="all" sel={null} entryId={entryId} onPick={() => {}} onDetail={onDetail} onRemove={() => {}} onAdd={() => {}} />
      </div>
    </div>
  )
}

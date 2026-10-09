import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { sectionOf, bandKeys, bandTitle, sectionTitle, bandSections, addBand, removeBand, mergeBand, splitBand, moveBand, moveSection, setSectionLayout, type SectionLayout } from '../lib/sections'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

/** Lưu bố cục nhóm của dự án (chỉ đổi cách sắp xếp – không đụng tới nội dung vật liệu) */
export async function saveLayout(d: ProjectData, l: SectionLayout | null) {
  if (!d.project) return
  setSectionLayout(l)   // thấy ngay, không chờ tải lại
  const { error } = await supabase.from('projects').update({ section_layout: l }).eq('id', d.project.id)
  if (error) { alert(error.message); return }
  await d.reload()
}

/** Tạo / tách / gộp / sắp xếp các NHÓM LỚN (A, B, C…) và chuyển mục giữa các nhóm */
export default function BandManager({ d, onClose }: { d: ProjectData; onClose: () => void }) {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const have = new Set(live.map(e => sectionOf(e).key))
  const [pick, setPick] = useState<Record<string, string[]>>({})
  const [nm, setNm] = useState<Record<string, { vn: string; en: string }>>({})
  const [newVn, setNewVn] = useState(''), [newEn, setNewEn] = useState('')
  const keys = bandKeys()
  const visible = (b: string) => bandSections(b).filter(s => s.custom || have.has(s.key))
  const run = async (l: SectionLayout, msg: string) => { await saveLayout(d, l); toast(msg, 'ok') }
  const toggle = (b: string, k: string) => setPick(p => ({ ...p, [b]: (p[b] ?? []).includes(k) ? (p[b] ?? []).filter(x => x !== k) : [...(p[b] ?? []), k] }))
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 820, maxHeight: '88vh', overflow: 'auto' }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>⇅ Quản lý nhóm lớn</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted">Tạo, tách, gộp, đổi chỗ các nhóm lớn và chuyển mục vật liệu giữa các nhóm. Đây chỉ là cách <b>sắp xếp để trình bày và xuất file</b> – nội dung từng vật liệu, mã, ảnh, phòng không thay đổi. Chữ cái A, B, C… tự đánh lại theo thứ tự.</p>
        <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <input data-lang="name" placeholder="Tên nhóm lớn mới (Việt), vd: THIẾT BỊ" value={newVn} onChange={e => setNewVn(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <input data-lang="name" placeholder="English (tuỳ chọn)" value={newEn} onChange={e => setNewEn(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          <button className="btn primary sm" disabled={!newVn.trim()} onClick={async () => { await run(addBand(newVn.trim(), newEn.trim()).layout, 'Đã tạo nhóm lớn'); setNewVn(''); setNewEn('') }}>＋ Tạo nhóm lớn trống</button>
        </div>
        {keys.map((b, i) => { const secs = visible(b), sp = pick[b] ?? [], t = nm[b] ?? { vn: '', en: '' }; return (
          <div key={b} className="band-card">
            <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}>
              <b>{bandTitle(b, 'vn')}</b>
              <span className="row gap">
                <button className="btn ghost sm" disabled={i === 0} onClick={() => run(moveBand(b, -1), 'Đã đổi chỗ')} title="Lên">▲</button>
                <button className="btn ghost sm" disabled={i === keys.length - 1} onClick={() => run(moveBand(b, 1), 'Đã đổi chỗ')} title="Xuống">▼</button>
                {keys.length > 1 && <select value="" onChange={async e => { const to = e.target.value; if (to && confirm(`Gộp “${bandTitle(b, 'vn')}” vào “${bandTitle(to, 'vn')}”?`)) await run(mergeBand(b, to), 'Đã gộp nhóm lớn') }}><option value="">Gộp vào…</option>{keys.filter(k => k !== b).map(k => <option key={k} value={k}>{bandTitle(k, 'vn')}</option>)}</select>}
                {bandSections(b).length === 0 && keys.length > 1 && <button className="btn ghost sm danger" onClick={() => run(removeBand(b), 'Đã xoá nhóm lớn trống')}>Xoá</button>}
              </span>
            </div>
            <div className="band-secs">{secs.length ? secs.map(s => (
              <label key={s.key} className="chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={sp.includes(s.key)} onChange={() => toggle(b, s.key)} /> {sectionTitle(s, 'vn')}
                {keys.length > 1 && <select value="" onClick={e => e.stopPropagation()} onChange={async e => { const to = e.target.value; if (to) await run(moveSection(s.key, to), 'Đã chuyển mục') }} style={{ marginLeft: 4 }}><option value="">→</option>{keys.filter(k => k !== b).map(k => <option key={k} value={k}>{bandTitle(k, 'vn').slice(0, 40)}</option>)}</select>}</label>
            )) : <span className="muted small">Nhóm trống – kéo thả hoặc chuyển mục vào đây.</span>}</div>
            {secs.length > 1 && <div className="row gap" style={{ flexWrap: 'wrap', marginTop: 6 }}>
              <span className="small muted">Tách {sp.length ? <b>{sp.length} mục đã tick</b> : 'các mục đã tick'} thành nhóm lớn mới:</span>
              <input data-lang="name" placeholder="Tên (Việt)" value={t.vn} onChange={e => setNm(p => ({ ...p, [b]: { ...t, vn: e.target.value } }))} style={{ width: 180 }} />
              <input data-lang="name" placeholder="English (tuỳ chọn)" value={t.en} onChange={e => setNm(p => ({ ...p, [b]: { ...t, en: e.target.value } }))} style={{ width: 160 }} />
              <button className="btn sm primary" disabled={!sp.length || sp.length >= secs.length || !t.vn.trim()} onClick={async () => { await run(splitBand(b, sp, t.vn.trim(), t.en.trim()).layout, 'Đã tách nhóm lớn'); setPick(p => ({ ...p, [b]: [] })); setNm(p => ({ ...p, [b]: { vn: '', en: '' } })) }}>Tách</button>
            </div>}
          </div>) })}
        <div className="row gap" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button className="btn danger sm" onClick={async () => { if (confirm('Đưa các nhóm lớn về mặc định (A–D) và bỏ mọi thay đổi vị trí mục? Nội dung vật liệu không đổi.')) { await saveLayout(d, null); toast('Đã khôi phục mặc định') } }}>Khôi phục mặc định</button>
          <button className="btn primary" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>)
}

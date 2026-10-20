import { useMemo, useState } from 'react'
import { CATEGORIES } from '../lib/codes'
import { allGroups, groupBySection, sectionTitle } from '../lib/sections'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'

/** Chọn vật liệu CÓ SẴN trong danh mục để gán cho vùng vừa khoanh trên ảnh phối cảnh. */
export default function AssignBox({ d, roomId, symLabel, onPick, onNew, onClose }: { d: ProjectData; roomId: string; symLabel: (e: Entry) => string; onPick: (e: Entry, category: string) => void; onNew: (group?: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')   // gán vùng này vào hạng mục nào của phòng (sàn, tường…); trống = theo mục gốc của vật liệu
  const [sec, setSec] = useState('')    // lọc theo NHÓM VẬT LIỆU – đúng như tab "Theo vật liệu"
  const [grp, setGrp] = useState('')    // lọc theo mã nhóm con trong nhóm vật liệu
  const inRoom = useMemo(() => new Set(d.occ.filter(o => o.room_id === roomId).map(o => o.entry_id)), [d.occ, roomId])
  const all = useMemo(() => groupBySection(d.entries.filter(e => e.status !== 'rejected')), [d.entries])
  const gName = useMemo(() => new Map(allGroups().map(g => [g.code, g.vn])), [])
  const curSec = all.find(x => x.section.key === sec)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter(x => !sec || x.section.key === sec).map(x => ({ section: x.section, items: x.items.filter(e => (!grp || e.group_code === grp) && (!s || [symLabel(e), e.code, e.name_vn, e.name_en, e.material_vn, e.product_code, e.brand].some(v => String(v ?? '').toLowerCase().includes(s)))) })).filter(x => x.items.length)
  }, [all, q, sec, grp])
  const newGroup = grp || curSec?.items[0]?.group_code
  const newLabel = curSec ? `＋ Thêm vật liệu MỚI vào nhóm “${sectionTitle(curSec.section, 'vn')}” (khác các mã trên)` : '＋ Thêm vật liệu MỚI (chưa có trong danh mục)'
  const total = shown.reduce((n, x) => n + x.items.length, 0)
  return (
    <div className="modal-bg center" style={{ zIndex: 85 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ width: 'min(760px, 96vw)', maxHeight: '88vh' }}>
        <div className="row between"><h3 style={{ margin: 0 }}>Gán vật liệu cho vùng vừa khoanh</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <div className="row gap" style={{ alignItems: 'center' }}><input autoFocus style={{ flex: 1 }} placeholder="Tìm theo ký hiệu, tên, vật liệu, mã, hãng…" value={q} onChange={e => setQ(e.target.value)} /><button className="btn sm primary" style={{ whiteSpace: 'nowrap' }} title="Vật liệu này khác với các mã đã có → tạo mã mới và gán luôn vào vùng vừa khoanh" onClick={() => onNew(newGroup)}>{newLabel}</button></div>
        <div className="chips">
          <button className={'chip' + (!sec ? ' on' : '')} onClick={() => { setSec(''); setGrp('') }}>Tất cả nhóm</button>
          {all.map(x => <button key={x.section.key} className={'chip' + (sec === x.section.key ? ' on' : '')} onClick={() => { setSec(x.section.key); setGrp('') }}>{sectionTitle(x.section, 'vn')} <span className="cnt">{x.items.length}</span></button>)}
        </div>
        {curSec && [...new Set(curSec.items.map(e => e.group_code))].length > 1 && <div className="chips">
          <button className={'chip' + (!grp ? ' on' : '')} onClick={() => setGrp('')}>Cả nhóm</button>
          {[...new Set(curSec.items.map(e => e.group_code))].map(g => <button key={g} className={'chip' + (grp === g ? ' on' : '')} onClick={() => setGrp(g)}>{g} – {gName.get(g) ?? g} <span className="cnt">{curSec.items.filter(e => e.group_code === g).length}</span></button>)}</div>}
        <div className="row gap small" style={{ alignItems: 'center' }}><b>Gán vào hạng mục của phòng:</b>
          <select value={cat} onChange={e => setCat(e.target.value)} title="Vùng khoanh này thuộc sàn / tường / trần… của phòng">
            <option value="">theo mặc định của vật liệu</option>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select>
          <span className="muted">{total} vật liệu</span></div>
        <div style={{ overflow: 'auto', maxHeight: '50vh', border: '1px solid #eee', borderRadius: 8 }}>
          {shown.map(x => <div key={x.section.key}>
            <div className="small" style={{ background: '#f1e8de', fontWeight: 700, padding: '4px 10px', position: 'sticky', top: 0 }}>{sectionTitle(x.section, 'vn')}</div>
            {x.items.map(e => (
              <button key={e.id} className="row gap" style={{ width: '100%', textAlign: 'left', padding: '6px 10px', border: 0, borderBottom: '1px solid #f1ece6', background: 'transparent', cursor: 'pointer', alignItems: 'center' }} onClick={() => onPick(e, cat || e.category || 'decor')}>
                <span style={{ width: 36, height: 36, borderRadius: 6, background: e.color_hex || '#eee', backgroundImage: e.product_image_url ? `url(${e.product_image_url})` : undefined, backgroundSize: 'cover', flex: 'none', border: '1px solid #ddd' }} />
                <span style={{ flex: 1, minWidth: 0 }}><b>{symLabel(e)}</b> {e.name_vn}{inRoom.has(e.id) && <span className="pill" style={{ marginLeft: 6 }}>đã có trong phòng</span>}
                  <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[e.material_vn, e.brand, e.product_code].filter(Boolean).join(' · ')}</div></span>
              </button>))}</div>)}
          {!total && <div className="muted small" style={{ padding: 14 }}>Không thấy vật liệu nào khớp. Bấm “＋ Thêm vật liệu MỚI” để tạo.</div>}
        </div>
        <div className="row between"><span className="small muted">Chọn một vật liệu để gán; phòng sẽ được ghi vào cột “Vị trí” của bảng danh mục.</span><button className="btn sm" onClick={() => onNew(newGroup)}>＋ Vật liệu chưa có trong danh mục…</button></div>
      </div>
    </div>)
}

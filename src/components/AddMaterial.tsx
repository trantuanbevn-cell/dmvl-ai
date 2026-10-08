import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES, GROUPS } from '../lib/codes'
import { addManualEntry, cloneExtra } from '../lib/pipeline'
import { findSimilar } from '../lib/similar'
import type { ProjectData } from '../lib/useProject'
import type { Room } from '../lib/types'

export type AddPreset = { copy?: string; group: string; category: string; name: string; part_vn?: string | null; parent_id?: string | null; hint?: string }

/** Thêm vật liệu/hạng mục mới vào phòng – tự cảnh báo nếu trong dự án đã có mã giống (kể cả do người khác vừa thêm) */
export default function AddMaterial({ d, room, preset, onClose, onDone }: { d: ProjectData; room: Room; preset: AddPreset; onClose: () => void; onDone: (entryId: string) => void }) {
  const [f, setF] = useState({ group: preset.group, category: preset.category, name: preset.name, material: '', color: '', useColor: false })
  const [busy, setBusy] = useState(false)
  const [src, setSrc] = useState<string>(preset.copy ?? '')
  const srcE = d.entries.find(e => e.id === src)
  const sources = useMemo(() => d.entries.filter(e => e.group_code === f.group && e.status !== 'rejected').sort((a, b) => a.code.localeCompare(b.code)), [d.entries, f.group])
  const pickSrc = (id: string) => {
    setSrc(id); const e = d.entries.find(x => x.id === id)
    if (e) setF(v => ({ ...v, name: e.name_vn, material: e.material_vn ?? '', color: e.color_hex ?? v.color, useColor: !!e.color_hex, category: v.category }))
  }
  useEffect(() => { if (preset.copy) pickSrc(preset.copy) }, []) // eslint-disable-line
  const inRoom = useMemo(() => new Set(d.occ.filter(o => o.room_id === room.id).map(o => o.entry_id)), [d.occ, room.id])
  const sims = useMemo(() => findSimilar(d.entries.filter(e => e.id !== src), { group: f.group, name: f.name, material: f.material, color: f.useColor ? f.color : null }), [d.entries, f, src])
  const roomOf = (id: string) => { const rs = [...new Set(d.occ.filter(o => o.entry_id === id && o.room_id).map(o => o.room_id!))]; return rs.map(r => d.rooms.find(x => x.id === r)?.code).filter(Boolean).join(', ') }

  const use = async (id: string) => {
    setBusy(true)
    try {
      if (!inRoom.has(id)) { const { error } = await supabase.from('occurrences').insert({ entry_id: id, room_id: room.id, category: f.category }); if (error) throw new Error(error.message) }
      await d.reload(); onDone(id)
    } catch (e: any) { alert(e.message) }
    setBusy(false)
  }
  const create = async () => {
    if (!f.name.trim()) return
    setBusy(true)
    try {
      const base = srcE ? cloneExtra(srcE) : { part_vn: preset.part_vn ?? null, parent_id: preset.parent_id ?? null }
      const e = await addManualEntry(d.project!, room, f.group, f.name.trim(), f.category, {
        ...base, material_vn: f.material.trim() || undefined, color_hex: f.useColor ? f.color : null,
      })
      await d.reload(); onDone(e.id)
    } catch (e: any) { alert(e.message) }
    setBusy(false)
  }

  return (
    <div className="modal-bg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3>Thêm vật liệu vào {room.code} {room.name_vn}</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        {preset.hint && <p className="small muted">{preset.hint}</p>}
        <div className="grid2">
          <label className="fld">Nhóm<select value={f.group} onChange={e => setF({ ...f, group: e.target.value })}>{GROUPS.map(g => <option key={g.code} value={g.code}>{g.code} – {g.vn}</option>)}</select></label>
          <label className="fld">Bề mặt / mục<select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select></label>
        </div>
        <label className="fld">Sao chép từ vật liệu có sẵn (nhân đôi, chỉ sửa vài nội dung)
          <select value={src} onChange={e => pickSrc(e.target.value)}>
            <option value="">— Tạo mới hoàn toàn —</option>
            {sources.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name_vn}{e.material_vn ? ' – ' + e.material_vn.slice(0, 50) : ''}</option>)}
          </select></label>
        {srcE && <p className="small muted">Sẽ chép thông số kỹ thuật, tính năng, hãng, xuất xứ từ <b>{srcE.code}</b>; không chép mã sản phẩm/link/ảnh mẫu. Hãy sửa tên và màu cho khác đi.</p>}
        <label className="fld">Tên hạng mục / vật liệu<input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="vd: Sơn nước tường nhấn" /></label>
        <label className="fld">Vật liệu / màu / bề mặt<input value={f.material} onChange={e => setF({ ...f, material: e.target.value })} placeholder="vd: màu xanh sage green, mờ" /></label>
        <label className="row gap sm-gap small"><input type="checkbox" checked={f.useColor} onChange={e => setF({ ...f, useColor: e.target.checked, color: f.color || '#888888' })} /> Có màu đại diện
          {f.useColor && <input type="color" value={f.color} onChange={e => setF({ ...f, color: e.target.value })} style={{ padding: 0, width: 36, height: 26 }} />}
          <span className="muted">(giúp so với các mã đã có cùng tông màu)</span></label>

        {sims.length > 0 && (
          <div className="dup-box">
            <div className="dup-title">⚠ Dự án đã có {sims.length} mã giống – nếu đúng là cùng vật liệu thì chọn mã đó, đừng tạo mã mới</div>
            {sims.map(({ entry: e, score, dE, why }) => (
              <div key={e.id} className="dup-row">
                {e.color_hex ? <span className="swatch sm" style={{ background: e.color_hex, height: 34 }} /> : <span className="swatch sm" style={{ background: '#eee', height: 34 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{e.code}</b> {e.name_vn} <span className="small muted">· {Math.round(score * 100)}% giống{dE != null ? ` · ΔE ${dE.toFixed(0)}` : ''}</span>
                  <div className="small muted">{e.material_vn}</div>
                  <div className="small">{why.join(' · ')}{why.length ? ' · ' : ''}đang ở: {roomOf(e.id) || 'chưa gán phòng'}{e.brand ? ` · ${e.brand} ${e.product_code ?? ''}` : ''}</div>
                </div>
                <button className="btn sm primary" disabled={busy} onClick={() => use(e.id)}>{inRoom.has(e.id) ? 'Đã có trong phòng' : 'Dùng mã này'}</button>
              </div>))}
          </div>)}

        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className={'btn' + (sims.length ? '' : ' primary')} disabled={busy || !f.name.trim()} onClick={create}>{sims.length ? 'Không trùng – tạo mã mới' : '+ Tạo mã mới'}</button>
        </div>
      </div>
    </div>
  )
}

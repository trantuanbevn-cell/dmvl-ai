import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { Entry } from '../lib/types'
import { cropsInScope, moveCrops, undoMove, dropCrops, type MoveScope, type MoveRec } from '../lib/cropMove'
import { toast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import AssignBox from './AssignBox'
import AddMaterial from './AddMaterial'

/** Sửa vùng khoanh đang chọn: chuyển/gộp sang vật liệu khác, tách thành vật liệu mới, gỡ vùng – chọn phạm vi (chỉ vùng này / cả phòng / mọi phòng). Có hoàn tác. */
export default function CropActions({ d, occId, symLabel, onChanged }: { d: ProjectData; occId: string; symLabel: (e: Entry) => string; onChanged?: (entryId?: string) => void }) {
  const o = d.occ.find(x => x.id === occId), e = o ? d.entries.find(x => x.id === o.entry_id) : undefined, room = o?.room_id ? d.rooms.find(r => r.id === o.room_id) ?? null : null
  const [scope, setScope] = useState<MoveScope>('one'), [dlg, setDlg] = useState<'pick' | 'new' | null>(null), [busy, setBusy] = useState(false), [rec, setRec] = useState<MoveRec | null>(null)
  if (!o || !e) return null
  const nRoom = cropsInScope(d.occ, o, 'room').length, nAll = cropsInScope(d.occ, o, 'all').length
  const roomsAll = new Set(cropsInScope(d.occ, o, 'all').map(x => x.room_id)).size
  const run = async (fn: () => Promise<MoveRec | void>, goto?: string) => {
    setBusy(true)
    try { const r = await fn(); if (r) { setRec(r); toast(r.label, 'ok') } await d.reload(); onChanged?.(goto) } catch (er: any) { alert(er.message) }
    setBusy(false)
  }
  const guard = (target?: Entry) => {
    const list = cropsInScope(d.occ, o, scope), approved = [e, target].filter(x => x && x.status === 'approved')
    return list.length > 1 || approved.length ? confirm(`${scope === 'one' ? 'Vật liệu đã duyệt – ' : ''}Sẽ ${target ? `chuyển ${list.length} vùng khoanh sang ${target.code}` : `gỡ ${list.length} vùng khoanh`}${scope === 'all' ? ` ở ${roomsAll} phòng` : ''}. Không xoá mã vật liệu nào. Tiếp tục?`) : true
  }
  const move = (t: Entry) => { if (guard(t)) run(() => moveCrops(d.occ, cropsInScope(d.occ, o, scope), t, scope), t.id) }
  return <div className="card" style={{ padding: 8, margin: '8px 0', background: '#fffaf0' }}>
    <div className="small"><b>Vùng đang chọn:</b> {symLabel(e)} {e.name_vn}{room ? ` · ${room.code}` : ''} – nếu crop gom sai vật liệu, sửa tại đây:</div>
    <div className="row gap sm-gap" style={{ flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
      <select value={scope} onChange={ev => setScope(ev.target.value as MoveScope)} title="Phạm vi áp dụng">
        <option value="one">Chỉ vùng này</option>
        {nRoom > 1 && <option value="room">Mọi vùng của vật liệu này trong phòng này ({nRoom})</option>}
        {nAll > nRoom && <option value="all">Mọi vùng của vật liệu này ở TẤT CẢ phòng ({nAll} vùng / {roomsAll} phòng)</option>}
      </select>
      <button className="btn sm" disabled={busy} onClick={() => setDlg('pick')}>⇄ Chuyển / gộp sang vật liệu khác…</button>
      <button className="btn sm" disabled={busy} onClick={() => setDlg('new')}>✂ Tách thành vật liệu mới…</button>
      <button className="btn ghost sm" disabled={busy} onClick={() => guard() && run(async () => { await dropCrops(d.occ, cropsInScope(d.occ, o, scope)) })}>🗑 Gỡ vùng khỏi vật liệu</button>
      {rec && <button className="btn sm primary" disabled={busy} onClick={() => run(async () => { await undoMove(rec); setRec(null); toast('Đã hoàn tác', 'ok') }, rec.moved[0]?.entry_id)}>↶ Hoàn tác thao tác vừa rồi</button>}
    </div>
    {dlg === 'pick' && room && <AssignBox d={d} roomId={room.id} symLabel={symLabel} onClose={() => setDlg(null)} onPick={t => { setDlg(null); move(t) }} onNew={() => setDlg('new')} />}
    {dlg === 'new' && room && <AddMaterial d={d} room={room} preset={{ group: e.group_code, category: e.category ?? 'decor', name: '', hint: `Vật liệu mới nhận ${scope === 'one' ? 'vùng khoanh này' : 'các vùng đã chọn'} (tách khỏi ${e.code}). Mã ${e.code} giữ nguyên.` }} onClose={() => setDlg(null)} onDone={async id => {
      setDlg(null); await d.reload()
      const { data } = await supabase.from('entries').select('*').eq('id', id).single()
      if (data) move(data as Entry)
    }} />}
  </div>
}

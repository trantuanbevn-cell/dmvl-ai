import { syncLibrary } from '../../lib/matLibrary'
import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SECTIONS, BANDS, sectionOf, sectionTitle, type Lang } from '../../lib/sections'
import RoomSections from '../../components/RoomSections'
import AddMaterial, { type AddPreset } from '../../components/AddMaterial'
import type { ProjectData } from '../../lib/useProject'
import type { Entry } from '../../lib/types'
import EntryPanel from '../../components/EntryPanel'
import { missingOf } from '../../lib/missing'

export function StatusDot({ s }: { s: string }) {
  const t = { approved: 'Đã xác nhận', pending: 'Chờ duyệt', review: 'TVTK xem lại', rejected: 'Loại bỏ' }[s] ?? s
  return <span className={'dot st-' + s} title={t} />
}

export default function MaterialView({ d }: { d: ProjectData }) {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const secs = SECTIONS.map(sec => ({ sec, list: live.filter(e => sectionOf(e).key === sec.key) })).filter(x => x.list.length)
  const [only, setOnly] = useState<string>('')          // '' = tất cả
  const [roomId, setRoomId] = useState<string>('')      // '' = mọi phòng
  const [lang, setLang] = useState<Lang>('vn')
  const [flt, setFlt] = useState<'all' | 'pending' | 'inferred' | 'missing'>('all')
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<AddPreset | null>(null)
  const selEntry = d.entries.find(e => e.id === sel)
  const room = d.rooms.find(r => r.id === roomId) ?? null
  const inRoom = (e: Entry) => !room || d.occ.some(o => o.entry_id === e.id && o.room_id === room.id)
  const nMiss = (list: Entry[]) => list.filter(e => inRoom(e) && missingOf(e, lang).length).length
  if (!secs.length) return <div className="card muted">Chưa có dữ liệu – hãy chạy phân tích ở bước 2.</div>
  const curSec = SECTIONS.find(s => s.key === only)
  return (
    <div className={'mat-layout' + (selEntry ? ' with-panel' : '')}>
      <div>
        <div className="card mat-nav">
          <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="small muted">Phòng:</span>
            <select value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">Tất cả phòng</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select>
            <span className="small muted" style={{ marginLeft: 8 }}>Ngôn ngữ:</span>
            {([['vn', 'Tiếng Việt'], ['en', 'English'], ['both', 'Song ngữ']] as const).map(([k, l]) => <button key={k} className={'chip' + (lang === k ? ' on' : '')} onClick={() => setLang(k)}>{l}</button>)}
            <span className="small muted" style={{ marginLeft: 8 }}>Lọc:</span>
            {([['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['inferred', 'Suy luận'], ['missing', '⚠ Thiếu thông tin']] as const).map(([k, l]) => <button key={k} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l}</button>)}
          </div>
          <div className="nav-row"><button className={'chip' + (!only ? ' on' : '')} onClick={() => { setOnly(''); setSel(null) }}>Tất cả vật liệu <span className="cnt">{live.filter(inRoom).length}</span></button></div>
          {Object.keys(BANDS).map(b => {
            const row = secs.filter(x => x.sec.band === b); if (!row.length) return null
            return <div key={b} className="nav-row"><span className="nav-band">{BANDS[b].vn.split(' – ')[0].replace(/^[A-D]\. /, '')}</span>
              {row.map(({ sec, list }) => { const n = list.filter(inRoom).length, m = nMiss(list); return (
                <button key={sec.key} className={'chip' + (only === sec.key ? ' on' : '')} onClick={() => { setOnly(sec.key); setSel(null) }} title={sec.en}>{sec.vn} <span className="cnt">{n}</span>{m > 0 && <span className="cnt warn" title="dòng còn thiếu thông tin">⚠{m}</span>}</button>) })}
            </div>
          })}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{curSec ? sectionTitle(curSec, lang) : 'Tất cả vật liệu'}{room ? <span className="muted"> · {room.code} {room.name_vn}</span> : <span className="muted"> · tất cả phòng</span>}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Bảng trình bày đúng như khi xuất file; cột “Vị trí” liệt kê các phòng dùng vật liệu này. {!room && 'Chọn một phòng ở trên nếu muốn thêm/nhân đôi vật liệu.'}</p>
          <RoomSections d={d} room={room} only={only || undefined} lang={lang} filter={flt} sel={sel} onPick={o => setSel(o.entry_id)} onDetail={id => setSel(id)} onRemove={() => {}} onAdd={setDlg} />
        </div>
      </div>
      {dlg && room && <AddMaterial d={d} room={room} preset={dlg} onClose={() => setDlg(null)} onDone={id => { setDlg(null); setSel(id) }} />}
      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => setSel(null)} />}
    </div>
  )
}

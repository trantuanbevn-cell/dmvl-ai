import { syncLibrary } from '../../lib/matLibrary'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { CATEGORY_GROUPS } from '../../lib/codes'
import { supabase } from '../../lib/supabase'
import { allSections, bandKeys, moveSection, sectionOf, sectionTitle, bandTitle, type Lang } from '../../lib/sections'
import SectionNames from '../../components/SectionNames'
import NewSection from '../../components/NewSection'
import BandManager, { saveLayout } from '../../components/BandManager'
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
  const { canEdit } = useAuth()
  const healed = useRef(new Set<string>())
  // Tự sửa các mục đã được đổi hạng mục sang “Tranh, artwork” từ trước nhưng còn nằm nhóm cũ → chuyển sang nhóm AW + đánh mã mới
  useEffect(() => {
    if (!canEdit) return
    const bad = d.entries.filter(e => e.status !== 'rejected' && !healed.current.has(e.id) && e.group_code !== 'AW' && d.occ.some(o => o.entry_id === e.id && o.category === 'artwork') && !d.occ.some(o => o.entry_id === e.id && o.category && o.category !== 'artwork'))
    if (!bad.length) return
    bad.forEach(e => healed.current.add(e.id))
    let max = d.entries.filter(x => x.group_code === 'AW').reduce((m, x) => Math.max(m, parseInt(x.code.split('-').pop() ?? '0', 10) || 0), 0)
    ;(async () => {
      for (const e of bad) { max++; await supabase.from('entries').update({ category: 'artwork', group_code: CATEGORY_GROUPS.artwork[0], code: `AW-${String(max).padStart(2, '0')}` }).eq('id', e.id) }
      d.reload()
    })()
  }, [d.entries, d.occ, canEdit])
  const secs = allSections().map(sec => ({ sec, list: live.filter(e => sectionOf(e).key === sec.key) })).filter(x => x.list.length || x.sec.custom)
  const [onlyRaw, setOnly] = useState<string>('')          // '' = tất cả
  const only = secs.some(x => x.sec.key === onlyRaw) ? onlyRaw : ''   // tab hết vật liệu thì tự biến mất
  const [roomId, setRoomId] = useState<string>('')      // '' = mọi phòng
  const [lang, setLang] = useState<Lang>('vn')
  const [flt, setFlt] = useState<'all' | 'pending' | 'inferred' | 'missing'>('all')
  const [renaming, setRenaming] = useState(false)
  const [newSec, setNewSec] = useState(false)
  const [bands, setBands] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)   // 'band:X' hoặc 'sec:key'
  const shift = (band: string, row: { sec: { key: string } }[], key: string, dir: -1 | 1) => { const i = row.findIndex(x => x.sec.key === key), j = i + dir; if (i < 0 || j < 0 || j >= row.length) return; saveLayout(d, dir < 0 ? moveSection(key, band, row[j].sec.key) : j + 1 < row.length ? moveSection(key, band, row[j + 1].sec.key) : moveSection(key, band)) }
  const drop = (band: string, before?: string) => { const k = dragKey; setDragKey(null); setOver(null); if (k && k !== before) saveLayout(d, moveSection(k, band, before)) }
  const [sel, setSel] = useState<string | null>(null)
  const [dlg, setDlg] = useState<AddPreset | null>(null)
  const selEntry = d.entries.find(e => e.id === sel)
  const room = d.rooms.find(r => r.id === roomId) ?? null
  const inRoom = (e: Entry) => !room || d.occ.some(o => o.entry_id === e.id && o.room_id === room.id)
  const nMiss = (list: Entry[]) => list.filter(e => inRoom(e) && missingOf(e, lang).length).length
  if (!secs.length) return <div className="card muted">Chưa có dữ liệu – hãy chạy phân tích ở bước 2.</div>
  const curSec = allSections().find(s => s.key === only)
  return (
    <div className={'mat-layout' + (selEntry ? ' with-panel' : '')}>
      <div>
        <div className="card mat-nav">
          <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="small muted">Phòng:</span>
            <select value={roomId} onChange={e => setRoomId(e.target.value)}><option value="">Tất cả phòng</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select>
            <span className="small muted" style={{ marginLeft: 8 }}>Ngôn ngữ:</span>
            {([['vn', 'Tiếng Việt'], ['en', 'English'], ['both', 'Song ngữ']] as const).map(([k, l]) => <button key={k} className={'chip' + (lang === k ? ' on' : '')} onClick={() => setLang(k)}>{l}</button>)}
            {canEdit && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setRenaming(true)} title="Đổi tên các hạng mục / nhóm">✎ Đổi tên hạng mục</button>}
            <span className="small muted" style={{ marginLeft: 8 }}>Lọc:</span>
            {([['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['inferred', 'Suy luận'], ['missing', '⚠ Thiếu thông tin']] as const).map(([k, l]) => <button key={k} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l}</button>)}
          </div>
          <div className="nav-row"><button className={'chip' + (!only ? ' on' : '')} onClick={() => { setOnly(''); setSel(null) }}>Tất cả vật liệu <span className="cnt">{live.filter(inRoom).length}</span></button>
            {canEdit && <button className="chip add" onClick={() => setNewSec(true)} title="Tạo thêm một nhóm vật liệu mới cho dự án">＋ Tạo nhóm vật liệu</button>}
            {canEdit && <button className="chip add" onClick={() => setBands(true)} title="Tạo / tách / gộp các nhóm lớn (Hoàn thiện, Nội thất…) và chuyển mục giữa các nhóm">⇅ Quản lý nhóm lớn</button>}
            {canEdit && <span className="small muted" style={{ marginLeft: 6 }}>kéo thả ô vật liệu sang hàng khác để chuyển nhóm</span>}</div>
          {bandKeys().map(b => {
            const row = secs.filter(x => x.sec.band === b); if (!row.length && !canEdit) return null
            return <div key={b} className={'nav-row' + (over === 'band:' + b ? ' drop' : '')} onDragOver={e => { if (dragKey) { e.preventDefault(); setOver('band:' + b) } }} onDragLeave={() => setOver(o => (o === 'band:' + b ? null : o))} onDrop={e => { e.preventDefault(); drop(b) }}>
              <span className="nav-band">{bandTitle(b, 'vn').split(' – ')[0].replace(/^[A-Z]\d?\. /, '')}</span>
              {!row.length && <span className="small muted">Nhóm trống – kéo thả ô vật liệu vào đây</span>}
              {row.map(({ sec, list }) => { const n = list.filter(inRoom).length, m = nMiss(list); return (
                <span key={sec.key} className="chip-wrap">
                <button draggable={canEdit} onDragStart={e => { setDragKey(sec.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", sec.key) }} onDragEnd={() => { setDragKey(null); setOver(null) }}
                  onDragOver={e => { if (dragKey && dragKey !== sec.key) { e.preventDefault(); e.stopPropagation(); setOver('sec:' + sec.key) } }} onDrop={e => { e.preventDefault(); e.stopPropagation(); drop(b, sec.key) }}
                  className={'chip' + (only === sec.key ? ' on' : n > 0 && m === 0 ? ' done' : '') + (over === 'sec:' + sec.key ? ' drop-before' : '') + (dragKey === sec.key ? ' dragging' : '')} onClick={() => { setOnly(sec.key); setSel(null) }} title={sec.en}>{sectionTitle(sec, 'vn')} <span className="cnt">{n}</span>{n > 0 && m === 0 && <span className="cnt ok" title="đã đủ thông tin">✓</span>}{m > 0 && <span className="cnt warn" title="dòng còn thiếu thông tin">⚠{m}</span>}</button>
                {canEdit && only === sec.key && row.length > 1 && <span className="chip-mv"><button title="Dời lên trước (xuất file cũng đổi theo)" disabled={row[0].sec.key === sec.key} onClick={() => shift(b, row, sec.key, -1)}>◀</button><button title="Dời ra sau (xuất file cũng đổi theo)" disabled={row[row.length - 1].sec.key === sec.key} onClick={() => shift(b, row, sec.key, 1)}>▶</button></span>}
                </span>) })}
            </div>
          })}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{curSec ? sectionTitle(curSec, lang) : 'Tất cả vật liệu'}{room ? <span className="muted"> · {room.code} {room.name_vn}</span> : <span className="muted"> · tất cả phòng</span>}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Bảng trình bày đúng như khi xuất file; cột “Vị trí” liệt kê các phòng dùng vật liệu này.</p>
          {curSec?.custom && !live.some(e => sectionOf(e).key === curSec.key) && <div className="muted small" style={{ padding: '10px 0' }}>Nhóm này chưa có vật liệu. Bấm “＋ Thêm vật liệu” bên dưới, hoặc vào cột “Hạng mục” của một vật liệu khác để chuyển nó sang nhóm này.
            {canEdit && <div style={{ marginTop: 8 }}><button className="btn primary sm" onClick={() => setDlg({ section_key: curSec.key, group: curSec.groups[0], category: 'decor', name: '', hint: `Thêm vật liệu đầu tiên vào nhóm “${sectionTitle(curSec, lang)}”.` })}>＋ Thêm vật liệu</button></div>}</div>}
          <RoomSections d={d} room={room} only={only || undefined} lang={lang} filter={flt} sel={sel} onPick={o => setSel(o.entry_id)} onDetail={id => setSel(id)} onRemove={() => {}} onAdd={setDlg} />
        </div>
      </div>
      {newSec && <NewSection d={d} onClose={() => setNewSec(false)} onDone={k => { setNewSec(false); setOnly(k); setSel(null) }} />}
      {bands && <BandManager d={d} onClose={() => setBands(false)} />}
      {renaming && <SectionNames d={d} onClose={() => setRenaming(false)} />}
      {dlg && <AddMaterial d={d} room={room} preset={dlg} onClose={() => setDlg(null)} onDone={id => { setDlg(null); setSel(id) }} />}
      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => setSel(null)} />}
    </div>
  )
}

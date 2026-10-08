import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GROUPS } from '../../lib/codes'
import type { ProjectData } from '../../lib/useProject'
import type { Entry } from '../../lib/types'
import { locationsOf } from '../../lib/locations'
import Crop from '../../components/Crop'
import EntryPanel from '../../components/EntryPanel'
import { useAuth } from '../../lib/auth'
import { missingOf } from '../../lib/missing'

export function StatusDot({ s }: { s: string }) {
  const t = { approved: 'Đã xác nhận', pending: 'Chờ duyệt', review: 'TVTK xem lại', rejected: 'Loại bỏ' }[s] ?? s
  return <span className={'dot st-' + s} title={t} />
}

export default function MaterialView({ d }: { d: ProjectData }) {
  const groups = GROUPS.map(g => ({ g, list: d.entries.filter(e => e.group_code === g.code) })).filter(x => x.list.length)
  const { canEdit } = useAuth()
  const [gc, setGc] = useState<string>(groups[0]?.g.code ?? '')
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'inferred' | 'nocode'>('all')
  const [busy, setBusy] = useState('')
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const cur = groups.find(x => x.g.code === gc) ?? groups[0]
  const selEntry = d.entries.find(e => e.id === sel)

  let list = cur?.list ?? []
  if (filter === 'pending') list = list.filter(e => e.status === 'pending' || e.status === 'review')
  if (filter === 'inferred') list = list.filter(e => e.source === 'inferred')
  if (filter === 'nocode') list = list.filter(e => !e.product_code)

  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); d.reload() }
  if (!groups.length) return <div className="card muted">Chưa có dữ liệu – hãy chạy phân tích ở bước 2.</div>
  return (
    <div className={'mat-layout' + (selEntry ? ' with-panel' : '')}>
      <div>
        <div className="chips">
          {groups.map(({ g, list }) => {
            const pend = list.filter(e => e.status === 'pending' || e.status === 'review').length
            return <button key={g.code} className={'chip' + (g.code === cur?.g.code ? ' on' : '')} onClick={() => { setGc(g.code); setSel(null) }}>
              <b>{g.code}</b> {g.vn} <span className="cnt">{list.filter(e => e.status === 'approved').length}/{list.length}</span>{pend > 0 && <span className="cnt warn">{pend}</span>}
            </button>
          })}
        </div>
        <div className="card">
          <div className="row between">
            <div><h3>{cur?.g.code} · {cur?.g.vn} <span className="muted">/ {cur?.g.en}</span></h3>
              <div className="small muted">Cần ghi: {cur?.g.attrs_vn}</div></div>
            <div className="row gap sm-gap">
              <select value={filter} onChange={e => setFilter(e.target.value as any)}>
                <option value="all">Tất cả</option><option value="pending">Chờ duyệt</option><option value="inferred">Suy luận</option><option value="nocode">Chưa có mã hãng</option>
              </select>
            </div>
          </div>
          {busy && <div className="note">{busy}</div>}
          <div className="mat-cards">{list.map(e => {
            const occ = d.occ.filter(o => o.entry_id === e.id)
            const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
            const shots = occ.filter(o => o.bbox)
            return (
              <div key={e.id} className={'mat-card st-' + e.status + (e.id === sel ? ' sel' : '') + ' src-row-' + e.source} onClick={() => setSel(e.id)}>
                <div className="mc-imgs">
                  {shots.slice(0, 3).map(o => { const pg = o.page_id ? pageById.get(o.page_id) : undefined; return <Crop key={o.id} url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={120} maxWidth={180} /> })}
                  {shots.length > 3 && <span className="small muted">+{shots.length - 3} ảnh</span>}
                  {!shots.length && <div className="ic-none wide" style={e.color_hex ? { background: e.color_hex } : undefined}><span>{e.source === 'inferred' ? 'Suy luận – không thấy trong ảnh' : 'Chưa có ảnh'}</span></div>}
                  {e.color_hex && shots.length > 0 && <span className="swatch" style={{ background: e.color_hex, height: 120 }}><span>{e.color_hex}</span></span>}
                </div>
                <div className="mc-body">
                  <div className="row between nowrap"><div><b className="code big-code">{e.code}</b> <b>{e.name_vn}</b></div>
                    <span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></div>
                  <div className="small muted">{e.material_vn}</div>
                  <div className="loc-line"><span className="small muted">Có ở {locs.length} phòng:</span>{locs.map(l => <span key={l.room.id} className="loc-tag" title={l.pages.length ? `Trang concept: ${l.pages.join(', ')}` : ''}>{l.room.code} {l.room.name_vn}{l.n > 1 ? ` ×${l.n}` : ''}</span>)}{!locs.length && <span className="muted small">chưa gán phòng</span>}</div>
                  <div className="row between small"><span>{e.brand ? <b>{e.brand} · {e.product_code}</b> : <span className="muted">chưa chọn mã hãng</span>}</span><span>{e.qty ?? '—'} {e.unit ?? ''} {e.qty_flag !== 'ok' && <span className="warn-text">⚠</span>}</span></div>
                  <div className="ic-actions"><StatusDot s={e.status} />{missingOf(e, 'vn').length > 0 && <span className="miss-badge" title="Thiếu thông tin">⚠ thiếu {new Set(missingOf(e, 'vn').map(m => m.label)).size}</span>}
                    {canEdit && <><button className={'btn sm' + (e.status === 'approved' ? ' ok-on' : '')} onClick={ev => quick(e, 'approved', ev)}>✓ Xác nhận</button>
                    <button className="btn ghost sm" onClick={ev => quick(e, 'rejected', ev)}>✕ Loại</button></>}</div>
                </div>
              </div>)
          })}</div>
        </div>
      </div>
      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => setSel(null)} />}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GROUPS } from '../../lib/codes'
import type { ProjectData } from '../../lib/useProject'
import type { Entry } from '../../lib/types'
import { locationsOf } from '../../lib/locations'
import Crop from '../../components/Crop'
import EntryPanel from '../../components/EntryPanel'

export function StatusDot({ s }: { s: string }) {
  const t = { approved: 'Đã xác nhận', pending: 'Chờ duyệt', review: 'TVTK xem lại', rejected: 'Loại bỏ' }[s] ?? s
  return <span className={'dot st-' + s} title={t} />
}

export default function MaterialView({ d }: { d: ProjectData }) {
  const groups = GROUPS.map(g => ({ g, list: d.entries.filter(e => e.group_code === g.code) })).filter(x => x.list.length)
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
              <b>{g.code}</b> {g.vn} <span className="cnt">{list.length}</span>{pend > 0 && <span className="cnt warn">{pend}</span>}
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
          <table className="tbl items">
            <thead><tr><th>Ảnh trong các không gian</th><th>Mã</th><th>Tên / vật liệu</th><th>Vị trí (các phòng)</th><th>Hãng · mã</th><th>Nguồn</th><th>Duyệt</th></tr></thead>
            <tbody>{list.map(e => {
              const occ = d.occ.filter(o => o.entry_id === e.id)
              const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
              return (
                <tr key={e.id} className={(e.id === sel ? 'sel ' : '') + 'src-row-' + e.source} onClick={() => setSel(e.id)}>
                  <td><div className="row sm-gap">
                    {occ.filter(o => o.bbox).slice(0, 4).map(o => { const pg = o.page_id ? pageById.get(o.page_id) : undefined; return <Crop key={o.id} url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={68} maxWidth={120} /> })}
                    {e.color_hex && <span className="swatch sm" style={{ background: e.color_hex }} />}
                  </div></td>
                  <td><b className="code">{e.code}</b></td>
                  <td><b>{e.name_vn}</b><div className="small muted">{e.material_vn}</div></td>
                  <td className="small loc-cell">{locs.length ? locs.map(l => <div key={l.room.id} title={l.pages.length ? `Trang concept: ${l.pages.join(', ')}` : ''}><b>{l.room.code}</b> {l.room.name_vn}{l.n > 1 ? ` ×${l.n}` : ''}</div>) : <span className="muted">—</span>}</td>
                  <td className="small">{e.brand ? <>{e.brand}<br />{e.product_code}</> : <span className="muted">—</span>}</td>
                  <td><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></td>
                  <td className="row sm-gap nowrap">
                    <StatusDot s={e.status} />
                    <button className="btn ghost sm" title="Xác nhận" onClick={ev => quick(e, 'approved', ev)}>✓</button>
                    <button className="btn ghost sm" title="Loại bỏ" onClick={ev => quick(e, 'rejected', ev)}>✕</button>
                  </td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      </div>
      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => setSel(null)} />}
    </div>
  )
}

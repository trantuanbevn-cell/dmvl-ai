import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORIES, roomTypeLabel } from '../../lib/codes'
import { loadSettings, Settings } from '../../lib/settings'
import { checkRoom } from '../../lib/check'
import type { ProjectData } from '../../lib/useProject'

export default function CheckView({ d }: { d: ProjectData }) {
  const [st, setSt] = useState<Settings | null>(null)
  const nav = useNavigate()
  useEffect(() => { loadSettings().then(setSt) }, [])
  const entryById = useMemo(() => new Map(d.entries.map(e => [e.id, e])), [d.entries])
  if (!st) return <div className="card muted">Đang tải checklist…</div>

  const results = new Map(d.rooms.map(r => [r.id, checkRoom(d, r, st.checklist)]))
  const totals = {
    pending: d.entries.filter(e => e.status === 'pending').length,
    review: d.entries.filter(e => e.status === 'review').length,
    inferred: d.entries.filter(e => e.source === 'inferred' && e.status === 'pending').length,
    qty: d.entries.filter(e => e.status !== 'rejected' && e.qty_flag !== 'ok').length,
    nocode: d.entries.filter(e => e.status !== 'rejected' && !e.product_code && !['ME'].includes(e.group_code)).length,
    missing: [...results.values()].flat().filter(r => !r.ok && r.level === 'required').length,
  }

  return (
    <div className="stack">
      <div className="kpis">
        <div className={'kpi' + (totals.missing ? ' bad' : ' good')}><b>{totals.missing}</b>mục bắt buộc còn thiếu</div>
        <div className="kpi warn"><b>{totals.pending}</b>mã chờ duyệt</div>
        <div className="kpi warn"><b>{totals.inferred}</b>mục suy luận chờ xác nhận</div>
        <div className="kpi warn"><b>{totals.qty}</b>mã cần nhập/kiểm số lượng</div>
        <div className="kpi"><b>{totals.nocode}</b>mã chưa chọn hãng</div>
        <div className="kpi"><b>{totals.review}</b>cần TVTK xem lại</div>
      </div>

      <div className="card scroll-x">
        <h3>Ma trận phòng × hạng mục</h3>
        <p className="small muted">Số trong ô = số mã. <span className="lg ok" /> đã xác nhận hết · <span className="lg pend" /> còn chờ duyệt · <span className="lg miss" /> thiếu mục BẮT BUỘC theo checklist · bấm ô để mở phòng.</p>
        <table className="tbl matrix">
          <thead><tr><th>Phòng</th>{CATEGORIES.map(c => <th key={c.key}>{c.vn}</th>)}</tr></thead>
          <tbody>{d.rooms.map(r => {
            const res = results.get(r.id) ?? []
            return (
              <tr key={r.id}>
                <td><b>{r.code}</b> {r.name_vn}<div className="small muted">{roomTypeLabel(r.room_type)}</div></td>
                {CATEGORIES.map(c => {
                  const ids = [...new Set(d.occ.filter(o => o.room_id === r.id && (o.category ?? entryById.get(o.entry_id)?.category) === c.key).map(o => o.entry_id))]
                  const es = ids.map(id => entryById.get(id)).filter(e => e && e.status !== 'rejected')
                  const miss = res.some(x => x.item.category === c.key && x.level === 'required' && !x.ok)
                  const pend = es.some(e => e!.status !== 'approved')
                  const cls = miss ? 'miss' : !es.length ? 'none' : pend ? 'pend' : 'ok'
                  return <td key={c.key} className={'cell ' + cls} onClick={() => nav(`/p/${d.project!.id}/rooms?room=${r.id}`)}>{es.length || (miss ? '!' : '')}</td>
                })}
              </tr>)
          })}</tbody>
        </table>
      </div>

      <div className="grid-rooms">
        {d.rooms.map(r => {
          const res = results.get(r.id) ?? []
          const miss = res.filter(x => !x.ok)
          const ws = d.warnings.filter(w => w.room_id === r.id)
          return (
            <div key={r.id} className="card">
              <h4>{r.code} {r.name_vn} <span className="muted small">({roomTypeLabel(r.room_type)})</span></h4>
              {!miss.length && !ws.length && <div className="ok-text">✓ Đủ theo checklist</div>}
              {miss.map(x => <div key={x.item.label} className={x.level === 'required' ? 'missline' : 'warnline'}>{x.level === 'required' ? '✗ Thiếu (bắt buộc):' : '? Thường có:'} {x.item.label}</div>)}
              {ws.map(w => <div key={w.id} className="warnline small">⚠ {w.text}</div>)}
              <button className="btn sm" onClick={() => nav(`/p/${d.project!.id}/rooms?room=${r.id}`)}>Mở phòng để bổ sung →</button>
            </div>)
        })}
      </div>
    </div>
  )
}

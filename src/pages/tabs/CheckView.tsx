import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORIES, roomTypeLabel } from '../../lib/codes'
import { loadSettings, Settings } from '../../lib/settings'
import { checkRoom } from '../../lib/check'
import type { ProjectData } from '../../lib/useProject'
import { roomStats, heroUrl } from '../../lib/progress'
import { findDuplicates, mergeEntries } from '../../lib/merge'
import { toast } from '../../lib/toast'

export default function CheckView({ d }: { d: ProjectData }) {
  const [st, setSt] = useState<Settings | null>(null)
  const nav = useNavigate()
  useEffect(() => { loadSettings().then(setSt) }, [])
  const [skip, setSkip] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('dmvl-dup-skip') ?? '[]') } catch { return [] } })
  const [busy, setBusy] = useState(false)
  const dups = useMemo(() => findDuplicates(d.entries).filter(p => !skip.includes(p.keep.id + p.dup.id)).slice(0, 12), [d.entries, skip])
  const entryById = useMemo(() => new Map(d.entries.map(e => [e.id, e])), [d.entries])
  if (!st) return <div className="card muted">Đang tải checklist…</div>

  const stats = roomStats(d)
  const thumb = (id: string) => { const u = heroUrl(d, stats.get(id)?.hero); return u ? <span className="mini-hero" style={{ backgroundImage: `url("${u}")` }} /> : null }
  const results = new Map(d.rooms.map(r => [r.id, checkRoom(d, r, st.checklist).filter(x => !(r.dismissed_suggest ?? []).includes(x.item.label))]))
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

      {dups.length > 0 && (
        <div className="card">
          <h3>Gợi ý gộp mã trùng ({dups.length})</h3>
          <p className="small muted">Cùng một vật liệu thật nhưng đang có nhiều mã (thường do nhiều góc camera trong một không gian lớn). Gộp sẽ giữ mã nhỏ hơn, chuyển toàn bộ vị trí xuất hiện sang mã đó.</p>
          {dups.map(p => (
            <div key={p.keep.id + p.dup.id} className="row sm-gap" style={{ padding: '6px 0', borderTop: '1px solid var(--line, #eee)', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}><b>{p.keep.code}</b> {p.keep.name_vn} <span className="muted">· {p.keep.material_vn}</span><br /><b>{p.dup.code}</b> {p.dup.name_vn} <span className="muted">· {p.dup.material_vn}</span><div className="small muted">Giống {Math.round(p.score * 100)}%{p.why.length ? ' – ' + p.why.join(', ') : ''}</div></div>
              <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await mergeEntries(p.keep, p.dup, d.entries); toast(`Đã gộp ${p.dup.code} vào ${p.keep.code}`, 'ok') } catch (e) { toast(String(e)) } setBusy(false) }}>Gộp</button>
              <button className="btn ghost" onClick={() => { const n = [...skip, p.keep.id + p.dup.id]; setSkip(n); try { localStorage.setItem('dmvl-dup-skip', JSON.stringify(n)) } catch { /* */ } }}>Khác nhau</button>
            </div>))}
        </div>)}

      <div className="card scroll-x">
        <h3>Ma trận phòng × hạng mục</h3>
        <p className="small muted">Số trong ô = số mã. <span className="lg ok" /> đã xác nhận hết · <span className="lg pend" /> còn chờ duyệt · <span className="lg miss" /> thiếu mục BẮT BUỘC theo checklist · bấm ô để mở phòng.</p>
        <table className="tbl matrix">
          <thead><tr><th>Phòng</th>{CATEGORIES.map(c => <th key={c.key}>{c.vn}</th>)}</tr></thead>
          <tbody>{d.rooms.map(r => {
            const res = results.get(r.id) ?? []
            return (
              <tr key={r.id}>
                <td className="row sm-gap nowrap">{thumb(r.id)}<div><b>{r.code}</b> {r.name_vn}<div className="small muted">{roomTypeLabel(r.room_type)}</div></div></td>
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
              <div className="row sm-gap nowrap">{thumb(r.id)}<h4 style={{ margin: 0 }}>{r.code} {r.name_vn} <span className="muted small">({roomTypeLabel(r.room_type)})</span></h4></div>
              {!miss.length && !ws.length && <div className="ok-text">✓ Đủ theo checklist</div>}
              {miss.map(x => <div key={x.item.label} className={x.level === 'required' ? 'missline' : 'warnline'}>{x.level === 'required' ? '✗ Thiếu (bắt buộc):' : '? Thường có:'} {x.item.label}</div>)}
              {ws.map(w => <div key={w.id} className="warnline small">⚠ {w.text}</div>)}
              <button className="btn sm" onClick={() => nav(`/p/${d.project!.id}/rooms?room=${r.id}`)}>Mở phòng để bổ sung / xử lý đề xuất →</button>
            </div>)
        })}
      </div>
    </div>
  )
}

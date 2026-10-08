import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useNavigate } from 'react-router-dom'
import { syncSharedPages } from '../../lib/roomSplit'
import { roomStats, projectStats, heroStyle, RoomStat } from '../../lib/progress'
import { roomTypeLabel } from '../../lib/codes'
import { loadSettings, Settings } from '../../lib/settings'
import { checkRoom } from '../../lib/check'
import type { ProjectData } from '../../lib/useProject'
import Bar from '../../components/Bar'
import OccCrop from '../../components/OccCrop'
import { roomMissing } from '../../lib/missing'

const STATE_LABEL = { none: 'Chưa phân tích', todo: 'Cần duyệt', done: 'Hoàn tất' } as const

export default function Overview({ d }: { d: ProjectData }) {
  const nav = useNavigate()
  const id = d.project!.id
  const [flt, setFlt] = useState<'all' | 'none' | 'todo' | 'done'>('all')
  const [st, setSt] = useState<Settings | null>(null)
  useEffect(() => { loadSettings().then(setSt).catch(() => {}) }, [])
  const { canEdit } = useAuth()
  const synced = useRef(false)
  // Slide đã tách phòng từ trước: tự gán ô ảnh cho đúng phòng để ảnh đại diện khớp (một lần mỗi lần mở)
  useEffect(() => {
    if (!canEdit || synced.current || !d.pages.length || !d.occ.length) return
    synced.current = true
    syncSharedPages(d).then(n => { if (n) d.reload() }).catch(() => {})
  }, [canEdit, d.pages.length, d.occ.length]) // eslint-disable-line
  const stats = useMemo(() => roomStats(d), [d])
  const ps = projectStats(d)
  const list = [...stats.values()]
  const cnt = { none: list.filter(x => x.state === 'none').length, todo: list.filter(x => x.state === 'todo').length, done: list.filter(x => x.state === 'done').length }
  const missing = (s: RoomStat) => (st ? checkRoom(d, s.room, st.checklist).filter(r => !r.ok && r.level === 'required' && !(s.room.dismissed_suggest ?? []).includes(r.item.label)).length : 0)
  const goRoom = (rid: string) => nav(`/p/${id}/rooms?room=${rid}`)

  // Gợi ý bước tiếp theo
  let next: { text: string; btn: string; to: string } | null = null
  const noAnalysis = list.filter(x => x.state === 'none' && x.pages.some(p => p.kind === 'render'))
  if (!d.pages.length) next = { text: 'Chưa có file concept.', btn: 'Tải file PDF', to: `/p/${id}/upload` }
  else if (noAnalysis.length) next = { text: `Còn ${noAnalysis.length} phòng chưa được phân tích.`, btn: 'Chạy phân tích', to: `/p/${id}/analyze` }
  else if (ps.pending + ps.review > 0) {
    const worst = [...list].sort((a, b) => (b.pending + b.review) - (a.pending + a.review))[0]
    next = { text: `Còn ${ps.pending + ps.review} mã chờ duyệt – nhiều nhất ở ${worst.room.code} ${worst.room.name_vn}.`, btn: 'Mở phòng này', to: `/p/${id}/rooms?room=${worst.room.id}` }
  } else if (ps.total) next = { text: 'Đã duyệt hết các mã. Kiểm tra số lượng, mã hãng rồi xuất file.', btn: 'Sang Kiểm tra', to: `/p/${id}/check` }

  const shown = list.filter(x => flt === 'all' || x.state === flt)
  const pageRoomState = new Map<string, RoomStat>(list.map(x => [x.room.id, x]))

  return (
    <div className="stack">
      <div className="card hero-card">
        <div className="hero-top">
          <div className="big-pct"><b>{ps.pct}%</b><span>đã xác nhận</span></div>
          <div className="hero-bar">
            <Bar approved={ps.approved} pending={ps.pending + ps.review} total={ps.total} height={14} />
            <div className="legend-row small">
              <span><i className="lgd ok" />{ps.approved} đã xác nhận</span>
              <span><i className="lgd pend" />{ps.pending + ps.review} chờ duyệt</span>
              <span><i className="lgd none" />tổng {ps.total} mã</span>
              <span>⚠ {ps.qtyWarn} cần nhập SL</span>
              <span>🏷 {ps.noBrand} chưa chọn hãng</span>
            </div>
          </div>
        </div>
        {next && <div className="next-step"><span>👉 {next.text}</span><button className="btn primary sm" onClick={() => nav(next!.to)}>{next.btn} →</button></div>}
      </div>

      {d.pages.length > 0 && (
        <div className="card">
          <div className="row between"><h3>Toàn bộ file concept · {d.pages.length} trang</h3>
            <div className="legend-row small"><span><i className="lgd none" />chưa phân tích</span><span><i className="lgd pend" />cần duyệt</span><span><i className="lgd ok" />hoàn tất</span><span><i className="lgd plan" />mặt bằng</span><span><i className="lgd grey" />bìa / chung</span></div></div>
          <div className="strip">
            {d.pages.map(pg => {
              const rs = pg.room_id ? pageRoomState.get(pg.room_id) : undefined
              const cls = pg.kind === 'plan' ? 'plan' : rs ? (rs.state === 'done' ? 'ok' : rs.state === 'todo' ? 'pend' : 'none') : 'grey'
              return (
                <div key={pg.id} className={'strip-tile ' + cls} title={`Tr.${pg.page_no}${rs ? ' · ' + rs.room.code + ' ' + rs.room.name_vn : ''}`} onClick={() => pg.room_id && goRoom(pg.room_id)}>
                  <img src={d.urls[pg.thumb_path ?? pg.image_path]} alt="" loading="lazy" />
                  <span className="strip-no">{pg.page_no}</span>{rs && <span className="strip-room">{rs.room.code}</span>}
                </div>)
            })}
          </div>
        </div>
      )}

      <div className="row between wrap-row">
        <h3 style={{ margin: 0 }}>Các không gian · {list.length}</h3>
        <div className="chips" style={{ margin: 0 }}>
          {([['all', `Tất cả ${list.length}`], ['none', `Chưa phân tích ${cnt.none}`], ['todo', `Cần duyệt ${cnt.todo}`], ['done', `Hoàn tất ${cnt.done}`]] as const).map(([k, l]) =>
            <button key={k} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l}</button>)}
        </div>
      </div>
      {!list.length && <div className="card muted">Chưa có phòng – hãy tải file concept ở bước “Hồ sơ & phòng”.</div>}
      <div className="room-cards">
        {shown.map(s => {
          const url = heroStyle(d, s.hero, s.room.id)
          const area = s.room.concept_counts?.find(c => /diện tích/i.test(c.label))
          const miss = missing(s)
          const seen = new Set<string>()
          const thumbs = d.occ.filter(o => o.room_id === s.room.id && o.bbox && o.page_id && !seen.has(o.entry_id) && seen.add(o.entry_id)).slice(0, 6)
          return (
            <div key={s.room.id} className={'room-card st-' + s.state} onClick={() => goRoom(s.room.id)}>
              <div className="rc-img" style={heroStyle(d, s.hero, s.room.id)}>
                <span className="rc-code">{s.room.code}</span>
                <span className={'rc-state ' + s.state}>{STATE_LABEL[s.state]}</span>
                {s.room.work_status && s.room.work_status !== 'todo' && <span className={'ws-tag ' + s.room.work_status} style={{ right: 6, bottom: 6, left: 'auto', top: 'auto' }}>{s.room.work_status === 'done' ? '✓ Xong' : '● Đang làm'}{s.room.work_by ? ` · ${s.room.work_by}` : ''}</span>}
                {!url && <span className="muted small">chưa có ảnh</span>}
              </div>
              <div className="rc-body">
                <b>{s.room.name_vn}</b>
                <div className="small muted">{roomTypeLabel(s.room.room_type)}{area ? ` · ${area.qty} m²` : ''} · {s.pages.filter(p => p.kind === 'render').length} ảnh PC</div>
                <Bar approved={s.approved} pending={s.pending + s.review} total={s.total} />
                <div className="small rc-nums"><span>{s.approved}/{s.total} đã xác nhận</span>{s.inferred > 0 && <span className="warn-text">{s.inferred} suy luận</span>}{miss > 0 && <span className="bad-text">✗ thiếu {miss}</span>}{(() => { const m = roomMissing(d, s.room.id); return s.total > 0 && m.rows > 0 ? <span className="bad-text">⚠ {m.rows} dòng thiếu thông tin</span> : null })()}{s.qtyWarn > 0 && s.total > 0 && <span className="muted">⚠ {s.qtyWarn} SL</span>}</div>
                {thumbs.length > 0 && <div className="rc-thumbs">{thumbs.map(o => <OccCrop key={o.id} d={d} o={o} height={40} maxWidth={60} arrow={false} />)}</div>}
              </div>
            </div>)
        })}
      </div>
    </div>
  )
}

import EnFill from '../../components/EnFill'
import { syncLibrary } from '../../lib/matLibrary'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CATEGORIES, roomTypeLabel } from '../../lib/codes'
import { allGroups } from '../../lib/sections'
import { clampBox } from '../../lib/crop'
import type { ProjectData } from '../../lib/useProject'
import type { Entry, Occurrence } from '../../lib/types'
import Crop from '../../components/Crop'
import EntryPanel from '../../components/EntryPanel'
import { StatusDot } from './MaterialView'
import Bar from '../../components/Bar'
import PlanMap from '../../components/PlanMap'
import RoomSections from '../../components/RoomSections'
import RoomSuggest from '../../components/RoomSuggest'
import AddMaterial, { type AddPreset } from '../../components/AddMaterial'
import type { Lang } from '../../lib/sections'
import { roomPages } from '../../lib/roomPages'
import { roomStats, heroStyle } from '../../lib/progress'
import { useAuth } from '../../lib/auth'
import { useOnline, colorOf } from '../../lib/presence'
import { roomMissing } from '../../lib/missing'

export default function RoomView({ d }: { d: ProjectData }) {
  const [sp, setSp] = useSearchParams()
  const roomId = sp.get('room') ?? d.rooms[0]?.id
  const room = d.rooms.find(r => r.id === roomId)
  const [sel, setSel] = useState<string | null>(null) // entry id
  const [selOcc, setSelOcc] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [draw, setDraw] = useState(false)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [lang, setLang] = useState<Lang>('vn')
  const [flt, setFlt] = useState<'all' | 'pending' | 'inferred' | 'missing'>('all')
  const { canEdit, name } = useAuth()
  const online = useOnline()
  const [add, setAdd] = useState({ group: 'DC', name: '', category: 'decor' })
  const [dlg, setDlg] = useState<AddPreset | null>(null)
  const imgRef = useRef<HTMLDivElement>(null)

  const pages = roomPages(d.pages, roomId).filter(p => p.kind === 'render' || p.kind === 'plan')
  const page = pages[Math.min(pageIdx, pages.length - 1)]
  const occ = d.occ.filter(o => o.room_id === roomId)
  const entryById = useMemo(() => new Map(d.entries.map(e => [e.id, e])), [d.entries])
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const selEntry = sel ? entryById.get(sel) : undefined

  const stats = useMemo(() => roomStats(d), [d])
  const passes = (e?: Entry) => !!e && (flt === 'all' || (flt === 'pending' ? e.status === 'pending' || e.status === 'review' : e.source === 'inferred'))
  const byCat = CATEGORIES.map(c => ({ c, rows: occ.filter(o => (o.category ?? entryById.get(o.entry_id)?.category) === c.key && passes(entryById.get(o.entry_id))) })).filter(x => x.rows.length)
  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); if (status === 'approved') syncLibrary(e.project_id, [{ ...e, status }]); d.reload() }
  const goto = (dir: number) => { const i = d.rooms.findIndex(r => r.id === roomId); const r = d.rooms[i + dir]; if (r) { setSp({ room: r.id }); setPageIdx(0); setSel(null) } }

  const pick = (o: Occurrence) => {
    setSel(o.entry_id); setSelOcc(o.id)
    const i = pages.findIndex(p => p.id === o.page_id); if (i >= 0) setPageIdx(i)
  }
  const rel = (ev: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height }
  }
  const finishDraw = async () => {
    if (!drag || !selOcc || !page) return
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1), w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0)
    setDrag(null); setDraw(false)
    if (w < 0.01 || h < 0.01) return
    await supabase.from('occurrences').update({ bbox: [x, y, w, h], page_id: page.id }).eq('id', selOcc)
    d.reload()
  }
  const approveAll = async () => {
    const ids = [...new Set(occ.map(o => o.entry_id))].filter(id => entryById.get(id)?.status === 'pending' && entryById.get(id)?.source === 'image')
    if (!ids.length || !confirm(`Xác nhận ${ids.length} hạng mục nhìn thấy trong ảnh của phòng này? (dòng suy luận vẫn để chờ duyệt)`)) return
    await supabase.from('entries').update({ status: 'approved' }).in('id', ids); d.reload()
  }
  const addItem = () => { if (!room) return; setDlg({ group: add.group, category: add.category, name: add.name, hint: 'Hệ thống sẽ kiểm tra xem vật liệu này đã có mã chưa.' }); setAdd({ ...add, name: '' }) }
  const removeOcc = async (o: Occurrence) => { if (confirm('Bỏ hạng mục này khỏi phòng?')) { await supabase.from('occurrences').delete().eq('id', o.id); d.reload() } }

  const setWork = async (st: 'todo' | 'doing' | 'done') => {
    if (!room) return
    if (st === 'done') {
      const m = roomMissing(d, room.id, lang)
      if (m.rows && !confirm(`Phòng này còn ${m.rows} dòng thiếu thông tin (${m.cells} ô đỏ). Vẫn đánh dấu HOÀN THÀNH?`)) return
    }
    const patch = st === 'todo' ? { work_status: st, assigned_to: null, work_by: null, work_at: null } : { work_status: st, assigned_to: name, work_by: name, work_at: new Date().toISOString() }
    const { error } = await supabase.from('rooms').update(patch).eq('id', room.id)
    if (error) return alert(error.message)
    d.reload()
  }
  const WS = { todo: 'Chưa làm', doing: 'Đang làm', done: 'Đã hoàn thành' } as const
  const ws = room?.work_status ?? 'todo'
  const rm = room ? roomMissing(d, room.id, lang) : { rows: 0, cells: 0 }
  const here = (rid: string) => online.filter(o => o.room === rid && o.project === d.project!.id)

  if (!d.rooms.length) return <div className="card muted">Chưa có phòng. Hãy tải concept ở bước 1.</div>

  return (
    <div className={'room-layout' + (selEntry ? ' with-panel' : '')}>
      <div className="room-list">
        {d.rooms.map(r => {
          const st = stats.get(r.id)!; const hs = heroStyle(d, st.hero, r.id, 16 / 9)
          const rmiss = roomMissing(d, r.id, lang), wk = r.work_status ?? 'todo', hr = here(r.id)
          return (
            <button key={r.id} className={'room-btn' + (r.id === roomId ? ' on' : '')} onClick={() => { setSp({ room: r.id }); setPageIdx(0); setSel(null) }}>
              <div className="rb-img" style={hs}><span className="rc-code">{r.code}</span><span className={'rb-dot ' + st.state} />{wk !== 'todo' && <span className={'ws-tag ' + wk}>{wk === 'done' ? '✓ Xong' : '● Đang làm'}</span>}
                {hr.length > 0 && <span className="rb-here">{hr.slice(0, 3).map(o => <i key={o.id} className="av xs" style={{ background: colorOf(o.id) }} title={o.name + ' đang xem phòng này'}>{o.name.split(/\s+/).slice(-1)[0][0]}</i>)}</span>}</div>
              <div className="rb-name">{r.name_vn}</div>
              <Bar approved={st.approved} pending={st.pending + st.review} total={st.total} height={5} />
              <span className="small muted">{st.approved}/{st.total} mã{st.pending + st.review ? ` · ${st.pending + st.review} chờ` : ''}</span>
              {r.work_by && wk !== 'todo' && <span className="small muted">{r.work_by}</span>}
              {st.total > 0 && <span className={'small ' + (rmiss.rows ? 'bad-text' : 'ok-text')}>{rmiss.rows ? `⚠ ${rmiss.rows} dòng thiếu` : '✓ đủ thông tin'}</span>}
            </button>)
        })}
      </div>

      <div className="room-main">
        {page ? (
          <div className="viewer">
            <div className="row between">
              <div className="page-strip">{pages.map((p, i) => <button key={p.id} className={'ps-tile' + (i === pageIdx ? ' on' : '')} onClick={() => setPageIdx(i)}><img src={d.urls[p.thumb_path ?? p.image_path]} alt="" /><span>Tr.{p.page_no}{p.kind === 'plan' ? ' · MB' : ''}</span></button>)}</div>
              <div className="row gap sm-gap">
                {canEdit && selOcc && <button className={'btn sm' + (draw ? ' primary' : '')} onClick={() => setDraw(!draw)}>{draw ? 'Kéo chuột trên ảnh để khoanh…' : '✎ Khoanh lại vùng cho mục đang chọn'}</button>}
              </div>
            </div>
            {(() => {
              const cam = page.camera as any, pp = cam?.plan_page_id ? d.pages.find(x => x.id === cam.plan_page_id) : (page.kind === 'plan' ? page : (room?.plan ? d.pages.find(x => x.id === room.plan.page_id) : undefined))
              if (!pp || (!cam?.plan_page_id && !room?.plan)) return null
              return <details className="card" style={{ margin: '8px 0' }}><summary><b>Vị trí trên mặt bằng</b> – camera, vùng phòng, ghế/bàn đếm được</summary><PlanMap url={d.urls[pp.image_path]} plan={room?.plan} cam={cam} cams={(page.views as any)?.cams} planPage={pp} room={room} /></details>
            })()}
            <div ref={imgRef} className={'img-wrap' + (draw ? ' drawing' : '')}
              onMouseDown={e => { if (draw) { const p = rel(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }) } }}
              onMouseMove={e => { if (draw && drag) { const p = rel(e); setDrag({ ...drag, x1: p.x, y1: p.y }) } }}
              onMouseUp={finishDraw}>
              <img src={d.urls[page.image_path]} alt="" draggable={false} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none">
                {occ.filter(o => o.page_id === page.id && o.bbox).map(o => {
                  const [x, y, w, h] = clampBox(o.bbox!)
                  const e = entryById.get(o.entry_id)
                  const on = o.entry_id === sel
                  return <g key={o.id} onClick={() => !draw && pick(o)} className={'bb' + (on ? ' on' : '') + (e?.source === 'inferred' ? ' inf' : '')}>
                    <rect x={x} y={y} width={w} height={h} vectorEffect="non-scaling-stroke" />
                  </g>
                })}
                {drag && <rect className="drag" x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} vectorEffect="non-scaling-stroke" />}
              </svg>
              {occ.filter(o => o.page_id === page.id && o.bbox).map(o => {
                const [x, y] = clampBox(o.bbox!); const e = entryById.get(o.entry_id)
                return <span key={o.id} className={'bb-label' + (o.entry_id === sel ? ' on' : '')} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onClick={() => !draw && pick(o)}>{e?.code}</span>
              })}
            </div>
          </div>
        ) : <div className="card muted">Phòng chưa có trang phối cảnh.</div>}

        <div className="card">
          <div className="row between">
            <div className="row gap sm-gap"><button className="btn ghost sm" onClick={() => goto(-1)}>←</button><h3 style={{ margin: 0 }}>{room?.code} {room?.name_vn} – {new Set(occ.map(o => o.entry_id)).size} hạng mục</h3><button className="btn ghost sm" onClick={() => goto(1)}>→</button></div>
            {canEdit && <button className="btn sm" onClick={approveAll}>✓ Xác nhận tất cả mục nhìn thấy</button>}
          </div>
          <div className={'work-bar ws-' + ws}>
            <span className={'ws-pill ' + ws}>{WS[ws]}</span>
            {room?.work_by && ws !== 'todo' && <span className="small">{ws === 'done' ? 'Hoàn thành bởi' : 'Người làm:'} <b>{room.work_by}</b>{room.work_at ? ` · ${new Date(room.work_at).toLocaleString('vi-VN')}` : ''}</span>}
            {here(room?.id ?? '').filter(o => o.name !== name).length > 0 && <span className="small muted">Đang xem cùng: {here(room!.id).filter(o => o.name !== name).map(o => o.name).join(', ')}</span>}
            <span className={'small ' + (rm.rows ? 'bad-text' : 'ok-text')} style={{ marginLeft: 'auto' }}>{rm.rows ? `⚠ ${rm.rows} dòng còn thiếu thông tin (${rm.cells} ô)` : (stats.get(room?.id ?? '')?.total ? '✓ Đã đủ thông tin các ô bắt buộc' : '')}</span>
            {canEdit && ws === 'todo' && <button className="btn sm" onClick={() => setWork('doing')}>▶ Nhận phòng này</button>}
            {canEdit && ws !== 'done' && <button className="btn primary sm" onClick={() => setWork('done')}>✓ Hoàn thành phòng</button>}
            {canEdit && ws === 'done' && <button className="btn sm" onClick={() => setWork('doing')}>↺ Mở lại để sửa</button>}
          </div>
          {room?.concept_counts?.length ? <p className="small muted">Số liệu concept: {room.concept_counts.map(c => `${c.label}: ${c.qty}`).join(' · ')}</p> : null}
          {d.warnings.filter(w => w.room_id === roomId).map(w => <div key={w.id} className="warnline">⚠ {w.text}</div>)}
          <div className="chips" style={{ margin: '10px 0' }}>
            <span className="small muted">Ngôn ngữ / ký hiệu:</span>
            {([['vn', 'Tiếng Việt'], ['en', 'English'], ['both', 'Song ngữ']] as const).map(([k, l]) => <button key={k} className={'chip' + (lang === k ? ' on' : '')} onClick={() => setLang(k)}>{l}</button>)}
            <span className="small muted" style={{ marginLeft: 12 }}>Lọc:</span>
            {([['all', 'Tất cả'], ['pending', 'Chờ duyệt'], ['inferred', 'Suy luận (không thấy trong ảnh)'], ['missing', `⚠ Thiếu thông tin${rm.rows ? ' (' + rm.rows + ')' : ''}`]] as const).map(([k, l]) => <button key={k} className={'chip' + (flt === k ? ' on' : '')} onClick={() => setFlt(k)}>{l}</button>)}
          </div>
          <EnFill d={d} lang={lang} />
          <RoomSections d={d} room={room!} lang={lang} filter={flt} sel={sel} onPick={pick} onDetail={id => { setSel(id); setSelOcc(null) }} onRemove={removeOcc} onAdd={setDlg} />
          {room && <RoomSuggest d={d} room={room} onAdd={setDlg} />}
          {canEdit && <div className="row gap add-row">
            <select value={add.category} onChange={e => setAdd({ ...add, category: e.target.value })}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select>
            <select value={add.group} onChange={e => setAdd({ ...add, group: e.target.value })}>{allGroups().map(g => <option key={g.code} value={g.code}>{g.code} – {g.vn}</option>)}</select>
            <input placeholder="Thêm hạng mục bị thiếu, vd: Ghế băng thay đồ" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && addItem()} style={{ flex: 1 }} />
            <button className="btn primary sm" onClick={addItem}>+ Thêm</button>
          </div>}
        </div>
      </div>

      {dlg && room && <AddMaterial d={d} room={room} preset={dlg} onClose={() => setDlg(null)} onDone={id => { setDlg(null); setSel(id); setSelOcc(null) }} />}
      {selEntry && <EntryPanel d={d} entry={selEntry} onClose={() => { setSel(null); setSelOcc(null) }} />}
    </div>
  )
}

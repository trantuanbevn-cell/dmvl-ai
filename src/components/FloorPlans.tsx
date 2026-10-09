import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { FloorPlan, FloorGeom } from '../lib/types'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { roomPolys, addMerge, removeMerge, centroidOf } from '../lib/cadZones'
import { addFloorPlan, computeFloor, deleteFloorPlan } from '../lib/floorPlans'
import LogBox, { useLog } from './LogBox'

const COLS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000', '#808000', '#000075']

export function FloorCard({ d, fp, run, busy }: { d: ProjectData; fp: FloorPlan; run: (fn: () => Promise<void>) => void; busy: boolean }) {
  const g = fp.geometry
  const [keys, setKeys] = useState<string[]>(g?.wall_keys ?? [])
  const [door, setDoor] = useState(g?.door_w ?? 1.0)
  const [den, setDen] = useState(fp.scale_den)
  const [sel, setSel] = useState<number | null>(null)
  const log = useLog(() => {})
  const { canEdit } = useAuth()
  const [mode, setMode] = useState(false)
  const [pick, setPick] = useState<number[]>([])
  const [nm, setNm] = useState(''), [nmEn, setNmEn] = useState('')
  const save = (ng: FloorGeom) => run(async () => { const { error } = await supabase.from('floor_plans').update({ geometry: ng }).eq('id', fp.id); if (error) throw new Error(error.message) })
  const click = (id: number) => { if (mode) setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); else setSel(id) }
  const conceptName = (id: number) => g?.compare?.find(c => c.cad_ids.includes(id) && c.cad_ids.length === 1)?.label
  const nameOf = (r: FloorGeom['rooms'][number]) => r.names[0] ?? conceptName(r.id)
  const applyName = () => {
    if (!g || !pick.length || !nm.trim()) return
    save({ ...addMerge(g, { name: nm.trim(), name_en: nmEn.trim() || undefined, members: centroidOf(g, pick), src: 'user' }) })
    setPick([]); setNm(''); setNmEn('')
  }
  const url = fp.preview_path ? d.urls[fp.preview_path] : undefined
  const total = g?.rooms.reduce((s, r) => s + r.area_m2, 0) ?? 0
  return (
    <div className="floor-card">
      <div className="row between"><h4 style={{ margin: 0 }}>{fp.floor_label} <span className="muted small">· tỉ lệ 1:{fp.scale_den} · {g ? `${g.rooms.length} phòng, ${Math.round(total)} m²` : 'chưa đọc'}</span></h4>
        <button className="btn ghost sm danger" disabled={busy} onClick={() => confirm(`Xoá mặt bằng ${fp.floor_label}?`) && run(async () => { await deleteFloorPlan(fp) })}>Xoá</button></div>
      {g?.leaked && <div className="note">⚠ Tìm được rất ít phòng kín – tường có thể chưa liền nét. Thử chọn thêm nhóm nét tường bên dưới hoặc tăng bề rộng cửa.</div>}
      <div className="floor-grid">
        <div className="img-wrap">
          {url && <img src={url} alt="" draggable={false} />}
          {g && <svg viewBox="0 0 1 1" preserveAspectRatio="none">{g.rooms.map((r, i) => roomPolys(r).map((pl, k) => <polygon key={r.id + '-' + k} points={pl.map(p => p.join(',')).join(' ')} fill={COLS[i % 10] + (sel === r.id || pick.includes(r.id) ? 'aa' : '44')} stroke={pick.includes(r.id) ? '#000' : COLS[i % 10]} strokeWidth={sel === r.id || pick.includes(r.id) ? 3 : 1} vectorEffect="non-scaling-stroke" onClick={() => click(r.id)} />))}</svg>}
          {g && g.rooms.filter(r => nameOf(r) && r.area_m2 > 3).map(r => <span key={'l' + r.id} className="zone-lab" style={{ left: r.cx * 100 + '%', top: r.cy * 100 + '%' }}>{nameOf(r)}<br />{r.area_m2} m²</span>)}
        </div>
        {g && <div>
          <div className="small muted">Bấm vào phòng trên bản vẽ để xem; số liệu này là <b>diện tích thật</b> từ bản vẽ gốc{g.doors != null ? <> · nhận diện <b>{g.doors}</b> cửa đi</> : null}.</div>
          {canEdit && <div className="zone-tools">
            <button className={'btn sm' + (mode ? ' primary' : '')} onClick={() => { setMode(!mode); setPick([]) }}>{mode ? '✓ Đang chọn để gộp' : '⛶ Gộp / đặt tên không gian'}</button>
            {mode && <div className="small" style={{ marginTop: 6 }}>Bấm các không gian nhỏ cần gộp thành 1 (đã chọn <b>{pick.length}</b>{pick.length ? ` · ${Math.round(pick.reduce((a, id) => a + (g.rooms.find(r => r.id === id)?.area_m2 ?? 0), 0))} m²` : ''}), rồi đặt tên:
              <div className="row gap" style={{ marginTop: 4 }}><input placeholder="Tên tiếng Việt" value={nm} onChange={e => setNm(e.target.value)} /><input placeholder="English name (tuỳ chọn)" value={nmEn} onChange={e => setNmEn(e.target.value)} /><button className="btn sm primary" disabled={busy || !pick.length || !nm.trim()} onClick={applyName}>Gộp & đặt tên</button></div></div>}
            {g.rooms.some(r => r.user) && <div className="small muted" style={{ marginTop: 4 }}>Không gian đã gộp/đặt tên: {g.rooms.filter(r => r.user).map(r => <span key={r.id} className="chip">{r.names[0]} ({r.area_m2} m²) <a onClick={() => save(removeMerge(g, r.id))} title="Tách lại">✕</a></span>)}</div>}
          </div>}
          {canEdit && (g.suggest?.length ?? 0) > 0 && <div className="zone-sug">
            <div className="small"><b>Gợi ý từ mặt bằng concept</b> – vùng concept có tên + diện tích trùng khớp với không gian của bản vẽ gốc:</div>
            {g.suggest!.map((x, i) => <div key={i} className="row between small" style={{ padding: '3px 0' }}><span>“{x.name}” (concept {x.label_area} m²) ← {x.members.length} không gian · {x.area} m²</span><button className="btn sm" disabled={busy} onClick={() => save({ ...addMerge(g, { name: x.name, members: x.members, src: 'concept' }), suggest: g.suggest!.filter((_, k) => k !== i) })}>{x.members.length > 1 ? 'Gộp & đặt tên' : 'Đặt tên'}</button></div>)}
            <button className="btn sm primary" disabled={busy} onClick={() => { let ng = g; for (const x of g.suggest!) ng = addMerge(ng, { name: x.name, members: x.members, src: 'concept' }); save({ ...ng, suggest: [] }) }}>Áp dụng tất cả gợi ý</button>
            <div className="small muted">Sau khi gộp, bấm “Phân tích mặt bằng & camera” để đối chiếu lại.</div>
          </div>}
          {(g.compare?.length ?? 0) > 0 && <details className="small" style={{ margin: '6px 0' }}><summary><b>Bảng đối chiếu concept ↔ bản vẽ gốc</b> ({g.compare!.length})</summary>
            <table className="tbl"><thead><tr><th>Phòng trong concept</th><th>m² concept</th><th>Không gian bản vẽ gốc</th><th>m² gốc</th><th>Lệch</th></tr></thead><tbody>
              {g.compare!.map((c, i) => { const dv = Math.round(((c.cad_area - c.label_area) / c.label_area) * 100); return <tr key={i}><td>{c.label} <span className="muted">(tr.{c.page_no})</span></td><td>{c.label_area}</td><td>{c.cad_ids.map(id => '#' + id).join(', ')}</td><td>{c.cad_area}</td><td style={{ color: Math.abs(dv) > 15 ? '#c62828' : undefined }}>{dv > 0 ? '+' : ''}{dv}%</td></tr> })}
            </tbody></table></details>}
          <div className="floor-rooms">{g.rooms.slice().sort((a, b) => b.area_m2 - a.area_m2).map(r => (
            <div key={r.id} className={'fr' + (sel === r.id ? ' on' : '')} onClick={() => click(r.id)}><span className="dotc" style={{ background: COLS[g.rooms.indexOf(r) % 10] }} />#{r.id} {r.names.slice(0, 2).join(' / ') || (conceptName(r.id) ? <span title="tên lấy từ concept">{conceptName(r.id)}*</span> : <span className="muted">(không có chữ)</span>)}{r.user ? ' ⛶' : ''}<b>{r.area_m2} m²</b>{r.label_area ? <span className="muted small"> (ghi {r.label_area})</span> : null}</div>))}</div>
        </div>}
      </div>
      {g && <details><summary className="small"><b>Chỉnh nâng cao</b> – nhóm nét tường, tỉ lệ, bề rộng cửa</summary>
        <div className="row gap" style={{ margin: '8px 0' }}>
          <label className="small">Tỉ lệ 1:<input style={{ width: 70 }} type="number" value={den} onChange={e => setDen(+e.target.value)} /></label>
          <label className="small">Cửa rộng tối đa (m)<input style={{ width: 70 }} type="number" step="0.1" value={door} onChange={e => setDoor(+e.target.value)} /></label>
          <button className="btn sm primary" disabled={busy} onClick={() => run(async () => { await computeFloor(fp, { wallKeys: keys, doorW: door, scaleDen: den }, log) })}>Tính lại phòng</button>
        </div>
        <div className="small muted">Tick các nhóm nét là TƯỜNG/CỘT (layer · độ dày nét · tổng chiều dài trên bản vẽ):</div>
        <div className="cls-list">{g.classes.map(c => (
          <label key={c.key} className="small"><input type="checkbox" checked={keys.includes(c.key)} onChange={e => setKeys(e.target.checked ? [...keys, c.key] : keys.filter(k => k !== c.key))} /> {c.layer || '(không layer)'} · {c.fill ? 'vùng tô đặc' : `nét ${c.lw} pt`} · {Math.round(c.len * g.m_per_pt)} m</label>))}</div>
      </details>}
    </div>
  )
}

export default function FloorPlans({ d, concept }: { d: ProjectData; concept?: boolean }) {
  const p = d.project!
  const [label, setLabel] = useState('')
  const [den, setDen] = useState(100)
  const [pageNo, setPageNo] = useState(1)
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const log = useLog(setLines)
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } catch (e) { log('LỖI: ' + String(e)) } setBusy(false); await d.reload() }
  const onFile = (f?: File) => {
    if (!f) return
    const l = label.trim() || f.name.replace(/\.pdf$/i, '')
    run(async () => { await addFloorPlan(p, f, l, den, pageNo, log); setLabel('') })
  }
  return (
    <div className="card">
      <h3>{concept ? '① Mặt bằng gốc theo tầng (PDF vector từ AutoCAD)' : 'Mặt bằng gốc theo tầng (PDF vector từ AutoCAD)'} {!concept && <span className="muted small">– tuỳ chọn, giúp đọc chính xác hơn</span>}</h3>
      <details className="small muted"><summary>Cách dùng</summary><p>Trong AutoCAD, xuất mặt bằng từng tầng ra PDF <b>dạng vector</b> (không chụp ảnh), tốt nhất bật “layers”. Điền tên tầng (vd “Tầng 5”) và tỉ lệ bản vẽ, rồi tải lên. Phần mềm đọc nét tường theo độ dày nét/layer, tách các phòng kín và đo <b>diện tích thật</b>; sau đó đối chiếu với mặt bằng trong file concept để biết mỗi ảnh phối cảnh nằm ở phòng nào của bản vẽ gốc. Không dùng AI.</p></details>
      <div className="row gap">
        <input placeholder="Tên tầng, vd: Tầng 5" value={label} onChange={e => setLabel(e.target.value)} />
        <label className="small">Tỉ lệ 1:<input style={{ width: 70 }} type="number" value={den} onChange={e => setDen(+e.target.value)} /></label>
        <label className="small">Trang<input style={{ width: 55 }} type="number" min={1} value={pageNo} onChange={e => setPageNo(+e.target.value)} /></label>
        <label className="btn primary">+ Tải PDF mặt bằng tầng<input type="file" accept="application/pdf" hidden disabled={busy} onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} /></label>
        {busy && <span className="spinner" />}
      </div>
      <LogBox lines={lines} />
      {d.floors.map(fp => <FloorCard key={fp.id} d={d} fp={fp} run={run} busy={busy} />)}
    </div>
  )
}

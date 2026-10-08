import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { FloorPlan } from '../lib/types'
import { addFloorPlan, computeFloor, deleteFloorPlan } from '../lib/floorPlans'
import LogBox, { useLog } from './LogBox'

const COLS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000', '#808000', '#000075']

function FloorCard({ d, fp, run, busy }: { d: ProjectData; fp: FloorPlan; run: (fn: () => Promise<void>) => void; busy: boolean }) {
  const g = fp.geometry
  const [keys, setKeys] = useState<string[]>(g?.wall_keys ?? [])
  const [door, setDoor] = useState(g?.door_w ?? 1.0)
  const [den, setDen] = useState(fp.scale_den)
  const [sel, setSel] = useState<number | null>(null)
  const log = useLog(() => {})
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
          {g && <svg viewBox="0 0 1 1" preserveAspectRatio="none">{g.rooms.map((r, i) => <polygon key={r.id} points={r.poly.map(p => p.join(',')).join(' ')} fill={COLS[i % 10] + (sel === r.id ? '99' : '44')} stroke={COLS[i % 10]} strokeWidth={sel === r.id ? 3 : 1} vectorEffect="non-scaling-stroke" onClick={() => setSel(r.id)} />)}</svg>}
        </div>
        {g && <div>
          <div className="small muted">Bấm vào phòng trên bản vẽ để xem; số liệu này là <b>diện tích thật</b> từ bản vẽ gốc.</div>
          <div className="floor-rooms">{g.rooms.slice().sort((a, b) => b.area_m2 - a.area_m2).map(r => (
            <div key={r.id} className={'fr' + (sel === r.id ? ' on' : '')} onClick={() => setSel(r.id)}><span className="dotc" style={{ background: COLS[g.rooms.indexOf(r) % 10] }} />#{r.id} {r.names.slice(0, 2).join(' / ') || <span className="muted">(không có chữ)</span>}<b>{r.area_m2} m²</b>{r.label_area ? <span className="muted small"> (ghi {r.label_area})</span> : null}</div>))}</div>
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

export default function FloorPlans({ d }: { d: ProjectData }) {
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
      <h3>Mặt bằng gốc theo tầng (PDF vector từ AutoCAD) <span className="muted small">– tuỳ chọn, giúp đọc chính xác hơn</span></h3>
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

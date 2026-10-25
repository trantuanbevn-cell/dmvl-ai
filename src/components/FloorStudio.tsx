// Hồ sơ mặt bằng: mỗi TẦNG là một thẻ (nạp DXF → hiện mặt bằng của tầng); nhấp đúp vào thẻ để mở trình chỉnh sửa phủ kín màn hình (vẽ, dim, vẽ phòng, xem 3D, mặt cắt…).
import { useEffect, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { FloorPlan } from '../lib/types'
import { BUCKET, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { addFloorPlan, deleteFloorPlan, updateFloorPdf } from '../lib/floorPlans'
import { footprint, type Model } from '../lib/plan3d/model'
import { finishOf } from '../lib/plan3d/library'
import { furnTypeOf } from '../lib/plan3d/furn'
import { toast } from '../lib/toast'
import LogBox, { useLog } from './LogBox'
import Plan3D from './Plan3D'
import FloorPlans from './FloorPlans'

const ringD = (r: [number, number][]) => 'M' + r.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z'

/** Hình mặt bằng của tầng (từ bản 3D đã lưu), vẽ kiểu màu minh hoạ có bóng đổ */
function FloorThumb({ pid, fp, tick, fallback }: { pid: string; fp: FloorPlan; tick: number; fallback?: string }) {
  const [M, setM] = useState<Model | null>(null), [state, setState] = useState<'load' | 'none' | 'ok'>('load')
  useEffect(() => {
    let off = false; setState('load')
    supabase.storage.from(BUCKET).download(`${pid}/plan3d/${fp.id}.json`).then(async ({ data, error }) => {
      if (off) return
      if (error || !data) { setState('none'); return }
      try { setM(JSON.parse(await data.text()) as Model); setState('ok') } catch { setState('none') }
    })
    return () => { off = true }
  }, [pid, fp.id, tick])
  if (state === 'ok' && M) {
    const fid = (id?: string) => finishOf(id)?.color
    return <svg viewBox={`${-0.5} ${-0.5} ${M.w + 1} ${M.h + 1}`} style={{ width: '100%', height: 300, background: '#f4efe6', borderRadius: 6, display: 'block' }}>
      <defs><filter id={'ts' + fp.id} x="-5%" y="-5%" width="112%" height="112%"><feDropShadow dx="0.07" dy="0.1" stdDeviation="0.07" floodColor="#2b2018" floodOpacity="0.42" /></filter></defs>
      {(M.rooms ?? []).map((r, i) => <path key={r.id} d={ringD(r.poly)} fill={fid(r.floor) ?? `hsl(${(i * 47) % 360} 55% 78%)`} />)}
      <g filter={`url(#ts${fp.id})`}>
        {(M.furn ?? []).map(f => <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.ang * 180 / Math.PI})`}><rect x={-f.w / 2} y={-f.d / 2} width={f.w} height={f.d} fill={furnTypeOf(f.kind).color} stroke="#6b5b45" strokeWidth={0.015} /></g>)}
      </g>
      <g filter={`url(#ts${fp.id})`}>{M.walls.map(w => <path key={w.id} d={footprint(w).map(ringD).join('')} fillRule="evenodd" fill={w.role === 'col' ? '#2b2723' : '#4a443c'} stroke="#2b2723" strokeWidth={0.01} />)}</g>
      {(M.rooms ?? []).filter(r => r.name).map(r => { let x = 0, y = 0; for (const p of r.poly) { x += p[0]; y += p[1] } const n = r.poly.length || 1; return <text key={'t' + r.id} x={x / n} y={y / n} fontSize={Math.max(0.35, M.w / 70)} textAnchor="middle" fill="#111" stroke="#fff" strokeWidth={0.06} paintOrder="stroke">{r.name}</text> })}
    </svg>
  }
  return <div style={{ height: 300, display: 'grid', placeItems: 'center', background: '#f4efe6', borderRadius: 6, textAlign: 'center', color: '#8a8478' }}>
    {state === 'load' ? 'Đang tải…' : fallback ? <img src={fallback} alt="" style={{ maxWidth: '100%', maxHeight: 300 }} /> : <span>Chưa dựng mặt bằng.<br />Nhấp đúp để dựng từ DXF.</span>}
  </div>
}

export default function FloorStudio({ d }: { d: ProjectData }) {
  const p = d.project!, { canEdit } = useAuth()
  const [edit, setEdit] = useState(''), [tick, setTick] = useState(0)
  const [label, setLabel] = useState(''), [den, setDen] = useState(100), [busy, setBusy] = useState(false), [lines, setLines] = useState<string[]>([])
  const log = useLog(setLines)
  const isDxf = (f: FloorPlan) => /\.dxf$/i.test(f.pdf_path)
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } catch (e) { toast(String(e)) } setBusy(false); await d.reload() }
  const add = (f?: File) => { if (!f) return; const l = label.trim() || f.name.replace(/\.(pdf|dxf)$/i, ''); void run(async () => { const id = await addFloorPlan(p, f, l, den, 1, log); setLabel(''); if (/\.dxf$/i.test(f.name)) setEdit(id) }) }
  return <div style={{ display: 'grid', gap: 10 }}>
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Mặt bằng các tầng <span className="muted small">– nạp DXF cho từng tầng, nhấp đúp vào mặt bằng để mở trình chỉnh sửa</span></h3>
        {canEdit && <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <input placeholder="Tên tầng, vd: Tầng 5" value={label} onChange={e => setLabel(e.target.value)} />
          <label className="small">Tỉ lệ 1:<input style={{ width: 64 }} type="number" value={den} onChange={e => setDen(+e.target.value)} /></label>
          <label className="btn primary" title="Mỗi lần nạp là thêm một tầng mới">+ Thêm tầng (nạp DXF / PDF)<input type="file" accept="application/pdf,.dxf" hidden disabled={busy} onChange={e => { add(e.target.files?.[0]); e.target.value = '' }} /></label>
          {busy && <span className="spinner" />}
        </div>}
      </div>
      <LogBox lines={lines} />
      {!d.floors.length && <div className="muted">Chưa có tầng nào. Nhập tên tầng rồi bấm “Thêm tầng” để nạp file DXF mặt bằng.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 12 }}>
        {d.floors.map(fp => (
          <div key={fp.id} className="floor-card" style={{ margin: 0, display: 'grid', gap: 6 }}>
            <div className="row between"><b>{fp.floor_label}</b><span className="muted small">{isDxf(fp) ? 'DXF' : 'PDF'}{fp.geometry ? ` · ${fp.geometry.rooms.length} phòng` : ''}</span></div>
            <div onDoubleClick={() => isDxf(fp) && setEdit(fp.id)} title={isDxf(fp) ? 'Nhấp đúp để mở trình chỉnh sửa' : 'Tầng PDF: chỉ xem'} style={{ cursor: isDxf(fp) ? 'zoom-in' : 'default' }}>
              <FloorThumb pid={p.id} fp={fp} tick={tick} fallback={fp.preview_path ? d.urls[fp.preview_path] : undefined} />
            </div>
            <div className="row gap" style={{ flexWrap: 'wrap' }}>
              {isDxf(fp) && <button className="btn sm primary" onClick={() => setEdit(fp.id)}>✎ Mở chỉnh sửa</button>}
              {canEdit && <label className="btn sm" title="Thay file mặt bằng của tầng này bằng bản mới">⬆ Cập nhật file<input type="file" accept="application/pdf,.dxf" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && confirm(`Cập nhật mặt bằng “${fp.floor_label}” bằng ${f.name}?`)) void run(async () => { await updateFloorPdf(fp, f, log); setTick(t => t + 1) }) }} /></label>}
              {canEdit && <button className="btn ghost sm danger" disabled={busy} onClick={() => confirm(`Xoá mặt bằng ${fp.floor_label}?`) && void run(async () => { await deleteFloorPlan(fp) })}>Xoá tầng</button>}
            </div>
          </div>))}
      </div>
    </div>
    {d.floors.length > 0 && <details className="small"><summary className="muted">Nâng cao: đọc phòng từ bản vẽ, nhóm nét tường, tỉ lệ, bề rộng cửa</summary><FloorPlans d={d} studio onAdded={() => setTick(t => t + 1)} /></details>}
    {edit && d.floors.some(f => f.id === edit) && <Plan3D full proj={{ id: p.id, floors: d.floors, d }} autoFloor={edit} onClose={() => { setEdit(''); setTick(t => t + 1) }} />}
  </div>
}

// Tab thử nghiệm "Đọc mặt bằng": tải PDF (chuẩn hình ảnh) và/hoặc DXF (dữ liệu bổ sung) → chọn layer (có gợi ý) → dựng lại tường/cột/cửa → tách không gian + diện tích.
// Có cả hai file: phần mềm tự dò tỉ lệ thật + khớp vị trí DXF lên PDF, gộp dữ liệu và chỉ ra chỗ hai file khác nhau. Không ghi gì vào dự án nào.
import { useEffect, useMemo, useRef, useState } from 'react'
import { readVectorPage, type VecPage } from '../lib/vector'
import PlanView from './PlanView'
import { planVector, type PlanVec } from '../lib/planSvg'
import { findWallFixes } from '../lib/planFix'
import { checkPlanWithAI, ISSUE_LABEL, type PlanIssue } from '../lib/planAi'
import { nameBareLayers, suggestRoles, readPlan, mergeDxf, renderPlan, type DxfMerge, type LayerRow, type PlanResult, type Role } from '../lib/planRead'

const ROLE: [Role, string][] = [['wall', 'Tường / cột'], ['door', 'Cửa'], ['arc', 'Cung cửa (phụ)'], ['skip', 'Bỏ']]
const key = (n: string) => 'dmvl.planread.' + n
const DX = '[DXF] '
type Dv = VecPage & { dxf?: { den: number } }

export default function PlanReader() {
  const [pdf, setPdf] = useState<File | null>(null), [dxf, setDxf] = useState<File | null>(null), [page, setPage] = useState(1), [den, setDen] = useState(200)
  const [pv, setPv] = useState<VecPage | null>(null), [dv, setDv] = useState<Dv | null>(null)
  const [pRows, setPRows] = useState<LayerRow[]>([]), [dRows, setDRows] = useState<LayerRow[]>([])
  const [res, setRes] = useState<PlanResult | null>(null), [mg, setMg] = useState<DxfMerge | null>(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [showRooms, setShowRooms] = useState(true), [showDoors, setShowDoors] = useState(true), [showLabels, setShowLabels] = useState(true), [showDiff, setShowDiff] = useState(true)
  const [issues, setIssues] = useState<PlanIssue[] | null>(null), [orig, setOrig] = useState<HTMLCanvasElement | null>(null), [showIssues, setShowIssues] = useState(true), [focus, setFocus] = useState<PlanIssue | null>(null)
  const bufRef = useRef<ArrayBuffer | null>(null), rd = useRef<((extra: number[][]) => Promise<PlanResult>) | null>(null)
  const [vec, setVec] = useState<PlanVec | null>(null), [fixMsg, setFixMsg] = useState('')

  const reset = () => { setErr(''); setFixMsg(''); rd.current = null; setRes(null); setMg(null); setIssues(null); setOrig(null); setFocus(null) }
  const saved = (name: string) => { try { return JSON.parse(localStorage.getItem(key(name)) ?? 'null') as Record<string, Role> | null } catch { return null } }
  const loadPdf = async (f: File, pg: number) => {
    reset(); setBusy('Đang đọc PDF…')
    try {
      const ab = await f.arrayBuffer(); bufRef.current = ab
      const v = await readVectorPage(ab, pg, s => setBusy(s), { draw: true }); nameBareLayers(v); const sug = suggestRoles(v), sv = saved(f.name)
      if (sv) for (const r of sug) if (sv[r.layer]) r.role = sv[r.layer]
      setPv(v); setPRows(sug)
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const loadDxf = async (f: File) => {
    reset(); setBusy('Đang đọc DXF…')
    try {
      const v = (await readVectorPage(await f.arrayBuffer(), 1, s => setBusy(s), { draw: true })) as Dv; const sug = suggestRoles(v), sv = saved(f.name)
      if (sv) for (const r of sug) if (sv[DX + r.layer]) r.role = sv[DX + r.layer]
      setDv(v); setDRows(sug)
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const run = async () => {
    const base = pv ?? dv; if (!base) return
    reset(); setBusy('Đang đọc mặt bằng…')
    const roles: Record<string, Role> = {}, dRoles: Record<string, Role> = {}
    if (pv) pRows.forEach(r => { roles[r.layer] = r.role }); dRows.forEach(r => { dRoles[DX + r.layer] = r.role })
    try {
      if (pdf) localStorage.setItem(key(pdf.name), JSON.stringify(roles)); if (dxf) localStorage.setItem(key(dxf.name), JSON.stringify(dRoles))
    } catch { /* bỏ qua */ }
    try {
      if (pv && dv) { // có cả hai: dò tỉ lệ thật + khớp vị trí, gộp dữ liệu
        const m = await mergeDxf(pv, roles, dv, den, setBusy, dRoles); setMg(m); setDen(Math.round(m.den))
        rd.current = ex => readPlan(m.merged, { ...roles, ...m.roles }, m.den, setBusy, ex)
      } else if (pv) rd.current = ex => readPlan(pv, roles, den, setBusy, ex)
      else { const d0 = dv!.dxf?.den ?? den; const r2: Record<string, Role> = {}; dRows.forEach(r => { r2[r.layer] = dRoles[DX + r.layer] }); setDen(d0); rd.current = ex => readPlan(dv!, r2, d0, setBusy, ex) }
      setRes(await rd.current!([]))
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const ai = async () => {
    if (!res || !bufRef.current || !pv) return
    setErr(''); setBusy('AI đang kiểm tra…'); setIssues(null)
    try { const r = await checkPlanWithAI(bufRef.current, page, res, pdf?.name ?? '', setBusy); setIssues(r.issues); setOrig(r.orig); setShowIssues(true) } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const fix = async () => {
    if (!res || !orig || !issues || !rd.current) return
    setErr(''); setFixMsg(''); setBusy('Tự sửa theo AI…')
    try {
      const rep = await findWallFixes(res, orig, issues, setBusy)
      if (!rep.segs.length) { setFixMsg(`Đã thử ${rep.tried} nét trong ${rep.boxes} khung nghi thiếu tường/vách nhưng không nét nào cắt được một không gian – chưa tự sửa được (có thể cần chọn thêm layer vách ở bảng layer rồi dựng lại).`) }
      else { const all = [...res.extra, ...rep.segs]; setBusy('Dựng lại với vách bổ sung…'); setRes(await rd.current(all)); setFixMsg(`Đã thêm ${rep.segs.length} vách (nét cam). Bấm “AI kiểm tra lỗi” lại để xem còn sai chỗ nào.`) }
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const undoFix = async () => { if (!rd.current) return; setBusy('Dựng lại…'); try { setRes(await rd.current([])); setFixMsg('Đã bỏ các vách tự thêm.') } catch (e) { setErr(String(e instanceof Error ? e.message : e)) } setBusy('') }
  useEffect(() => { let on = true; setVec(null); if (res) planVector(res).then(v => { if (on) setVec(v) }).catch(() => {}); return () => { on = false } }, [res])
  const canvas = useMemo(() => {
    if (!res) return null
    const c = renderPlan(res, { rooms: showRooms, doors: showDoors, labels: showLabels }), g = c.getContext('2d')!
    if (showDiff && mg) { g.lineWidth = 5; for (const d of mg.diffs) { g.strokeStyle = d.kind === 'dxfOnly' ? '#ff7a00' : '#b020c0'; g.strokeRect(d.x * res.ppp - 6, d.y * res.ppp - 6, d.w * res.ppp + 12, d.h * res.ppp + 12) } }
    if (showIssues && issues?.length) {
      g.lineWidth = 7; g.font = 'bold 56px Arial'; g.textAlign = 'left'
      for (const it of issues) { g.strokeStyle = '#d4202a'; g.strokeRect(it.box[0], it.box[1], it.box[2] - it.box[0], it.box[3] - it.box[1]); g.fillStyle = '#d4202a'; g.fillText(String(it.n), it.box[0] + 6, it.box[1] - 8) }
    }
    return c
  }, [res, mg, showRooms, showDoors, showLabels, showDiff, issues, showIssues])
  const crop = (src: HTMLCanvasElement | null, b: number[]) => {
    if (!src) return ''
    const m = 120, x = Math.max(0, b[0] - m), y = Math.max(0, b[1] - m), w = Math.min(src.width - x, b[2] - b[0] + 2 * m), h = Math.min(src.height - y, b[3] - b[1] + 2 * m)
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.85)
  }
  const png = () => { if (!canvas) return; const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = ((pdf ?? dxf)?.name ?? 'mat-bang').replace(/\.\w+$/, '') + '_doc.png'; a.click() }
  const orphan = res?.doors.filter(d => !d.hOk || !d.eOk).length ?? 0
  const bad = res?.rooms.filter(r => r.labelArea && Math.abs(r.area - r.labelArea) / r.labelArea > 0.08) ?? []
  const table = (title: string, rows: LayerRow[], set: (r: LayerRow[]) => void) => rows.length > 0 && <details open={!res} style={{ margin: '8px 0' }}><summary><b>Layer {title}</b></summary>
    <div style={{ maxHeight: 280, overflow: 'auto' }}><table className="tbl small"><tbody>
      {rows.map((r, i) => <tr key={r.layer}><td style={{ wordBreak: 'break-all' }}>{r.layer || '(không tên)'}</td><td className="muted">{r.segs} nét{r.fills ? ` · ${r.fills} tô` : ''}</td>
        <td><select value={r.role} onChange={e => set(rows.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}>{ROLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>)}
    </tbody></table></div></details>

  return (
    <div className="card concept">
      <h3 style={{ margin: 0 }}>Đọc mặt bằng <span className="muted small">– bản thử nghiệm: dựng lại tường · cột · cửa từ PDF và/hoặc DXF, tách không gian và đo diện tích (chưa ghi vào dự án nào)</span></h3>
      <div className="row wrap" style={{ gap: 14, margin: '10px 0', alignItems: 'flex-end' }}>
        <label className="small"><b>PDF</b> <span className="muted">(đúng về hình ảnh)</span><br /><input type="file" accept=".pdf" onChange={e => { const f = e.target.files?.[0]; if (f) { setPdf(f); loadPdf(f, page) } }} /></label>
        <label className="small"><b>DXF</b> <span className="muted">(bổ sung, so sánh – tuỳ chọn)</span><br /><input type="file" accept=".dxf" onChange={e => { const f = e.target.files?.[0]; if (f) { setDxf(f); loadDxf(f) } }} /></label>
        <label className="small">Trang PDF <input type="number" min={1} value={page} style={{ width: 56 }} onChange={e => setPage(Math.max(1, +e.target.value || 1))} /></label>
        <label className="small">Tỉ lệ 1: <input type="number" min={1} value={den} style={{ width: 70 }} disabled={!!(pv && dv)} onChange={e => setDen(Math.max(1, +e.target.value || 200))} /></label>
        {pdf && <button className="btn sm" disabled={!!busy} onClick={() => loadPdf(pdf, page)}>Đọc lại PDF</button>}
        {(pv || dv) && <button className="btn primary" disabled={!!busy} onClick={run}>▶ Dựng mặt bằng</button>}
        {busy && <span className="muted small">{busy}</span>}
      </div>
      <div className="muted small">{pv && dv ? 'Có cả PDF và DXF: tỉ lệ thật được tự dò từ DXF (PDF xuất ra thường không đúng tỉ lệ ghi trên khung tên) và hai file được khớp vị trí để bổ sung cho nhau.' : 'Chỉ có PDF thì phải nhập đúng tỉ lệ thật – sai tỉ lệ là sai diện tích. Tải thêm DXF để phần mềm tự dò.'}</div>
      {err && <div className="card" style={{ color: '#b00020' }}>{err}</div>}
      {table('PDF', pRows, setPRows)}
      {table(pv ? 'DXF (bổ sung)' : 'DXF', dRows, setDRows)}
      {res && <>
        <div className="row wrap small" style={{ gap: 14, margin: '6px 0' }}>
          <label><input type="checkbox" checked={showRooms} onChange={e => setShowRooms(e.target.checked)} /> Tô màu sàn</label>
          <label><input type="checkbox" checked={showDoors} onChange={e => setShowDoors(e.target.checked)} /> Cửa (xanh)</label>
          <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Số + diện tích</label>
          {mg && <label><input type="checkbox" checked={showDiff} onChange={e => setShowDiff(e.target.checked)} /> Chỗ PDF/DXF khác nhau</label>}
          <button className="btn sm" onClick={png}>⬇ Tải ảnh PNG</button>
          {pv && <button className="btn sm" disabled={!!busy} onClick={ai}>🤖 AI kiểm tra lỗi</button>}
          {issues && issues.length > 0 && <button className="btn sm primary" disabled={!!busy} title="Phần mềm tự tìm vách ngăn còn thiếu ở các khung đỏ rồi dựng lại" onClick={fix}>🛠 Tự sửa theo AI</button>}
          {res.extra.length > 0 && <button className="btn sm" disabled={!!busy} onClick={undoFix}>↩ Bỏ {res.extra.length} vách tự thêm</button>}
          {issues && <label><input type="checkbox" checked={showIssues} onChange={e => setShowIssues(e.target.checked)} /> Khung đỏ lỗi</label>}
          <span className="muted">{res.rooms.length} không gian · {res.doors.length} cửa quay (cánh đôi {res.doors.filter(d => d.pair).length}) · {res.closures.length} ô mở/trượt · tỉ lệ 1:{Math.round(res.mpp / (25.4 / 72 / 1000))}</span>
        </div>
        {mg && <div className="card small" style={{ background: '#f1f6ff' }}>
          <b>Khớp PDF ↔ DXF:</b> độ khớp {Math.round(mg.score * 100)}% · tỉ lệ thật <b>1:{Math.round(mg.den)}</b> ({mg.mmPerPt.toFixed(1)} mm/pt) · khung cam: {mg.nDxfOnly} chỗ chỉ DXF có tường · khung tím: {mg.nPdfOnly} chỗ chỉ PDF có tường.
          {mg.score < 0.5 && <div style={{ color: '#b00020' }}>Độ khớp thấp – có thể hai file không cùng một mặt bằng hoặc layer tường chọn chưa đúng.</div>}
        </div>}
        {(orphan > 0 || res.unresolved.length > 0 || bad.length > 0) && <div className="card small" style={{ background: '#fff8e6' }}>
          <b>Cần xem lại:</b>
          {orphan > 0 && <div>• {orphan} cửa có đầu chưa chạm tường (đã tự nối tới tường gần nhất nếu thấy).</div>}
          {res.unresolved.length > 0 && <div>• {res.unresolved.length} cụm nét cửa chưa phân loại được (vị trí pt): {res.unresolved.slice(0, 8).map(u => `(${Math.round(u.x)},${Math.round(u.y)}) ${u.len}m`).join(' · ')}</div>}
          {bad.length > 0 && <div>• {bad.length} phòng lệch diện tích ghi trong bản vẽ &gt; 8%: {bad.map(r => `#${r.id} ${r.area} vs ${r.labelArea}`).join(' · ')}</div>}
        </div>}
        {issues && <div className="card small" style={{ background: issues.length ? '#fff0f0' : '#eefaf0' }}>
          <b>AI kiểm tra: {issues.length ? `${issues.length} chỗ nghi sai` : 'không thấy lỗi rõ ràng'}</b> <span className="muted">– bấm “🛠 Tự sửa theo AI” để phần mềm tự thêm vách ngăn còn thiếu (chỉ nhận nét thật sự cắt được một không gian); bấm một dòng để xem hai ảnh cạnh nhau.</span>{fixMsg && <div style={{ margin: '4px 0', color: '#8a4b00' }}>{fixMsg}</div>}
          {issues.map(it => <div key={it.n} style={{ cursor: 'pointer', padding: '3px 0', fontWeight: focus?.n === it.n ? 700 : 400 }} onClick={() => setFocus(focus?.n === it.n ? null : it)}>
            <span className="pill" style={{ background: '#d4202a', color: '#fff' }}>{it.n}</span> <b>{ISSUE_LABEL[it.kind] ?? it.kind}</b>{it.rooms.length ? ` (không gian ${it.rooms.join(', ')})` : ''}: {it.note}{it.conf != null ? <span className="muted"> · {Math.round(it.conf * 100)}%</span> : null}</div>)}
          {focus && <div className="row" style={{ gap: 8, marginTop: 8 }}><div style={{ flex: 1 }}><div className="muted">Bản vẽ gốc</div><img src={crop(orig, focus.box)} style={{ width: '100%' }} /></div>
            <div style={{ flex: 1 }}><div className="muted">Bản dựng lại</div><img src={crop(canvas, focus.box)} style={{ width: '100%' }} /></div></div>}
        </div>}
        {vec ? <PlanView base={pv ?? dv} vec={vec} res={res} showRooms={showRooms} showDoors={showDoors} showLabels={showLabels} issues={showIssues ? issues : null} diffs={showDiff && mg ? mg.diffs : null} ppp={res.ppp} /> : <div className="muted small">Đang dựng bản vector…</div>}
        <details style={{ marginTop: 8 }}><summary><b>Danh sách không gian</b></summary>
          <table className="tbl small"><thead><tr><th>#</th><th>Diện tích (m²)</th><th>Ghi trên bản vẽ</th><th>Chữ trong phòng</th></tr></thead>
            <tbody>{[...res.rooms].sort((a, b) => b.area - a.area).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.area.toFixed(2)}</td><td>{r.labelArea ?? ''}</td><td>{r.names.join(' · ')}</td></tr>)}</tbody></table></details>
      </>}
    </div>)
}

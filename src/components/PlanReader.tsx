// Tab thử nghiệm "Đọc mặt bằng": tải PDF/DXF mặt bằng → chọn layer (có gợi ý) → dựng lại tường/cột/cửa → tách không gian + diện tích.
// Không ghi gì vào dự án nào (chỉ xem), để duyệt thuật toán trước khi áp vào các bước khác.
import { useEffect, useMemo, useRef, useState } from 'react'
import { readVectorPage, type VecPage } from '../lib/vector'
import { checkPlanWithAI, ISSUE_LABEL, type PlanIssue } from '../lib/planAi'
import { suggestRoles, readPlan, renderPlan, type LayerRow, type PlanResult, type Role } from '../lib/planRead'

const ROLE: [Role, string][] = [['wall', 'Tường / cột'], ['door', 'Cửa'], ['arc', 'Cung cửa (phụ)'], ['skip', 'Bỏ']]
const key = (n: string) => 'dmvl.planread.' + n

export default function PlanReader() {
  const [file, setFile] = useState<File | null>(null), [page, setPage] = useState(1), [den, setDen] = useState(200)
  const [vec, setVec] = useState<VecPage | null>(null), [rows, setRows] = useState<LayerRow[]>([])
  const [res, setRes] = useState<PlanResult | null>(null), [busy, setBusy] = useState(''), [err, setErr] = useState('')
  const [showRooms, setShowRooms] = useState(true), [showDoors, setShowDoors] = useState(true), [showLabels, setShowLabels] = useState(true)
  const host = useRef<HTMLDivElement>(null)
  const [issues, setIssues] = useState<PlanIssue[] | null>(null), [orig, setOrig] = useState<HTMLCanvasElement | null>(null), [showIssues, setShowIssues] = useState(true), [focus, setFocus] = useState<PlanIssue | null>(null)
  const bufRef = useRef<ArrayBuffer | null>(null)

  const load = async (f: File, pg: number) => {
    setErr(''); setRes(null); setIssues(null); setOrig(null); setFocus(null); setVec(null); setBusy('Đang đọc nét vẽ…')
    try {
      const ab = await f.arrayBuffer(); bufRef.current = ab
      const v = await readVectorPage(ab, pg, s => setBusy(s))
      const sug = suggestRoles(v)
      try { const saved = JSON.parse(localStorage.getItem(key(f.name)) ?? 'null') as Record<string, Role> | null; if (saved) for (const r of sug) if (saved[r.layer]) r.role = saved[r.layer] } catch { /* bỏ qua */ }
      setVec(v); setRows(sug)
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const run = async () => {
    if (!vec || !file) return
    setErr(''); setBusy('Đang đọc mặt bằng…')
    const roles: Record<string, Role> = {}; rows.forEach(r => { roles[r.layer] = r.role })
    try { localStorage.setItem(key(file.name), JSON.stringify(roles)) } catch { /* bỏ qua */ }
    setIssues(null); setOrig(null); setFocus(null)
    try { setRes(await readPlan(vec, roles, den, setBusy)) } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const ai = async () => {
    if (!res || !bufRef.current) return
    setErr(''); setBusy('AI đang kiểm tra…'); setIssues(null)
    try { const r = await checkPlanWithAI(bufRef.current, page, res, file?.name ?? '', setBusy); setIssues(r.issues); setOrig(r.orig); setShowIssues(true) } catch (e) { setErr(String(e instanceof Error ? e.message : e)) }
    setBusy('')
  }
  const canvas = useMemo(() => {
    if (!res) return null
    const c = renderPlan(res, { rooms: showRooms, doors: showDoors, labels: showLabels })
    if (showIssues && issues?.length) {
      const g = c.getContext('2d')!; g.lineWidth = 7; g.font = 'bold 56px Arial'; g.textAlign = 'left'
      for (const it of issues) { g.strokeStyle = '#d4202a'; g.strokeRect(it.box[0], it.box[1], it.box[2] - it.box[0], it.box[3] - it.box[1]); g.fillStyle = '#d4202a'; g.fillText(String(it.n), it.box[0] + 6, it.box[1] - 8) }
    }
    return c
  }, [res, showRooms, showDoors, showLabels, issues, showIssues])
  const crop = (src: HTMLCanvasElement | null, b: number[]) => {
    if (!src) return ''
    const m = 120, x = Math.max(0, b[0] - m), y = Math.max(0, b[1] - m), w = Math.min(src.width - x, b[2] - b[0] + 2 * m), h = Math.min(src.height - y, b[3] - b[1] + 2 * m)
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.85)
  }
  useEffect(() => { const h = host.current; if (!h || !canvas) return; h.innerHTML = ''; canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.background = '#fff'; h.appendChild(canvas) }, [canvas])
  const png = () => { if (!canvas) return; const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = (file?.name ?? 'mat-bang').replace(/\.\w+$/, '') + '_doc.png'; a.click() }
  const orphan = res?.doors.filter(d => !d.hOk || !d.eOk).length ?? 0
  const bad = res?.rooms.filter(r => r.labelArea && Math.abs(r.area - r.labelArea) / r.labelArea > 0.08) ?? []

  return (
    <div className="card concept">
      <h3 style={{ margin: 0 }}>Đọc mặt bằng <span className="muted small">– bản thử nghiệm: dựng lại tường · cột · cửa từ PDF/DXF, tách không gian và đo diện tích (chưa ghi vào dự án nào)</span></h3>
      <div className="row wrap" style={{ gap: 10, margin: '10px 0', alignItems: 'center' }}>
        <input type="file" accept=".pdf,.dxf" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); load(f, page) } }} />
        <label className="small">Trang <input type="number" min={1} value={page} style={{ width: 56 }} onChange={e => setPage(Math.max(1, +e.target.value || 1))} /></label>
        <label className="small">Tỉ lệ 1: <input type="number" min={1} value={den} style={{ width: 70 }} onChange={e => setDen(Math.max(1, +e.target.value || 200))} /></label>
        {file && <button className="btn sm" disabled={!!busy} onClick={() => load(file, page)}>Đọc lại file</button>}
        {vec && <button className="btn primary" disabled={!!busy} onClick={run}>▶ Dựng mặt bằng</button>}
        {busy && <span className="muted small">{busy}</span>}
      </div>
      {err && <div className="card" style={{ color: '#b00020' }}>{err}</div>}
      {vec && <details open={!res} style={{ margin: '8px 0' }}><summary><b>Layer</b> <span className="muted small">– phần mềm đã gợi ý theo tên; đổi nếu sai (lựa chọn được nhớ theo tên file). “Cung cửa (phụ)” dành cho layer chỉ chứa cung quay của cửa.</span></summary>
        <div style={{ maxHeight: 320, overflow: 'auto' }}><table className="tbl small"><tbody>
          {rows.map((r, i) => <tr key={r.layer}><td style={{ wordBreak: 'break-all' }}>{r.layer || '(không tên)'}</td><td className="muted">{r.segs} nét{r.fills ? ` · ${r.fills} tô` : ''}</td>
            <td><select value={r.role} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}>{ROLE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>)}
        </tbody></table></div></details>}
      {res && <>
        <div className="row wrap small" style={{ gap: 14, margin: '6px 0' }}>
          <label><input type="checkbox" checked={showRooms} onChange={e => setShowRooms(e.target.checked)} /> Tô màu sàn</label>
          <label><input type="checkbox" checked={showDoors} onChange={e => setShowDoors(e.target.checked)} /> Cửa (xanh)</label>
          <label><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Số + diện tích</label>
          <button className="btn sm" onClick={png}>⬇ Tải ảnh PNG</button>
          <button className="btn sm" disabled={!!busy} onClick={ai}>🤖 AI kiểm tra lỗi</button>
          {issues && <label><input type="checkbox" checked={showIssues} onChange={e => setShowIssues(e.target.checked)} /> Khung đỏ lỗi</label>}
          <span className="muted">{res.rooms.length} không gian · {res.doors.length} cửa quay (cánh đôi {res.doors.filter(d => d.pair).length}) · {res.closures.length} ô mở/trượt</span>
        </div>
        {(orphan > 0 || res.unresolved.length > 0 || bad.length > 0) && <div className="card small" style={{ background: '#fff8e6' }}>
          <b>Cần xem lại:</b>
          {orphan > 0 && <div>• {orphan} cửa có đầu chưa chạm tường (đã tự nối tới tường gần nhất nếu thấy).</div>}
          {res.unresolved.length > 0 && <div>• {res.unresolved.length} cụm nét cửa chưa phân loại được (vị trí pt): {res.unresolved.slice(0, 8).map(u => `(${Math.round(u.x)},${Math.round(u.y)}) ${u.len}m`).join(' · ')}</div>}
          {bad.length > 0 && <div>• {bad.length} phòng lệch diện tích ghi trong bản vẽ &gt; 8%: {bad.map(r => `#${r.id} ${r.area} vs ${r.labelArea}`).join(' · ')}</div>}
        </div>}
        {issues && <div className="card small" style={{ background: issues.length ? '#fff0f0' : '#eefaf0' }}>
          <b>AI kiểm tra: {issues.length ? `${issues.length} chỗ nghi sai` : 'không thấy lỗi rõ ràng'}</b> <span className="muted">– chỉ là gợi ý để bạn xem, phần mềm không tự sửa. Bấm một dòng để xem hai ảnh cạnh nhau.</span>
          {issues.map(it => <div key={it.n} style={{ cursor: 'pointer', padding: '3px 0', fontWeight: focus?.n === it.n ? 700 : 400 }} onClick={() => setFocus(focus?.n === it.n ? null : it)}>
            <span className="pill" style={{ background: '#d4202a', color: '#fff' }}>{it.n}</span> <b>{ISSUE_LABEL[it.kind] ?? it.kind}</b>{it.rooms.length ? ` (không gian ${it.rooms.join(', ')})` : ''}: {it.note}{it.conf != null ? <span className="muted"> · {Math.round(it.conf * 100)}%</span> : null}</div>)}
          {focus && <div className="row" style={{ gap: 8, marginTop: 8 }}><div style={{ flex: 1 }}><div className="muted">Bản vẽ gốc</div><img src={crop(orig, focus.box)} style={{ width: '100%' }} /></div>
            <div style={{ flex: 1 }}><div className="muted">Bản dựng lại</div><img src={crop(canvas, focus.box)} style={{ width: '100%' }} /></div></div>}
        </div>}
        <div ref={host} style={{ border: '1px solid #ddd', overflow: 'auto', maxHeight: '75vh' }} />
        <details style={{ marginTop: 8 }}><summary><b>Danh sách không gian</b></summary>
          <table className="tbl small"><thead><tr><th>#</th><th>Diện tích (m²)</th><th>Ghi trên bản vẽ</th><th>Chữ trong phòng</th></tr></thead>
            <tbody>{[...res.rooms].sort((a, b) => b.area - a.area).map(r => <tr key={r.id}><td>{r.id}</td><td>{r.area.toFixed(2)}</td><td>{r.labelArea ?? ''}</td><td>{r.names.join(' · ')}</td></tr>)}</tbody></table></details>
      </>}
    </div>)
}

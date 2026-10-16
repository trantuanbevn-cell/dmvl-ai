import { useEffect, useMemo, useRef, useState } from 'react'
import { syncEnglish } from '../../lib/translateEn'
import { useAuth } from '../../lib/auth'
import { exportExcel, filterEntries, exportBaseName } from '../../lib/exportExcel'
import { printSchedule, buildScheduleHtml } from '../../lib/exportPrint'
import { supabase } from '../../lib/supabase'
import { allSections, bandTitle, PRESETS, defaultOpts, groupBySection, planSheets, type ExportOpts, type SheetTarget, type Lang } from '../../lib/sections'
import type { ProjectData } from '../../lib/useProject'

const TARGETS: [SheetTarget, string][] = [['main', 'Sheet chính'], ['own', 'Sheet riêng'], ['c1', 'Sheet phụ 1'], ['c2', 'Sheet phụ 2']]
const sameAssign = (a: Record<string, SheetTarget>, b: Record<string, SheetTarget>) => Object.keys({ ...a, ...b }).every(k => (a[k] ?? 'main') === (b[k] ?? 'main'))

export default function ExportTab({ d }: { d: ProjectData }) {
  const key = 'dmvl-export-' + d.project!.id
  const [o, setO] = useState<ExportOpts>(() => { try { return { ...defaultOpts(), ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return defaultOpts() } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(o)) } catch { /* */ } }, [o, key])
  const [busy, setBusy] = useState('')
  const list = useMemo(() => filterEntries(d.entries, o.includePending), [d.entries, o.includePending])
  const groups = useMemo(() => groupBySection(list), [list])
  const sheets = useMemo(() => planSheets(groups, o), [groups, o])
  const n = list.length
  const pend = d.entries.filter(e => e.status === 'pending' || e.status === 'review').length
  const roomsMissing = d.rooms.filter(r => !d.occ.some(x => x.room_id === r.id)).length
  const { canEdit } = useAuth()
  const dRef = useRef(d); dRef.current = d
  const mk = (x: ProjectData) => ({ project: x.project!, rooms: x.rooms, pages: x.pages, entries: x.entries, occ: x.occ })
  // Trước khi xuất bản EN / song ngữ: đồng bộ lại toàn bộ tiếng Anh với tiếng Việt để file luôn đúng
  const go = async (label: string, fn: (data: ReturnType<typeof mk>) => Promise<void>) => {
    setBusy(label)
    try {
      await d.reload()   // luôn tải lại toàn bộ dữ liệu mới nhất trước khi xuất
      if (o.lang !== 'vn' && canEdit) {
        const r = await syncEnglish(d.latest() as ProjectData)
        if (r.done) await d.reload()
        if (r.failed > 0 && !confirm(`Còn ${r.failed} ô tiếng Anh chưa dịch được (AI lỗi hoặc hết hạn mức). Vẫn xuất file?`)) { setBusy(''); return }
      }
      await fn(mk(d.latest() as ProjectData))
    } catch (e) { alert(String(e)) }
    setBusy('')
  }
  const set = (p: Partial<ExportOpts>) => setO({ ...o, ...p })
  // Thông tin dự án (sửa được ngay tại đây)
  const pj = d.project!
  const [info, setInfo] = useState({ name: pj.name ?? '', location: pj.location ?? '', client: pj.client ?? '', item_name: pj.item_name ?? '' })
  useEffect(() => { setInfo({ name: pj.name ?? '', location: pj.location ?? '', client: pj.client ?? '', item_name: pj.item_name ?? '' }) }, [pj.id, pj.name, pj.location, pj.client, pj.item_name])
  const dirty = info.name !== (pj.name ?? '') || info.location !== (pj.location ?? '') || info.client !== (pj.client ?? '') || info.item_name !== (pj.item_name ?? '')
  const saveInfo = async () => {
    if (!info.name.trim()) return alert('Tên dự án không được để trống')
    const { error } = await supabase.from('projects').update({ name: info.name.trim(), location: info.location.trim() || null, client: info.client.trim() || null, item_name: info.item_name.trim() || null }).eq('id', pj.id)
    if (error) return alert(error.message)
    await d.reload()
  }
  // Xem trước ngay trong phần mềm (bản HTML giống bản PDF)
  const [prev, setPrev] = useState<{ html: string } | 'loading' | null>(null)
  const preview = async () => {
    setPrev('loading')
    try {
      await d.reload()   // xem trước luôn theo dữ liệu mới nhất (không dùng bản đã tải từ trước)
      if (o.lang !== 'vn' && canEdit) { const r = await syncEnglish(d.latest() as ProjectData); if (r.done) await d.reload() }
      setPrev({ html: await buildScheduleHtml(mk(d.latest() as ProjectData), o, false) })
    } catch (e) { alert(String(e)); setPrev(null) }
  }
  const shown = allSections().filter(s => (groups.find(g => g.section.key === s.key)?.items.length ?? 0) > 0)
  let lastBand = ''
  return (
    <div className="card stack">
      <h3>Xuất bảng danh mục</h3>
      <div className="card" style={{ background: 'var(--bg2, #faf6f1)' }}>
        <div className="row between"><h4 style={{ margin: 0 }}>Thông tin dự án</h4>{dirty && canEdit && <button className="btn primary sm" onClick={saveInfo}>💾 Lưu thông tin</button>}</div>
        <div className="row gap small" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          <label>Tên dự án <input value={info.name} disabled={!canEdit} onChange={e => setInfo({ ...info, name: e.target.value })} style={{ width: 240 }} /></label>
          <label>Hạng mục <input value={info.item_name} disabled={!canEdit} onChange={e => setInfo({ ...info, item_name: e.target.value })} placeholder="vd: Nhà hàng tầng 5" style={{ width: 200 }} /></label>
          <label>Địa chỉ <input value={info.location} disabled={!canEdit} onChange={e => setInfo({ ...info, location: e.target.value })} style={{ width: 280 }} /></label>
          <label>Chủ đầu tư <input value={info.client} disabled={!canEdit} onChange={e => setInfo({ ...info, client: e.target.value })} style={{ width: 200 }} /></label>
        </div>
        <div className="small muted" style={{ marginTop: 4 }}>Tên file xuất: <b>{exportBaseName({ name: info.name, item_name: info.item_name })}.xlsx</b></div>
      </div>
      <p className="muted">Phần mềm <b>tổng hợp mọi phòng</b> lại: vật liệu giống nhau ở nhiều phòng chỉ là một dòng, cột "Vị trí" liệt kê đủ các phòng và trang concept, và <b>ký hiệu được đánh số đồng bộ</b> trong cả file. Các mục xếp đúng thứ tự như bảng DMVL của công ty (sàn – tường – trần trước, rồi vật liệu khác, nội thất, thiết bị, decor, artwork).</p>
      {roomsMissing > 0 && <div className="note">⚠ Còn {roomsMissing} phòng chưa có hạng mục nào – kiểm tra lại bước “Theo phòng” trước khi xuất.</div>}

      <div className="row gap sm-gap"><b>Ngôn ngữ & ký hiệu:</b>
        {([['vn', 'Tiếng Việt (SG1, DA1, TH1…)'], ['en', 'English (CT-01, ST-01…)'], ['both', 'Song ngữ cả hai']] as [Lang, string][]).map(([k, l]) => <button key={k} className={'chip' + (o.lang === k ? ' on' : '')} onClick={() => set({ lang: k })}>{l}</button>)}</div>
      <div className="row gap">
        <label className="row sm-gap"><input type="checkbox" checked={o.includePending} onChange={e => set({ includePending: e.target.checked })} /> Gồm cả mã chưa duyệt ({pend}) – bản nháp nội bộ</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.renumber} onChange={e => set({ renumber: e.target.checked })} /> Đánh lại số liên tục (bỏ khoảng trống do mã bị loại)</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.roomSheet} onChange={e => set({ roomSheet: e.target.checked })} /> Thêm sheet “Theo phòng”</label>
        <label className="row sm-gap"><input type="checkbox" checked={!!o.legend} onChange={e => set({ legend: e.target.checked })} /> Thêm sheet “Chú giải ký hiệu”</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.quote} onChange={e => set({ quote: e.target.checked })} /> Thêm cột báo giá (Số lượng · Đơn giá · Thành tiền, có tổng cộng)</label>
      </div>

      <div className="card" style={{ background: 'var(--bg2, #faf6f1)' }}>
        <div className="row between"><h4 style={{ margin: 0 }}>Gộp hay tách sheet</h4><span className="small muted">Sẽ tạo {sheets.length} sheet: {sheets.map(s => s.name).join(' · ')}</span></div>
        <div className="chips" style={{ margin: '8px 0' }}>{PRESETS.map(p => <button key={p.key} className={'chip' + (sameAssign(o.assign, p.make()) ? ' on' : '')} onClick={() => set({ assign: p.make() })}>{p.label}</button>)}</div>
        <div className="row gap small" style={{ marginBottom: 6 }}>
          <label>Tên sheet chính <input value={o.names.main} onChange={e => set({ names: { ...o.names, main: e.target.value } })} style={{ width: 130 }} /></label>
          <label>Sheet phụ 1 <input value={o.names.c1} onChange={e => set({ names: { ...o.names, c1: e.target.value } })} style={{ width: 130 }} /></label>
          <label>Sheet phụ 2 <input value={o.names.c2} onChange={e => set({ names: { ...o.names, c2: e.target.value } })} style={{ width: 130 }} /></label>
        </div>
        <table className="tbl"><tbody>
          {shown.map(s => {
            const cnt = groups.find(g => g.section.key === s.key)?.items.length ?? 0
            const band = s.band !== lastBand ? s.band : null; lastBand = s.band
            const cur = o.assign[s.key] ?? 'main'
            return [band && <tr key={'b' + s.band}><td colSpan={3} className="small" style={{ background: '#f1e8de', fontWeight: 700 }}>{bandTitle(s.band, 'vn')}</td></tr>,
              <tr key={s.key}><td>{s.vn} <span className="muted small">/ {s.en}</span></td><td style={{ width: 60 }}>{cnt} mã</td>
                <td><div className="chips">{TARGETS.map(([k, l]) => <button key={k} className={'chip' + (cur === k ? ' on' : '')} onClick={() => set({ assign: { ...o.assign, [s.key]: k } })}>{l}</button>)}</div></td></tr>]
          })}
        </tbody></table>
        <p className="small muted">“Sheet riêng” = mục đó thành một sheet độc lập (vd tách Nội thất rời để lập danh mục/báo giá riêng cho chủ đầu tư). “Sheet phụ 1/2” = gộp nhiều mục vào cùng một sheet phụ (vd Nội thất liền tường + rời). Lựa chọn được nhớ cho dự án này.</p>
      </div>

      <div className="small">Sẽ xuất <b>{n}</b> mã{!o.includePending && pend > 0 ? ` (còn ${pend} mã chờ duyệt không được xuất)` : ''}.</div>
      <div className="row gap">
        <button className="btn" disabled={!!busy || !n || prev === 'loading'} onClick={preview}>👁 Xem trước</button>
        <button className="btn primary" disabled={!!busy || !n} onClick={() => go('xlsx', data => exportExcel(data, o))}>⬇ Xuất Excel</button>
        <button className="btn" disabled={!!busy || !n} onClick={() => go('pdf', data => printSchedule(data, o))}>🖨 Xuất PDF</button>
        {busy && <span className="spinner" />}
      </div>
      {prev && <div className="modal-bg" style={{ zIndex: 80 }} onMouseDown={e => { if (e.target === e.currentTarget && prev !== 'loading') setPrev(null) }}>
        <div className="modal" style={{ width: '95vw', maxWidth: 'none', height: '90vh', display: 'flex', flexDirection: 'column' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>Xem trước bảng danh mục ({n} mã)</h3><button className="btn ghost sm" onClick={() => setPrev(null)}>✕ Đóng</button></div>
          {prev === 'loading' ? <div className="row gap" style={{ padding: 30 }}><span className="spinner" /> Đang dựng bản xem trước…</div>
            : <iframe title="preview" srcDoc={prev.html} style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, background: '#fff', marginTop: 8 }} />}
          <div className="small muted" style={{ marginTop: 6 }}>Bản xem trước theo dạng bảng giống file PDF; file Excel có cùng nội dung, bố cục sheet theo lựa chọn ở trên.</div>
        </div></div>}
      <p className="small muted">PDF: trang in mở ra trong tab mới → chọn “Lưu dưới dạng PDF”, khổ A3 ngang; mỗi sheet bắt đầu ở một trang mới.</p>
    </div>
  )
}

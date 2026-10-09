import { useEffect, useMemo, useRef, useState } from 'react'
import { syncEnglish } from '../../lib/translateEn'
import { useAuth } from '../../lib/auth'
import { exportExcel, filterEntries } from '../../lib/exportExcel'
import { printSchedule } from '../../lib/exportPrint'
import { allSections, bandTitle, PRESETS, defaultOpts, groupBySection, planSheets, type ExportOpts, type SheetTarget, type Lang } from '../../lib/sections'
import type { ProjectData } from '../../lib/useProject'

const TARGETS: [SheetTarget, string][] = [['main', 'Sheet chính'], ['own', 'Sheet riêng'], ['c1', 'Sheet phụ 1'], ['c2', 'Sheet phụ 2']]

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
      if (o.lang !== 'vn' && canEdit) {
        const r = await syncEnglish(d)
        if (r.done) { await d.reload(); await new Promise(res => setTimeout(res, 300)) }
        if (r.failed > 0 && !confirm(`Còn ${r.failed} ô tiếng Anh chưa dịch được (AI lỗi hoặc hết hạn mức). Vẫn xuất file?`)) { setBusy(''); return }
      }
      await fn(mk(dRef.current))
    } catch (e) { alert(String(e)) }
    setBusy('')
  }
  const set = (p: Partial<ExportOpts>) => setO({ ...o, ...p })
  let lastBand = ''
  return (
    <div className="card stack">
      <h3>Xuất bảng danh mục</h3>
      <p className="muted">Phần mềm <b>tổng hợp mọi phòng</b> lại: vật liệu giống nhau ở nhiều phòng chỉ là một dòng, cột "Vị trí" liệt kê đủ các phòng và trang concept, và <b>ký hiệu được đánh số đồng bộ</b> trong cả file. Các mục xếp đúng thứ tự như bảng DMVL của công ty (sàn – tường – trần trước, rồi vật liệu khác, nội thất, thiết bị, decor, artwork).</p>
      {roomsMissing > 0 && <div className="note">⚠ Còn {roomsMissing} phòng chưa có hạng mục nào – kiểm tra lại bước “Theo phòng” trước khi xuất.</div>}

      <div className="row gap sm-gap"><b>Ngôn ngữ & ký hiệu:</b>
        {([['vn', 'Tiếng Việt (SG1, DA1, TH1…)'], ['en', 'English (CT-01, ST-01…)'], ['both', 'Song ngữ cả hai']] as [Lang, string][]).map(([k, l]) => <button key={k} className={'chip' + (o.lang === k ? ' on' : '')} onClick={() => set({ lang: k })}>{l}</button>)}</div>
      <div className="row gap">
        <label className="row sm-gap"><input type="checkbox" checked={o.includePending} onChange={e => set({ includePending: e.target.checked })} /> Gồm cả mã chưa duyệt ({pend}) – bản nháp nội bộ</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.renumber} onChange={e => set({ renumber: e.target.checked })} /> Đánh lại số liên tục (bỏ khoảng trống do mã bị loại)</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.roomSheet} onChange={e => set({ roomSheet: e.target.checked })} /> Thêm sheet “Theo phòng”</label>
        <label className="row sm-gap"><input type="checkbox" checked={o.quote} onChange={e => set({ quote: e.target.checked })} /> Thêm cột báo giá (Số lượng · Đơn giá · Thành tiền, có tổng cộng)</label>
      </div>

      <div className="card" style={{ background: 'var(--bg2, #faf6f1)' }}>
        <div className="row between"><h4 style={{ margin: 0 }}>Gộp hay tách sheet</h4><span className="small muted">Sẽ tạo {sheets.length} sheet: {sheets.map(s => s.name).join(' · ')}</span></div>
        <div className="chips" style={{ margin: '8px 0' }}>{PRESETS.map(p => <button key={p.key} className="chip" onClick={() => set({ assign: p.make() })}>{p.label}</button>)}</div>
        <div className="row gap small" style={{ marginBottom: 6 }}>
          <label>Tên sheet chính <input value={o.names.main} onChange={e => set({ names: { ...o.names, main: e.target.value } })} style={{ width: 130 }} /></label>
          <label>Sheet phụ 1 <input value={o.names.c1} onChange={e => set({ names: { ...o.names, c1: e.target.value } })} style={{ width: 130 }} /></label>
          <label>Sheet phụ 2 <input value={o.names.c2} onChange={e => set({ names: { ...o.names, c2: e.target.value } })} style={{ width: 130 }} /></label>
        </div>
        <table className="tbl"><tbody>
          {allSections().map(s => {
            const cnt = groups.find(g => g.section.key === s.key)?.items.length ?? 0
            const band = s.band !== lastBand ? s.band : null; lastBand = s.band
            return [band && <tr key={'b' + s.band}><td colSpan={3} className="small" style={{ background: '#f1e8de', fontWeight: 700 }}>{bandTitle(s.band, 'vn')}</td></tr>,
              <tr key={s.key} style={cnt ? undefined : { opacity: .45 }}><td>{s.vn} <span className="muted small">/ {s.en}</span></td><td style={{ width: 60 }}>{cnt} mã</td>
                <td style={{ width: 150 }}><select value={o.assign[s.key] ?? 'main'} onChange={e => set({ assign: { ...o.assign, [s.key]: e.target.value as SheetTarget } })}>{TARGETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>]
          })}
        </tbody></table>
        <p className="small muted">“Sheet riêng” = mục đó thành một sheet độc lập (vd tách Nội thất rời để lập danh mục/báo giá riêng cho chủ đầu tư). “Sheet phụ 1/2” = gộp nhiều mục vào cùng một sheet phụ (vd Nội thất liền tường + rời). Lựa chọn được nhớ cho dự án này.</p>
      </div>

      <div className="small">Sẽ xuất <b>{n}</b> mã{!o.includePending && pend > 0 ? ` (còn ${pend} mã chờ duyệt không được xuất)` : ''}.</div>
      <div className="row gap">
        <button className="btn primary" disabled={!!busy || !n} onClick={() => go('xlsx', data => exportExcel(data, o))}>⬇ Xuất Excel</button>
        <button className="btn" disabled={!!busy || !n} onClick={() => go('pdf', data => printSchedule(data, o))}>🖨 Xuất PDF</button>
        {busy && <span className="spinner" />}
      </div>
      <p className="small muted">PDF: trang in mở ra trong tab mới → chọn “Lưu dưới dạng PDF”, khổ A3 ngang; mỗi sheet bắt đầu ở một trang mới.</p>
    </div>
  )
}

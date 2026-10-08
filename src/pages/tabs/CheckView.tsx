import { useMemo, useState } from 'react'
import type { ProjectData } from '../../lib/useProject'
import type { Entry } from '../../lib/types'
import { findDuplicates, mergeEntries, type DupPair } from '../../lib/merge'
import { locationsOf } from '../../lib/locations'
import { toast } from '../../lib/toast'
import { useAuth } from '../../lib/auth'
import OccCrop from '../../components/OccCrop'
import EntryPanel from '../../components/EntryPanel'
import { checkEntries } from '../../lib/checks'
import { linkSuggestions, linkConflicts, linkEntries, resyncGroup } from '../../lib/entryLink'
import type { Lang } from '../../lib/sections'

function Side({ d, e, tag, onKeep, busy }: { d: ProjectData; e: Entry; tag: string; onKeep?: () => void; busy: boolean }) {
  const shots = d.occ.filter(o => o.entry_id === e.id && o.bbox && o.page_id)
  const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
  const row = (k: string, v?: string | null) => v ? <div className="dc-row"><span>{k}</span>{v}</div> : null
  return (
    <div className="dc-side">
      <div className="dc-head"><b className="code big-code">{e.code}</b> <b>{e.name_vn}</b> <span className="src">{tag}</span></div>
      <div className="dc-shots">{shots.slice(0, 4).map(o => <OccCrop key={o.id} d={d} o={o} height={190} maxWidth={300} />)}
        {!shots.length && <div className="ic-none wide" style={e.color_hex ? { background: e.color_hex } : undefined}><span>Chưa có ảnh crop</span></div>}
        {e.color_hex && <span className="swatch" style={{ background: e.color_hex, height: 190, width: 90 }}><span>{e.color_hex}</span></span>}</div>
      {row('Vật liệu', e.material_vn)}{row('Thông số', e.desc_vn)}{row('Bộ phận', e.part_vn)}{row('Hãng', [e.brand, e.product_code].filter(Boolean).join(' · '))}{row('Xuất xứ', e.origin)}
      <div className="dc-row"><span>Có ở</span>{locs.length ? locs.map(l => <span key={l.room.id} className="loc-tag">{l.room.code} {l.room.name_vn}</span>) : 'chưa gán phòng'}</div>
      {onKeep && <button className="btn primary" disabled={busy} onClick={onKeep}>Gộp – giữ mã {e.code}</button>}
    </div>
  )
}

export default function CheckView({ d }: { d: ProjectData }) {
  const { canEdit } = useAuth()
  const [skip, setSkip] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('dmvl-dup-skip') ?? '[]') } catch { return [] } })
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null) // khoá cặp đang xem chi tiết
  const [lang, setLang] = useState<Lang>('vn')
  const [sel, setSel] = useState<string | null>(null)
  const [ran, setRan] = useState<{ at: Date; n: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [lskip, setLskip] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('dmvl-link-skip') ?? '[]') } catch { return [] } })
  const issues = useMemo(() => checkEntries(d, lang), [d.entries, d.occ, lang])
  const nErr = issues.filter(r => r.issues.some(i => i.kind === 'err')).length
  const sugg = useMemo(() => linkSuggestions(d.entries).filter(x => !lskip.includes(x.a.id + x.b.id)), [d.entries, lskip])
  const conflicts = useMemo(() => linkConflicts(d.entries), [d.entries])
  const selEntry = d.entries.find(e => e.id === sel)
  const keyOf = (p: DupPair) => p.keep.id + p.dup.id
  const dups = useMemo(() => findDuplicates(d.entries).filter(p => !skip.includes(keyOf(p))), [d.entries, skip])
  const cur = dups.findIndex(p => keyOf(p) === open), pair = cur >= 0 ? dups[cur] : null
  const dismiss = (p: DupPair) => { const n = [...skip, keyOf(p)]; setSkip(n); try { localStorage.setItem('dmvl-dup-skip', JSON.stringify(n)) } catch { /* */ } }
  const merge = async (keep: Entry, dup: Entry) => {
    setBusy(true)
    try { await mergeEntries(keep, dup, d.entries); toast(`Đã gộp ${dup.code} vào ${keep.code}`, 'ok'); setOpen(null) } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  /** Rà lại toàn bộ: tải lại dữ liệu mới nhất từ mọi người đang sửa rồi tính lại mọi kiểm tra */
  const runAll = async () => {
    setRunning(true)
    try { await d.reload(); setRan({ at: new Date(), n: 0 }); toast('Đã rà lại toàn bộ danh mục theo dữ liệu mới nhất', 'ok') } catch (e) { toast(String(e)) }
    setRunning(false)
  }
  const linkSkip = (a: Entry, b: Entry) => { const n = [...lskip, a.id + b.id]; setLskip(n); try { localStorage.setItem('dmvl-link-skip', JSON.stringify(n)) } catch { /* */ } }
  const go = (dir: number) => { const n = dups[cur + dir]; setOpen(n ? keyOf(n) : null) }
  return (
    <div className="stack">
      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>Rà soát toàn bộ danh mục</h3>
            <div className="small muted">{ran ? `Đã chạy lúc ${ran.at.toLocaleTimeString('vi-VN')} – ` : ''}{dups.length} mã nghi trùng · {issues.length} mã có vấn đề ({nErr} sai/lệch) · {sugg.length} gợi ý liên kết · {conflicts.length} nhóm liên kết lệch</div></div>
          <div className="row gap">
            <select value={lang} onChange={e => setLang(e.target.value as Lang)} title="Ngôn ngữ dùng để kiểm tra ô thiếu"><option value="vn">Kiểm tiếng Việt</option><option value="both">Kiểm song ngữ</option></select>
            <button className="btn primary" disabled={running} onClick={runAll}>{running ? 'Đang rà…' : '▶ Chạy kiểm tra lại toàn bộ'}</button>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>Dùng ở bước cuối, sau khi mọi người đã nhập xong: nút này tải lại dữ liệu mới nhất rồi rà lại mã trùng, thông tin thiếu/sai và các mã liên kết.</p>
      </div>
      <div className="card">
        <h3>Mã sai hoặc thiếu thông tin ({issues.length})</h3>
        {!issues.length ? <div className="ok-text">✓ Không phát hiện mã nào sai hoặc thiếu thông tin.</div> : (
          <div style={{ overflowX: 'auto' }}><table className="tbl small" style={{ width: '100%' }}>
            <thead><tr><th>Mã</th><th>Hạng mục</th><th>Vấn đề cần xử lý</th><th>Phòng</th><th /></tr></thead>
            <tbody>{issues.map(({ e, issues: is }) => (
              <tr key={e.id}>
                <td><b className="code">{e.code}</b></td>
                <td>{e.name_vn}</td>
                <td>{is.map((i, k) => <span key={k} className={'chk-tag chk-' + i.kind}>{i.text}</span>)}</td>
                <td className="small">{locationsOf(e.id, d.occ, d.rooms, d.pages).map(l => l.room.code).join(', ') || '—'}</td>
                <td><button className="btn sm" onClick={() => setSel(e.id)}>Mở & sửa</button></td>
              </tr>))}</tbody>
          </table></div>)}
      </div>
      {(sugg.length > 0 || conflicts.length > 0) && <div className="card">
        <h3>Vật liệu liên kết với nhau</h3>
        <p className="small muted">Các mã dùng chung một vật liệu/màu thật (vd cùng mã sơn xanh dùng cho tường và cho tranh). Khi đã liên kết, sửa mã sản phẩm, màu, hãng, xuất xứ, link ở một mã thì các mã kia tự đổi theo.</p>
        {conflicts.map(c => (
          <div key={c.link_id} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><span className="chk-tag chk-err">Đang lệch</span> {c.members.map(m => <b key={m.id} style={{ marginRight: 8 }}>{m.code}</b>)}<div className="small muted">Khác nhau ở: {c.keys.join(', ')}</div></div>
            {canEdit && c.members.map(m => <button key={m.id} className="btn sm" onClick={async () => { try { await resyncGroup(m, c.members); d.reload() } catch (e) { toast(String(e)) } }}>Đồng bộ theo {m.code}</button>)}
          </div>))}
        {sugg.map(({ a, b, why }) => (
          <div key={a.id + b.id} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><b>{a.code}</b> {a.name_vn}<br /><b>{b.code}</b> {b.name_vn}<div className="small muted">Gợi ý liên kết: {why}</div></div>
            {canEdit && <><button className="btn primary sm" onClick={async () => { try { await linkEntries(a, b, d.entries); d.reload() } catch (e) { toast(String(e)) } }}>🔗 Liên kết (theo {a.code})</button>
              <button className="btn ghost sm" onClick={() => linkSkip(a, b)}>Không liên quan</button></>}
          </div>))}
      </div>}
      <div className="card">
        <h3>Kiểm tra mã trùng ({dups.length})</h3>
        <p className="small muted">Cùng một vật liệu thật nhưng đang có nhiều mã (thường do nhiều góc camera hoặc do nhiều người cùng thêm). Bấm <b>Xem chi tiết</b> để so hai mã cạnh nhau kèm ảnh crop trên phối cảnh, rồi xác nhận gộp hoặc khác nhau. Các mục còn thiếu thông tin xem ngay trong từng phòng.</p>
        {!dups.length && <div className="ok-text">✓ Không phát hiện mã nào nghi trùng.</div>}
        {dups.map(p => (
          <div key={keyOf(p)} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><b>{p.keep.code}</b> {p.keep.name_vn} <span className="muted">· {p.keep.material_vn}</span><br /><b>{p.dup.code}</b> {p.dup.name_vn} <span className="muted">· {p.dup.material_vn}</span>
              <div className="small muted">Giống {Math.round(p.score * 100)}%{p.why.length ? ' – ' + p.why.join(', ') : ''}</div></div>
            <button className="btn primary sm" onClick={() => setOpen(keyOf(p))}>🔍 Xem chi tiết</button>
            {canEdit && <button className="btn ghost sm" onClick={() => dismiss(p)}>Khác nhau</button>}
          </div>))}
      </div>
      {pair && (
        <div className="modal-bg center" onMouseDown={() => setOpen(null)}>
          <div className="modal dup-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>So sánh mã nghi trùng · {cur + 1}/{dups.length} <span className="muted small">(giống {Math.round(pair.score * 100)}%{pair.why.length ? ' – ' + pair.why.join(', ') : ''})</span></h3><button className="btn ghost sm" onClick={() => setOpen(null)}>✕</button></div>
            <div className="dc-grid">
              <Side d={d} e={pair.keep} tag="Mã giữ (nhỏ hơn)" busy={busy} onKeep={canEdit ? () => merge(pair.keep, pair.dup) : undefined} />
              <Side d={d} e={pair.dup} tag="Mã trùng" busy={busy} onKeep={canEdit ? () => merge(pair.dup, pair.keep) : undefined} />
            </div>
            <div className="row gap" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="row gap"><button className="btn sm" disabled={cur <= 0} onClick={() => go(-1)}>← Trước</button><button className="btn sm" disabled={cur >= dups.length - 1} onClick={() => go(1)}>Tiếp →</button></div>
              {canEdit && <button className="btn" onClick={() => { const n = dups[cur + 1] ?? dups[cur - 1]; dismiss(pair); setOpen(n ? keyOf(n) : null) }}>✓ Hai mã KHÁC nhau – bỏ gợi ý</button>}
            </div>
          </div>
        </div>)}
      {selEntry && <div className="drawer-bg" onMouseDown={() => setSel(null)}><div className="drawer" onMouseDown={e => e.stopPropagation()}><EntryPanel d={d} entry={selEntry} onClose={() => setSel(null)} /></div></div>}
    </div>
  )
}

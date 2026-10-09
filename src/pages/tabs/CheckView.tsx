import { useEffect, useMemo, useState } from 'react'
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
import SpellReview from '../../components/SpellReview'
import { spellScan } from '../../lib/spellScan'
import { loadEnglish } from '../../lib/spell'

function Side({ d, e, tag, onKeep, busy, label }: { d: ProjectData; e: Entry; tag: string; onKeep?: () => void; busy: boolean; label?: string }) {
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
      {onKeep && <button className="btn primary" disabled={busy} onClick={onKeep}>{label ?? `Gộp – giữ mã ${e.code}`}</button>}
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
  const [lopen, setLopen] = useState<string | null>(null) // khoá cặp liên kết đang xem chi tiết
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
  type CK = 'issues' | 'link' | 'dup' | 'spell'
  const [modal, setModal] = useState<CK | null>(null)
  const [busyCard, setBusyCard] = useState<CK | 'all' | null>(null)
  const [pending, setPending] = useState<CK | 'all' | null>(null)
  const [tick, setTick] = useState(0)
  const [stamp, setStamp] = useState<Date | null>(null)
  useEffect(() => { loadEnglish().then(() => setTick(t => t + 1)) }, [])
  const spellItems = useMemo(() => spellScan(d), [d.entries, d.rooms, tick]) // eslint-disable-line
  const spellAuto = spellItems.filter(i => i.after !== i.before).length
  const cnt = { issues: issues.length, link: sugg.length + conflicts.length, dup: dups.length, spell: spellItems.length }
  const allOk = Object.values(cnt).every(n => n === 0)
  const openCard = (k: CK) => {
    if (k === 'dup') { if (dups[0]) setOpen(keyOf(dups[0])) }
    else if (k === 'link' && !conflicts.length && sugg[0]) setLopen(sugg[0].a.id + sugg[0].b.id)
    else setModal(k)
  }
  /** Check: tải lại dữ liệu mới nhất, chạy lại kiểm tra; có điểm sai khác thì phóng to giữa màn hình để xem chi tiết */
  const runCheck = async (key: CK | 'all') => {
    setBusyCard(key)
    try { await d.reload(); await loadEnglish(); setTick(t => t + 1); setStamp(new Date()); setPending(key) } catch (e) { toast(String(e)) }
    setBusyCard(null)
  }
  useEffect(() => {
    if (!pending) return
    const first = (pending === 'all' ? (['issues', 'link', 'dup', 'spell'] as CK[]) : [pending]).find(k => cnt[k] > 0)
    setPending(null)
    if (!first) toast(pending === 'all' ? '✓ Tất cả đạt – sẵn sàng xuất file' : '✓ Đạt – không có điểm sai khác', 'ok')
    else openCard(first)
  }, [pending]) // eslint-disable-line
  const linkSkip = (a: Entry, b: Entry) => { const n = [...lskip, a.id + b.id]; setLskip(n); try { localStorage.setItem('dmvl-link-skip', JSON.stringify(n)) } catch { /* */ } }
  const lkey = (x: { a: Entry; b: Entry }) => x.a.id + x.b.id
  const lcur = sugg.findIndex(x => lkey(x) === lopen), lpair = lcur >= 0 ? sugg[lcur] : null
  const lnext = () => { const n = sugg[lcur + 1] ?? sugg[lcur - 1]; setLopen(n ? lkey(n) : null) }
  const doLink = async (a: Entry, b: Entry) => { setBusy(true); try { await linkEntries(a, b, d.entries); toast(`Đã liên kết ${a.code} ↔ ${b.code}`, 'ok'); lnext(); d.reload() } catch (e) { toast(String(e)) } setBusy(false) }
  const go = (dir: number) => { const n = dups[cur + dir]; setOpen(n ? keyOf(n) : null) }
  const cards: { k: CK; ic: string; t: string; sub: string; tone: string }[] = [
    { k: 'issues', ic: '📋', t: 'Thiếu & sai thông tin', sub: `${nErr} sai/lệch · ${issues.length - nErr} thiếu`, tone: nErr ? 'err' : 'bad' },
    { k: 'link', ic: '🔗', t: 'Vật liệu liên kết', sub: `${sugg.length} gợi ý · ${conflicts.length} nhóm đang lệch`, tone: conflicts.length ? 'err' : 'bad' },
    { k: 'dup', ic: '🧩', t: 'Mã trùng', sub: 'Cùng một vật liệu thật nhưng nhiều mã', tone: 'bad' },
    { k: 'spell', ic: '✍️', t: 'Chính tả & dấu câu', sub: `${spellAuto} tự sửa được · ${spellItems.length - spellAuto} nghi sai`, tone: 'bad' },
  ]
  return (
    <div className="stack">
      <div className="card">
        <div className="qc-head">
          <div><h3 style={{ margin: 0 }}>QC cuối – kiểm soát chất lượng trước khi xuất file</h3>
            <div className="small muted">{stamp ? `Đã check lúc ${stamp.toLocaleTimeString('vi-VN')} theo dữ liệu mới nhất · ` : ''}Bấm <b>Check</b> ở từng mục (hoặc Check toàn bộ): phần mềm tải lại dữ liệu mới nhất, kiểm lại, nếu có điểm sai khác sẽ mở to giữa màn hình để xem và xử lý.</div></div>
          <div className="row gap">
            <select value={lang} onChange={e => setLang(e.target.value as Lang)} title="Ngôn ngữ dùng để kiểm ô thiếu"><option value="vn">Kiểm tiếng Việt</option><option value="both">Kiểm song ngữ</option></select>
            <button className="btn primary" disabled={!!busyCard} onClick={() => runCheck('all')}>{busyCard === 'all' ? 'Đang check…' : '▶ Check toàn bộ'}</button>
          </div>
        </div>
      </div>
      {allOk && <div className="qc-all">✓ Tất cả các mục đều đạt – danh mục sẵn sàng để xuất file.</div>}
      <div className="qc-grid">{cards.map(c => { const n = cnt[c.k]; return (
        <div key={c.k} className={'qc-card ' + (n ? c.tone : 'ok')} onClick={() => n && openCard(c.k)} title={n ? 'Bấm để xem chi tiết' : 'Đã đạt'}>
          <div className="qc-ic">{c.ic}</div>
          <div className="qc-num">{n ? n : '✓'}</div>
          <div className="qc-tit">{c.t}</div>
          <div className="qc-sub">{n ? c.sub : 'Đạt – không có điểm sai khác'}</div>
          <button className="btn primary" disabled={!!busyCard} onClick={e => { e.stopPropagation(); runCheck(c.k) }}>{busyCard === c.k || busyCard === 'all' ? 'Đang check…' : '▶ Check'}</button>
        </div>) })}</div>
      {modal === 'issues' && (
        <div className="modal-bg center" onMouseDown={() => setModal(null)}>
          <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>📋 Mã sai hoặc thiếu thông tin ({issues.length})</h3><button className="btn ghost sm" onClick={() => setModal(null)}>✕</button></div>
            {!issues.length ? <div className="ok-text">✓ Không còn mã nào sai hoặc thiếu thông tin.</div> : <div style={{ overflowX: 'auto' }}><table className="tbl small" style={{ width: '100%' }}>
            <thead><tr><th>Mã</th><th>Hạng mục</th><th>Vấn đề cần xử lý</th><th>Phòng</th><th /></tr></thead>
            <tbody>{issues.map(({ e, issues: is }) => (
              <tr key={e.id}>
                <td><b className="code">{e.code}</b></td>
                <td>{e.name_vn}</td>
                <td>{is.map((i, k) => <span key={k} className={'chk-tag chk-' + i.kind}>{i.text}</span>)}</td>
                <td className="small">{locationsOf(e.id, d.occ, d.rooms, d.pages).map(l => l.room.code).join(', ') || '—'}</td>
                <td><button className="btn sm" onClick={() => setSel(e.id)}>Mở & sửa</button></td>
              </tr>))}</tbody>
          </table></div>}
          </div>
        </div>)}
      {modal === 'link' && (
        <div className="modal-bg center" onMouseDown={() => setModal(null)}>
          <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>🔗 Vật liệu liên kết với nhau</h3><button className="btn ghost sm" onClick={() => setModal(null)}>✕</button></div>
            <p className="small muted">Các mã dùng chung một vật liệu/màu thật (vd cùng mã sơn xanh dùng cho tường và cho tranh). Khi đã liên kết, sửa mã sản phẩm, màu, hãng, xuất xứ, link ở một mã thì các mã kia tự đổi theo.</p>
            {!conflicts.length && !sugg.length && <div className="ok-text">✓ Không còn gợi ý liên kết hay nhóm lệch.</div>}
            {conflicts.map(c => (
          <div key={c.link_id} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><span className="chk-tag chk-err">Đang lệch</span> {c.members.map(m => <b key={m.id} style={{ marginRight: 8 }}>{m.code}</b>)}<div className="small muted">Khác nhau ở: {c.keys.join(', ')}</div></div>
            {canEdit && c.members.map(m => <button key={m.id} className="btn sm" onClick={async () => { try { await resyncGroup(m, c.members); d.reload() } catch (e) { toast(String(e)) } }}>Đồng bộ theo {m.code}</button>)}
          </div>))}
        {sugg.map(({ a, b, why }) => (
          <div key={a.id + b.id} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><b>{a.code}</b> {a.name_vn}<br /><b>{b.code}</b> {b.name_vn}<div className="small muted">Gợi ý liên kết: {why}</div></div>
            <button className="btn sm" onClick={() => setLopen(a.id + b.id)}>🔍 Xem chi tiết</button>
            {canEdit && <><button className="btn primary sm" onClick={async () => { try { await linkEntries(a, b, d.entries); d.reload() } catch (e) { toast(String(e)) } }}>🔗 Liên kết (theo {a.code})</button>
              <button className="btn ghost sm" onClick={() => linkSkip(a, b)}>Không liên quan</button></>}
          </div>))}
          </div>
        </div>)}
      {modal === 'spell' && <SpellReview d={d} items={spellItems} onClose={() => { setModal(null); setTick(t => t + 1) }} onOpenEntry={setSel} />}
      {lpair && (
        <div className="modal-bg center" onMouseDown={() => setLopen(null)}>
          <div className="modal dup-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>So sánh để liên kết · {lcur + 1}/{sugg.length} <span className="muted small">({lpair.why})</span></h3><button className="btn ghost sm" onClick={() => setLopen(null)}>✕</button></div>
            <p className="small muted" style={{ margin: '4px 0' }}>Liên kết nghĩa là hai mã dùng chung một vật liệu/màu thật: sau đó sửa mã sản phẩm, màu, hãng, xuất xứ, link ở một mã thì mã kia tự đổi theo. Hai mã vẫn là hai dòng riêng trong bảng.</p>
            <div className="dc-grid">
              <Side d={d} e={lpair.a} tag="Mã A" busy={busy} label={`🔗 Liên kết – lấy thông tin theo ${lpair.a.code}`} onKeep={canEdit ? () => doLink(lpair.a, lpair.b) : undefined} />
              <Side d={d} e={lpair.b} tag="Mã B" busy={busy} label={`🔗 Liên kết – lấy thông tin theo ${lpair.b.code}`} onKeep={canEdit ? () => doLink(lpair.b, lpair.a) : undefined} />
            </div>
            <div className="row gap" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="row gap"><button className="btn sm" disabled={lcur <= 0} onClick={() => setLopen(lkey(sugg[lcur - 1]))}>← Trước</button><button className="btn sm" disabled={lcur >= sugg.length - 1} onClick={() => setLopen(lkey(sugg[lcur + 1]))}>Tiếp →</button></div>
              {canEdit && <button className="btn" onClick={() => { linkSkip(lpair.a, lpair.b); lnext() }}>✓ Hai mã KHÔNG liên quan – bỏ gợi ý</button>}
            </div>
          </div>
        </div>)}
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

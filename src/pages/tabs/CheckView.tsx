import MaterialPopup from '../../components/MaterialPopup'
import { useEffect, useMemo, useState } from 'react'
import type { ProjectData } from '../../lib/useProject'
import type { Entry } from '../../lib/types'
import { findDuplicates, mergeEntries, type DupPair } from '../../lib/merge'
import { locationsOf } from '../../lib/locations'
import { toast } from '../../lib/toast'
import { useAuth } from '../../lib/auth'
import OccCrop from '../../components/OccCrop'
import EntryPanel from '../../components/EntryPanel'
import { checkEntries, fixCategory } from '../../lib/checks'
import { linkSuggestions, linkConflicts, linkEntries, resyncGroup } from '../../lib/entryLink'
import type { Lang } from '../../lib/sections'
import { symbolMap, symbolOf, symOf } from '../../lib/sections'
import SpellReview from '../../components/SpellReview'
import { spellScan } from '../../lib/spellScan'
import { loadEnglish } from '../../lib/spell'
import { cleanEntries } from '../../lib/qc'
import { judgePair, clusterOf, type Verdict } from '../../lib/pairJudge'
import { runAiQc, loadFindings, resolveFinding, staleFinding, KIND_LABEL, type Finding } from '../../lib/aiQc'
import { saveEntry } from '../../lib/entryLink'
import { applyFinishFix, dismissFinish } from '../../lib/finishCheck'
import { addIgnore, addIgnores, isIgnored, pairKey, useIgnoreVersion } from '../../lib/qcIgnore'
import { MarkedField } from '../../components/MarkedText'
import type { ErrHl } from '../../components/ErrHighlight'

function Side({ d, e, tag, onKeep, busy, label }: { d: ProjectData; e: Entry; tag: string; onKeep?: () => void; busy: boolean; label?: string }) {
  const shots = d.occ.filter(o => o.entry_id === e.id && o.bbox && o.page_id)
  const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
  const row = (k: string, v?: string | null) => v ? <div className="dc-row"><span>{k}</span>{v}</div> : null
  return (
    <div className="dc-side">
      <div className="dc-head"><b className="code big-code">{symbolOf(e, undefined, undefined, symbolMap(d.entries))}</b> <b>{e.name_vn}</b> <span className="src">{tag}</span></div>
      <div className="dc-shots">{shots.slice(0, 4).map(o => <OccCrop key={o.id} d={d} o={o} height={190} maxWidth={300} />)}
        {!shots.length && <div className="ic-none wide" style={e.color_hex ? { background: e.color_hex } : undefined}><span>Chưa có ảnh crop</span></div>}
</div>
      {row('Vật liệu', e.material_vn)}{row('Thông số', e.desc_vn)}{row('Bộ phận', e.part_vn)}{row('Hãng', [e.brand, e.product_code].filter(Boolean).join(' · '))}{row('Xuất xứ', e.origin)}
      <div className="dc-row"><span>Có ở</span>{locs.length ? locs.map(l => <span key={l.room.id} className="loc-tag">{l.room.code} {l.room.name_vn}</span>) : 'chưa gán phòng'}</div>
      {onKeep && <button className="btn primary" disabled={busy} onClick={onKeep}>{label ?? `Gộp – giữ mã ${symbolOf(e, undefined, undefined, symbolMap(d.entries))}`}</button>}
    </div>
  )
}

export default function CheckView({ d }: { d: ProjectData }) {
  const { canEdit, isAdmin } = useAuth()
  const igv = useIgnoreVersion()   // đổi khi tải/ghi thêm điểm đã xác nhận (lưu chung qua DB)
  const ign = (kind: 'dup' | 'link', a: string, b: string) => isIgnored(kind, pairKey(a, b)) || isIgnored(kind, a + b) || isIgnored(kind, b + a)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null) // khoá cặp đang xem chi tiết
  const [hl, setHl] = useState<ErrHl | null>(null)   // lỗi cần tô đỏ khi mở bảng vật liệu
  const [lang, setLang] = useState<Lang>('vn')
  const [sel, setSel] = useState<string | null>(null)   // mở bảng vật liệu (như tab Theo vật liệu)
  const [det, setDet] = useState<string | null>(null)   // khung chỉnh chi tiết (EntryPanel)
  const [lopen, setLopen] = useState<string | null>(null) // khoá cặp liên kết đang xem chi tiết
  const issues = useMemo(() => checkEntries(d, lang), [d.entries, d.occ, lang])
  const nErr = issues.filter(r => r.issues.some(i => i.kind === 'err')).length
  /* So trùng/liên kết trên bản đã bỏ mã vật liệu nội bộ khỏi ô mã SP (tránh báo “trùng mã” giả), rồi map về dòng gốc */
  const clean = useMemo(() => cleanEntries(d.entries), [d.entries])
  const orig = useMemo(() => new Map(d.entries.map(e => [e.id, e])), [d.entries])
  const sugg = useMemo(() => linkSuggestions(clean).map(x => ({ x, j: judgePair(x.a, x.b, 'link') })).filter(r => r.j.v === 'same').map(({ x, j }) => ({ ...x, why: j.why.join(', '), a: orig.get(x.a.id)!, b: orig.get(x.b.id)! })).filter(x => !ign('link', x.a.id, x.b.id)), [clean, orig, igv]) // eslint-disable-line
  const conflicts = useMemo(() => linkConflicts(d.entries), [d.entries])
  const selEntry = d.entries.find(e => e.id === det)
  const keyOf = (p: DupPair) => p.keep.id + p.dup.id
  const [showWeak, setShowWeak] = useState(false)
  /* Kết luận theo BẰNG CHỨNG (pairJudge): chỉ hiện cặp có mã SP/mã vật liệu chung và không mâu thuẫn; cặp chỉ giống chữ mô tả = "ít chắc", ẩn mặc định */
  const allDups = useMemo(() => findDuplicates(clean).map(p => ({ p, j: judgePair(p.keep, p.dup, 'dup') })).filter(r => r.j.v !== 'different').map(({ p, j }) => ({ ...p, v: j.v, why: j.why, keep: orig.get(p.keep.id)!, dup: orig.get(p.dup.id)! })).filter(p => !ign('dup', p.keep.id, p.dup.id)), [clean, orig, igv]) // eslint-disable-line
  const nWeak = allDups.filter(p => p.v === 'weak').length
  const dups = useMemo(() => allDups.filter(p => p.v === 'same' || showWeak).sort((x, y) => (x.v === y.v ? 0 : x.v === 'same' ? -1 : 1)), [allDups, showWeak])
  const cur = dups.findIndex(p => keyOf(p) === open), pair = cur >= 0 ? dups[cur] : null
  const dismiss = (p: DupPair) => { void addIgnore('dup', pairKey(p.keep.id, p.dup.id), d.project!.id) }
  /** Cả nhóm các mã nối với nhau qua các cặp nghi trùng (vd CPT-01…06 = 15 cặp) → xác nhận "khác nhau" một lần */
  const dismissGroup = (p: DupPair) => {
    const ids = clusterOf(p.keep.id, dups.map(x => ({ a: x.keep.id, b: x.dup.id })))
    const keys: string[] = []; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) keys.push(pairKey(ids[i], ids[j]))
    void addIgnores('dup', keys, d.project!.id); toast(`Đã xác nhận ${ids.length} mã trong nhóm là khác nhau`, 'ok')
  }
  const merge = async (keep: Entry, dup: Entry) => {
    setBusy(true)
    try { await mergeEntries(keep, dup, d.entries); toast(`Đã gộp ${symOf(d.entries, dup)} vào ${symOf(d.entries, keep)}`, 'ok'); setOpen(null) } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  type CK = 'issues' | 'link' | 'dup' | 'spell' | 'ai'
  const [modal, setModal] = useState<CK | null>(null)
  const [busyCard, setBusyCard] = useState<CK | 'all' | null>(null)
  const [pending, setPending] = useState<CK | 'all' | null>(null)
  const [tick, setTick] = useState(0)
  const [stamp, setStamp] = useState<Date | null>(null)
  useEffect(() => { loadEnglish().then(() => setTick(t => t + 1)) }, [])
  const spellItems = useMemo(() => spellScan(d), [d.entries, d.rooms, tick, igv]) // eslint-disable-line
  const spellAuto = spellItems.filter(i => i.after !== i.before).length
  const [finds, setFinds] = useState<Finding[]>([])
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const pid = d.project?.id
  useEffect(() => { if (pid) loadFindings(pid).then(setFinds) }, [pid, tick])
  const openFinds = useMemo(() => { const sm = symbolMap(d.entries); return finds.filter(f => f.status === 'open' && !staleFinding(f, d, sm)) }, [finds, d])   // bỏ gợi ý lỗi thời: mã VL đã tự đồng bộ số theo ký hiệu
  const runAi = async () => {
    if (aiMsg) return
    setAiMsg('Đang chuẩn bị…')
    try { await d.reload(); const n = await runAiQc(d, setAiMsg); toast(n ? `AI tìm được ${n} điểm cần xem` : '✓ AI không thấy điểm sai chắc chắn nào', n ? 'info' : 'ok'); setTick(t => t + 1); if (n) setModal('ai') } catch (e) { toast(String((e as Error).message ?? e)) }
    setAiMsg(null)
  }
  const bulkFix = issues.flatMap(r => { const f = r.issues.find(i => i.finishFix?.bulk)?.finishFix; return f ? [{ e: r.e, f }] : [] })
  const [fixBusy, setFixBusy] = useState(false)
  const fixAll = async () => { if (!confirm(`Sửa ${bulkFix.length} mục lớp hoàn thiện (gắn mã sơn + bỏ chữ gõ tay)?`)) return; setFixBusy(true); try { for (const x of bulkFix) await applyFinishFix(x.e, x.f); await d.reload(); setTick(t => t + 1); toast(`Đã sửa ${bulkFix.length} mục`, 'ok') } catch (e) { toast(String((e as Error).message ?? e)) } setFixBusy(false) }
  const doFind = async (f: Finding, st: 'accepted' | 'dismissed') => { try { await resolveFinding(f.id, st); setFinds(x => x.map(y => (y.id === f.id ? { ...y, status: st } : y))) } catch (e) { toast(String(e)) } }
  const applyFind = async (f: Finding) => {
    const e = f.entry_id ? orig.get(f.entry_id) : null; if (!e || !f.field || !f.current_text || f.suggestion == null) return
    const v = String((e as any)[f.field] ?? ''); if (!v.includes(f.current_text)) { toast('Nội dung ô đã đổi, không áp dụng được – hãy mở & sửa tay'); return }
    const err = await saveEntry(e, { [f.field]: v.replace(f.current_text, f.suggestion) }); if (err) { toast(err.message); return }
    await doFind(f, 'accepted'); d.reload(); toast(`Đã sửa ${e.code}`, 'ok')
  }
  const cnt = { issues: issues.length, link: sugg.length + conflicts.length, dup: dups.length, spell: spellItems.length, ai: openFinds.length }
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
  const linkSkip = (a: Entry, b: Entry) => { void addIgnore('link', pairKey(a.id, b.id), d.project!.id) }
  const lkey = (x: { a: Entry; b: Entry }) => x.a.id + x.b.id
  const lcur = sugg.findIndex(x => lkey(x) === lopen), lpair = lcur >= 0 ? sugg[lcur] : null
  const lnext = () => { const n = sugg[lcur + 1] ?? sugg[lcur - 1]; setLopen(n ? lkey(n) : null) }
  const doLink = async (a: Entry, b: Entry) => { setBusy(true); try { await linkEntries(a, b, d.entries); toast(`Đã liên kết ${symOf(d.entries, a)} ↔ ${symOf(d.entries, b)}`, 'ok'); lnext(); d.reload() } catch (e) { toast(String(e)) } setBusy(false) }
  const go = (dir: number) => { const n = dups[cur + dir]; setOpen(n ? keyOf(n) : null) }
  const cards: { k: CK; ic: string; t: string; sub: string; tone: string }[] = [
    { k: 'issues', ic: '📋', t: 'Thiếu & sai thông tin', sub: `${nErr} sai/lệch · ${issues.length - nErr} thiếu`, tone: nErr ? 'err' : 'bad' },
    { k: 'link', ic: '🔗', t: 'Vật liệu liên kết', sub: `${sugg.length} gợi ý · ${conflicts.length} nhóm đang lệch`, tone: conflicts.length ? 'err' : 'bad' },
    { k: 'dup', ic: '🧩', t: 'Mã trùng', sub: `Chỉ báo khi có mã/số chung${nWeak ? ` · ${nWeak} cặp chỉ giống chữ (${showWeak ? 'đang hiện' : 'đang ẩn'})` : ''}`, tone: 'bad' },
    { k: 'spell', ic: '✍️', t: 'Chính tả & dấu câu', sub: `${spellAuto} tự sửa được · ${spellItems.length - spellAuto} nghi sai`, tone: 'bad' },
    { k: 'ai', ic: '🤖', t: 'AI soát toàn bộ', sub: `${openFinds.length} gợi ý chờ xác nhận · AI đối chiếu danh mục ↔ phối cảnh ↔ quy định`, tone: 'bad' },
  ]
  return (
    <div className="stack">
      <div className="card">
        <div className="qc-head">
          <div><h3 style={{ margin: 0 }}>QC cuối – kiểm soát chất lượng trước khi xuất file</h3>
            <div className="small muted">{stamp ? `Đã check lúc ${stamp.toLocaleTimeString('vi-VN')} theo dữ liệu mới nhất · ` : ''}Bấm <b>Check</b> ở từng mục (hoặc Check toàn bộ; mục 🤖 AI do admin chạy): phần mềm tải lại dữ liệu mới nhất, kiểm lại, nếu có điểm sai khác sẽ mở to giữa màn hình để xem và xử lý.</div></div>
          <div className="row gap">
            <select value={lang} onChange={e => setLang(e.target.value as Lang)} title="Ngôn ngữ dùng để kiểm ô thiếu"><option value="vn">Kiểm tiếng Việt</option><option value="both">Kiểm song ngữ</option></select>
            <button className="btn primary" disabled={!!busyCard} onClick={() => runCheck('all')}>{busyCard === 'all' ? 'Đang check…' : '▶ Check toàn bộ'}</button>
            <label className="small" style={{ marginLeft: 12 }} title="Cặp mã chỉ giống chữ mô tả (không có mã SP / mã vật liệu / số liệu chung) – dễ nhầm nên mặc định ẩn"><input type="checkbox" checked={showWeak} onChange={e => setShowWeak(e.target.checked)} /> Hiện cả cặp chỉ giống chữ ({nWeak})</label>
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
          {c.k === 'ai'
            ? (isAdmin ? <button className="btn primary" disabled={!!aiMsg} onClick={e => { e.stopPropagation(); runAi() }}>{aiMsg ? '⏳ ' + aiMsg : '▶ Chạy AI soát'}</button> : <button className="btn" disabled title="Chỉ quản trị viên chạy AI">Admin chạy AI</button>)
            : <button className="btn primary" disabled={!!busyCard} onClick={e => { e.stopPropagation(); runCheck(c.k) }}>{busyCard === c.k || busyCard === 'all' ? 'Đang check…' : '▶ Check'}</button>}
        </div>) })}</div>
      {modal === 'issues' && (
        <div className="modal-bg center" onMouseDown={() => setModal(null)}>
          <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>📋 Mã sai hoặc thiếu thông tin ({issues.length})</h3>{canEdit && bulkFix.length > 0 && <button className="btn primary sm" disabled={fixBusy} title="Gắn mã sơn đã có và bỏ chữ gõ tay trùng – chỉ các mục chắc chắn" onClick={fixAll}>{fixBusy ? 'Đang sửa…' : `🎨 Sửa tất cả lớp hoàn thiện (${bulkFix.length})`}</button>}<button className="btn ghost sm" onClick={() => setModal(null)}>✕</button></div>
            {!issues.length ? <div className="ok-text">✓ Không còn mã nào sai hoặc thiếu thông tin.</div> : <div style={{ overflowX: 'auto' }}><table className="tbl small" style={{ width: '100%' }}>
            <thead><tr><th>Mã</th><th>Hạng mục</th><th>Vấn đề cần xử lý</th><th>Phòng</th><th /></tr></thead>
            <tbody>{issues.map(({ e, issues: is }) => (
              <tr key={e.id}>
                <td><b className="code">{symbolOf(e, undefined, undefined, symbolMap(d.entries))}</b></td>
                <td>{e.name_vn}</td>
                <td>{is.map((i, k) => <span key={k} className={'chk-tag chk-' + i.kind}>{i.text}</span>)}</td>
                <td className="small">{locationsOf(e.id, d.occ, d.rooms, d.pages).map(l => l.room.code).join(', ') || '—'}</td>
                <td className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>{canEdit && is.filter(i => i.finishFix).map((i, k) => <button key={k} className="btn sm primary" onClick={async () => { try { await applyFinishFix(e, i.finishFix!); await d.reload(); setTick(t => t + 1) } catch (err) { toast(String((err as Error).message ?? err)) } }}>🎨 {i.finishFix!.label}</button>)}{canEdit && is.filter(i => i.finishKey).map((i, k) => <button key={'d' + k} className="btn ghost sm" title={'Không đúng – bỏ: ' + i.text} onClick={async () => { try { await dismissFinish(e, i.finishKey!); await d.reload(); setTick(t => t + 1) } catch (err) { toast(String((err as Error).message ?? err)) } }}>✕ Không đúng{is.filter(x => x.finishKey).length > 1 ? ' #' + (k + 1) : ''}</button>)}{canEdit && is.some(i => i.orphanEn?.length) && <button className="btn sm primary" title="Xoá các ô tiếng Anh còn sót (tiếng Việt tương ứng đang trống)" onClick={async () => { const fs = is.flatMap(i => i.orphanEn ?? []); const en_src = { ...(e.en_src ?? {}) } as any; for (const f of fs) delete en_src[f]; const err = await saveEntry(e, { ...Object.fromEntries(fs.map(f => [f, null])), en_src }); if (err) toast(err.message); else { await d.reload(); setTick(t => t + 1) } }}>🧹 Xoá EN thừa</button>}{is.some(i => i.fix === 'category') && <button className="btn sm primary" title="Đặt “Bề mặt / mục” đúng theo nhóm mã" onClick={async () => { await fixCategory(e); await d.reload(); setTick(t => t + 1) }}>Tự sửa</button>}<button className="btn sm" onClick={() => setSel(e.id)}>Mở & sửa</button></td>
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
            <div style={{ flex: 1, minWidth: 260 }}><span className="chk-tag chk-err">Đang lệch</span> {c.members.map(m => <b key={m.id} style={{ marginRight: 8 }}>{symOf(d.entries, m)}</b>)}<div className="small muted">Khác nhau ở: {c.keys.join(', ')}</div></div>
            {canEdit && c.members.map(m => <button key={m.id} className="btn sm" onClick={async () => { try { await resyncGroup(m, c.members); d.reload() } catch (e) { toast(String(e)) } }}>Đồng bộ theo {symOf(d.entries, m)}</button>)}
          </div>))}
        {sugg.map(({ a, b, why }) => (
          <div key={a.id + b.id} className="row sm-gap" style={{ padding: '8px 0', borderTop: '1px solid #eee', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}><b>{symOf(d.entries, a)}</b> {a.name_vn}<br /><b>{symOf(d.entries, b)}</b> {b.name_vn}<div className="small muted">Gợi ý liên kết: {why}</div></div>
            <button className="btn sm" onClick={() => setLopen(a.id + b.id)}>🔍 Xem chi tiết</button>
            {canEdit && <><button className="btn primary sm" onClick={async () => { try { await linkEntries(a, b, d.entries); d.reload() } catch (e) { toast(String(e)) } }}>🔗 Liên kết (theo {symOf(d.entries, a)})</button>
              <button className="btn ghost sm" onClick={() => linkSkip(a, b)}>Không liên quan</button></>}
          </div>))}
          </div>
        </div>)}
      {modal === 'ai' && (
        <div className="modal-bg center" onMouseDown={() => setModal(null)}>
          <div className="modal qc-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>🤖 AI soát toàn bộ ({openFinds.length} gợi ý)</h3><button className="btn ghost sm" onClick={() => setModal(null)}>✕</button></div>
            <p className="small muted">AI đọc danh mục, ghi chú phân tích phối cảnh và quy định vận hành rồi chỉ báo những điểm nó chắc ≥ 85%. Phần mềm đã kiểm lại (mã và đoạn trích có thật). AI chỉ gợi ý – bạn xem ảnh/dữ liệu rồi bấm xác nhận hoặc bỏ qua.</p>
            {!openFinds.length ? <div className="ok-text">✓ Không còn gợi ý nào chờ xác nhận.</div> : <div style={{ overflowX: 'auto' }}><table className="tbl small" style={{ width: '100%' }}>
              <thead><tr><th>Mã</th><th>Loại</th><th>Điểm nghi sai</th><th /></tr></thead>
              <tbody>{openFinds.map(f => { const e = f.entry_id ? orig.get(f.entry_id) : undefined; const canApply = !!(e && f.field && f.current_text && f.suggestion != null && String((e as any)[f.field] ?? '').includes(f.current_text)); return (
                <tr key={f.id}>
                  <td><b className="code">{e ? symbolOf(e, undefined, undefined, symbolMap(d.entries)) : f.code}</b><div className="muted">{e?.name_vn}</div></td>
                  <td><span className="chk-tag chk-err">{KIND_LABEL[f.kind] ?? f.kind}</span><div className="muted">{f.field}{f.confidence ? ` · ${Math.round(f.confidence * 100)}%` : ''}</div></td>
                  <td>{f.message}{e && f.field && f.current_text && (e as any)[f.field] ? <MarkedField value={String((e as any)[f.field])} snippet={f.current_text} /> : f.current_text ? <div className="muted">“{f.current_text}”</div> : null}{f.suggestion ? <div className="small">→ <b>{f.suggestion}</b></div> : null}{f.related?.length ? <div className="muted">Liên quan: {f.related.join(', ')}</div> : null}</td>
                  <td className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
                    {canEdit && canApply && <button className="btn sm primary" onClick={() => applyFind(f)}>✓ Áp dụng</button>}
                    {e && <button className="btn sm" onClick={() => { setHl(f.field ? { entryId: e.id, field: f.field, text: f.current_text, why: f.message } : null); setSel(e.id) }}>Mở & sửa</button>}
                    {canEdit && <button className="btn sm" title="Đã tự sửa/đã xử lý xong" onClick={() => doFind(f, 'accepted')}>Đã xử lý</button>}
                    {canEdit && <button className="btn ghost sm" title="AI nhận định sai" onClick={() => doFind(f, 'dismissed')}>AI sai – bỏ</button>}
                  </td>
                </tr>) })}</tbody>
            </table></div>}
          </div>
        </div>)}
      {modal === 'spell' && <SpellReview d={d} items={spellItems} onClose={() => { setModal(null); setTick(t => t + 1) }} onOpenEntry={(id, h) => { setHl(h ?? null); setSel(id) }} />}
      {lpair && (
        <div className="modal-bg center" onMouseDown={() => setLopen(null)}>
          <div className="modal dup-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="row between"><h3 style={{ margin: 0 }}>So sánh để liên kết · {lcur + 1}/{sugg.length} <span className="muted small">({lpair.why})</span></h3><button className="btn ghost sm" onClick={() => setLopen(null)}>✕</button></div>
            <p className="small muted" style={{ margin: '4px 0' }}>Liên kết nghĩa là hai mã dùng chung một vật liệu/màu thật: sau đó sửa mã sản phẩm, màu, hãng, xuất xứ, link ở một mã thì mã kia tự đổi theo. Hai mã vẫn là hai dòng riêng trong bảng.</p>
            <div className="dc-grid">
              <Side d={d} e={lpair.a} tag="Mã A" busy={busy} label={`🔗 Liên kết – lấy thông tin theo ${symOf(d.entries, lpair.a)}`} onKeep={canEdit ? () => doLink(lpair.a, lpair.b) : undefined} />
              <Side d={d} e={lpair.b} tag="Mã B" busy={busy} label={`🔗 Liên kết – lấy thông tin theo ${symOf(d.entries, lpair.b)}`} onKeep={canEdit ? () => doLink(lpair.b, lpair.a) : undefined} />
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
            <div className="row between"><h3 style={{ margin: 0 }}>So sánh mã nghi trùng · {cur + 1}/{dups.length} <span className="muted small">({pair.v === 'same' ? '✓ có bằng chứng' : '⚠ ít chắc'} – {pair.why.join(', ')})</span></h3><button className="btn ghost sm" onClick={() => setOpen(null)}>✕</button></div>
            <div className="dc-grid">
              <Side d={d} e={pair.keep} tag="Giữ lại (số nhỏ hơn)" busy={busy} onKeep={canEdit ? () => merge(pair.keep, pair.dup) : undefined} />
              <Side d={d} e={pair.dup} tag="Mã trùng" busy={busy} onKeep={canEdit ? () => merge(pair.dup, pair.keep) : undefined} />
            </div>
            <div className="row gap" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <div className="row gap"><button className="btn sm" disabled={cur <= 0} onClick={() => go(-1)}>← Trước</button><button className="btn sm" disabled={cur >= dups.length - 1} onClick={() => go(1)}>Tiếp →</button></div>
              {canEdit && <div className="row gap"><button className="btn" onClick={() => { const n = dups[cur + 1] ?? dups[cur - 1]; dismiss(pair); setOpen(n ? keyOf(n) : null) }}>✓ Hai mã KHÁC nhau</button><button className="btn ghost" title="Tất cả các mã nối với cặp này đều là vật liệu khác nhau" onClick={() => { dismissGroup(pair); setOpen(null) }}>✓✓ Cả nhóm khác nhau</button></div>}
            </div>
          </div>
        </div>)}
      {sel && d.entries.some(e => e.id === sel) && <MaterialPopup d={d} entryId={sel} lang="vn" hl={hl && hl.entryId === sel ? hl : null} onClose={() => { setSel(null); setHl(null) }} onDetail={id => { setSel(null); setDet(id) }} />}
      {selEntry && <div className="drawer-bg" onMouseDown={() => setDet(null)}><div className="drawer" onMouseDown={e => e.stopPropagation()}><EntryPanel d={d} entry={selEntry} issues={issues.find(r => r.e.id === selEntry.id)?.issues} onClose={() => setDet(null)} /></div></div>}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { Lang } from '../lib/sections'
import { useAuth } from '../lib/auth'
import { planFill, syncEnglish, loadChangeTimes, type ChangeTimes } from '../lib/translateEn'
import { toast } from '../lib/toast'

/** Chuyển sang English / Song ngữ: TỰ ĐỘNG điền mọi ô tiếng Anh còn trống từ tiếng Việt – từ điển chuyên ngành trước, phần phức tạp thì AI (Gemini miễn phí).
 *  Không bao giờ ghi đè ô tiếng Anh đã có. Lỗi mạng/hạn mức thì hiện nút "Thử lại". */
export default function EnFill({ d, lang }: { d: ProjectData; lang: Lang }) {
  const { canEdit } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [nonce, setNonce] = useState(0)
  const tried = useRef('')
  const [times, setTimes] = useState<ChangeTimes | undefined>()
  const pid = d.project?.id
  useEffect(() => { if (lang !== 'vn' && canEdit && pid) loadChangeTimes(pid).then(setTimes).catch(() => {}) }, [pid, lang, canEdit, d.entries.length])
  const all = useMemo(() => (canEdit ? planFill(d, false, times) : []), [d.entries, d.rooms, canEdit, times])
  // tự động (kể cả khi đang xem tiếng Việt): ô EN còn TRỐNG + ô EN do phần mềm dịch mà tiếng Việt vừa được sửa (EN chưa ai sửa tay)
  // → sửa tiếng Việt xong là tiếng Anh tự dịch lại theo, không phải nhớ bấm “Dịch lại”
  const plan = useMemo(() => all.filter(i => i.prevEn == null ? lang !== 'vn' : i.safe), [all, lang])
  const changed = useMemo(() => all.filter(i => i.prevEn != null && !i.safe), [all]) // ô VN đã đổi so với lần dịch trước (hoặc EN còn lẫn tiếng Việt) → chờ người dùng bấm
  const planSig = plan.map(i => i.key).join(',')
  useEffect(() => {
    if (!canEdit || !plan.length || busy) return
    const sig = planSig + '#' + nonce
    if (tried.current === sig) return            // đã thử đúng bộ ô này (tránh lặp vô hạn khi lỗi)
    tried.current = sig
    ;(async () => {
      setBusy(true); setErr('')
      try {
        const { done, failed } = await syncEnglish(d, setMsg, false, lang === 'vn' ? 'safe' : true)
        if (failed > 0) setErr(`AI chưa dịch được ${failed} ô (có thể do hạn mức miễn phí) – bấm Thử lại sau ít phút`)
        if (done) toast(`Đã đồng bộ ${done} ô tiếng Anh theo tiếng Việt`, 'ok')
        await d.reload()
      } catch (e) { setErr(String(e).replace(/^Error: /, '')); await d.reload() }
      setBusy(false); setMsg('')
    })()
  }, [lang, planSig, canEdit, nonce])
  const redoChanged = async () => {
    setBusy(true); setMsg('Đang quét nội dung và đối chiếu với lần dịch gần nhất…')
    let tm = times, ch = changed
    try { if (pid) { tm = await loadChangeTimes(pid); setTimes(tm) } ch = planFill(d, false, tm).filter(i => i.prevEn != null) } catch { /* dùng bản cũ */ }
    setBusy(false); setMsg('')
    if (!ch.length) { toast('Đã quét toàn bộ: không có ô nào đổi so với lần dịch gần nhất – tiếng Anh đang khớp tiếng Việt', 'info'); return }
    const lab = [...new Set(ch.map(i => `${i.label} (${i.field.replace('_en', '')})`))]
    if (!confirm(`Quét xong: ${ch.length} ô đã thay đổi so với lần dịch gần nhất, ở ${new Set(ch.map(i => i.id)).size} mục:\n${lab.slice(0, 10).join('\n')}${lab.length > 10 ? '\n…' : ''}\n\nChỉ dịch lại đúng các ô này; ô không đổi giữ nguyên. Tiếp tục?`)) return
    setBusy(true); setErr('')
    try { const { done, failed } = await syncEnglish(d, setMsg, false, false, tm); toast(`Đã dịch lại ${done} ô đã thay đổi${failed ? `, ${failed} ô chưa được` : ''}`, failed ? 'info' : 'ok'); if (failed) setErr(`AI chưa dịch được ${failed} ô – bấm Thử lại sau ít phút`) }
    catch (e) { setErr(String(e).replace(/^Error: /, '')) }
    await d.reload(); setBusy(false); setMsg('')
  }
  const redoAll = async () => {
    const n = planFill(d, true).length
    if (!n || !confirm(`Dịch lại ${n} ô tiếng Anh theo tiếng Việt (tiếng Việt là bản gốc)?\nCác ô EN đang có sẽ bị thay bằng bản dịch mới (tự sao lưu trước). Có thể mất vài phút.`)) return
    setBusy(true); setErr('')
    try { const { done, failed } = await syncEnglish(d, setMsg, true); toast(`Đã dịch lại ${done} ô${failed ? `, ${failed} ô chưa được` : ''}`, failed ? 'info' : 'ok'); if (failed) setErr(`AI chưa dịch được ${failed} ô – bấm Thử lại sau ít phút`) }
    catch (e) { setErr(String(e).replace(/^Error: /, '')) }
    await d.reload(); setBusy(false); setMsg('')
  }
  if (lang === 'vn' || !canEdit) return null
  if (!busy && !err) return <div className="row gap small" style={{ margin: '4px 0', alignItems: 'center' }}>
    <button className={'btn sm' + (changed.length ? '' : ' ghost')} title="Phần mềm so sánh tiếng Việt hiện tại với lúc dịch trước; chỉ dịch lại những ô đã đổi, ô không đổi giữ nguyên" onClick={redoChanged}>🔁 Dịch lại phần đã thay đổi{changed.length ? ` (${changed.length} ô)` : ''}</button>
    {!changed.length && <span className="muted">EN đang khớp VN</span>}
    <a className="muted" style={{ cursor: 'pointer', textDecoration: 'underline' }} title="Dịch lại MỌI ô EN theo VN, kể cả ô chưa có dấu vết – chỉ dùng khi EN và VN mâu thuẫn nhiều" onClick={redoAll}>dịch lại toàn bộ</a>
  </div>
  return (
    <div className="row gap small" style={{ margin: '6px 0', padding: '6px 10px', background: err ? '#fdecea' : '#eef6ff', borderRadius: 8, flexWrap: 'wrap' }}>
      {busy ? <span>🌐 {msg || `Đang tự dịch ${plan.length} ô sang tiếng Anh…`}</span> : <>
        <span>⚠ Chưa dịch hết: {err}</span>
        <button className="btn sm" onClick={() => { tried.current = ''; setNonce(n => n + 1) }}>Thử lại</button></>}
    </div>)
}

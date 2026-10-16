import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { Lang } from '../lib/sections'
import { useAuth } from '../lib/auth'
import { planFill, syncEnglish } from '../lib/translateEn'
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
  const all = useMemo(() => (lang === 'vn' ? [] : planFill(d)), [d.entries, d.rooms, lang])
  const plan = useMemo(() => all.filter(i => i.prevEn == null), [all])   // tự động chỉ điền ô EN còn TRỐNG
  const changed = useMemo(() => all.filter(i => i.prevEn != null), [all]) // ô VN đã đổi so với lần dịch trước (hoặc EN còn lẫn tiếng Việt) → chờ người dùng bấm
  const planSig = plan.map(i => i.key).join(',')
  useEffect(() => {
    if (lang === 'vn' || !canEdit || !plan.length || busy) return
    const sig = planSig + '#' + nonce
    if (tried.current === sig) return            // đã thử đúng bộ ô này (tránh lặp vô hạn khi lỗi)
    tried.current = sig
    ;(async () => {
      setBusy(true); setErr('')
      try {
        const { done, failed } = await syncEnglish(d, setMsg, false, true)
        if (failed > 0) setErr(`AI chưa dịch được ${failed} ô (có thể do hạn mức miễn phí) – bấm Thử lại sau ít phút`)
        if (done) toast(`Đã đồng bộ ${done} ô tiếng Anh theo tiếng Việt`, 'ok')
        await d.reload()
      } catch (e) { setErr(String(e).replace(/^Error: /, '')); await d.reload() }
      setBusy(false); setMsg('')
    })()
  }, [lang, planSig, canEdit, nonce])
  const redoChanged = async () => {
    if (!changed.length) { toast('Không có ô nào đổi so với lần dịch trước – tiếng Anh đang khớp tiếng Việt', 'info'); return }
    const lab = [...new Set(changed.map(i => i.label))]
    if (!confirm(`Phát hiện ${changed.length} ô tiếng Việt đã thay đổi (hoặc EN còn lẫn tiếng Việt) kể từ lần dịch trước, ở ${lab.length} mục:\n${lab.slice(0, 8).join('\n')}${lab.length > 8 ? '\n…' : ''}\n\nChỉ dịch lại các ô này, những ô không đổi giữ nguyên. Tiếp tục?`)) return
    setBusy(true); setErr('')
    try { const { done, failed } = await syncEnglish(d, setMsg); toast(`Đã dịch lại ${done} ô đã thay đổi${failed ? `, ${failed} ô chưa được` : ''}`, failed ? 'info' : 'ok'); if (failed) setErr(`AI chưa dịch được ${failed} ô – bấm Thử lại sau ít phút`) }
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

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
  const plan = useMemo(() => (lang === 'vn' ? [] : planFill(d)), [d.entries, d.rooms, lang])
  const planSig = plan.map(i => i.key).join(',')
  useEffect(() => {
    if (lang === 'vn' || !canEdit || !plan.length || busy) return
    const sig = planSig + '#' + nonce
    if (tried.current === sig) return            // đã thử đúng bộ ô này (tránh lặp vô hạn khi lỗi)
    tried.current = sig
    ;(async () => {
      setBusy(true); setErr('')
      try {
        const { done, failed } = await syncEnglish(d, setMsg)
        if (failed > 0) setErr(`AI chưa dịch được ${failed} ô (có thể do hạn mức miễn phí) – bấm Thử lại sau ít phút`)
        if (done) toast(`Đã đồng bộ ${done} ô tiếng Anh theo tiếng Việt`, 'ok')
        await d.reload()
      } catch (e) { setErr(String(e).replace(/^Error: /, '')); await d.reload() }
      setBusy(false); setMsg('')
    })()
  }, [lang, planSig, canEdit, nonce])
  const redoAll = async () => {
    const n = planFill(d, true).length
    if (!n || !confirm(`Dịch lại ${n} ô tiếng Anh theo tiếng Việt (tiếng Việt là bản gốc)?\nCác ô EN đang có sẽ bị thay bằng bản dịch mới (tự sao lưu trước). Có thể mất vài phút.`)) return
    setBusy(true); setErr('')
    try { const { done, failed } = await syncEnglish(d, setMsg, true); toast(`Đã dịch lại ${done} ô${failed ? `, ${failed} ô chưa được` : ''}`, failed ? 'info' : 'ok'); if (failed) setErr(`AI chưa dịch được ${failed} ô – bấm Thử lại sau ít phút`) }
    catch (e) { setErr(String(e).replace(/^Error: /, '')) }
    await d.reload(); setBusy(false); setMsg('')
  }
  if (lang === 'vn' || !canEdit) return null
  if (!busy && !err) return <div className="row small" style={{ margin: '4px 0' }}><button className="btn ghost sm" title="Dịch lại toàn bộ ô tiếng Anh theo tiếng Việt (VN là bản gốc) – dùng khi EN và VN mâu thuẫn" onClick={redoAll}>🔁 Dịch lại toàn bộ EN theo VN</button></div>
  return (
    <div className="row gap small" style={{ margin: '6px 0', padding: '6px 10px', background: err ? '#fdecea' : '#eef6ff', borderRadius: 8, flexWrap: 'wrap' }}>
      {busy ? <span>🌐 {msg || `Đang tự dịch ${plan.length} ô sang tiếng Anh…`}</span> : <>
        <span>⚠ Chưa dịch hết: {err}</span>
        <button className="btn sm" onClick={() => { tried.current = ''; setNonce(n => n + 1) }}>Thử lại</button></>}
    </div>)
}

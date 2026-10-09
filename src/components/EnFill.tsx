import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { Lang } from '../lib/sections'
import { useAuth } from '../lib/auth'
import { planFill, fillByDictionary, fillByAI } from '../lib/translateEn'
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
  useEffect(() => {
    if (lang === 'vn' || !canEdit || !plan.length || busy) return
    const sig = plan.map(i => i.key).join(',') + '#' + nonce
    if (tried.current === sig) return            // đã thử đúng bộ ô này (tránh lặp vô hạn khi lỗi)
    tried.current = sig
    ;(async () => {
      setBusy(true); setErr('')
      try {
        const n1 = await fillByDictionary(d, plan)
        const left = plan.filter(i => !i.ok)
        let n2 = 0
        if (left.length) n2 = await fillByAI(d, left, setMsg)
        if (left.length && n2 < left.length) setErr(`AI chưa dịch được ${left.length - n2} ô (có thể do hạn mức miễn phí) – bấm Thử lại sau ít phút`)
        if (n1 + n2) toast(`Đã tự dịch ${n1 + n2} ô sang tiếng Anh${n2 ? ` (${n2} ô bằng AI)` : ''}`, 'ok')
        await d.reload()
      } catch (e) { setErr(String(e).replace(/^Error: /, '')); await d.reload() }
      setBusy(false); setMsg('')
    })()
  }, [lang, plan.length, canEdit, nonce])
  if (lang === 'vn' || !canEdit || (!busy && !err)) return null
  return (
    <div className="row gap small" style={{ margin: '6px 0', padding: '6px 10px', background: err ? '#fdecea' : '#eef6ff', borderRadius: 8, flexWrap: 'wrap' }}>
      {busy ? <span>🌐 {msg || `Đang tự dịch ${plan.length} ô sang tiếng Anh…`}</span> : <>
        <span>⚠ Chưa dịch hết: {err}</span>
        <button className="btn sm" onClick={() => { tried.current = ''; setNonce(n => n + 1) }}>Thử lại</button></>}
    </div>)
}

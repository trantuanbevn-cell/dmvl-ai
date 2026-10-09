import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { Lang } from '../lib/sections'
import { useAuth } from '../lib/auth'
import { planFill, fillByDictionary, fillByAI } from '../lib/translateEn'
import { toast } from '../lib/toast'

/** Khi chuyển sang English / Song ngữ: tự điền các ô tiếng Anh còn trống từ tiếng Việt (từ điển chuyên ngành, không ghi đè ô đã có).
 *  Phần từ điển chưa dịch chắc được thì hiện nút nhờ AI dịch (quản trị viên). */
export default function EnFill({ d, lang }: { d: ProjectData; lang: Lang }) {
  const { canEdit, isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const tried = useRef('')
  const plan = useMemo(() => (lang === 'vn' ? [] : planFill(d)), [d.entries, d.rooms, lang])
  const rest = plan.filter(i => !i.ok)
  const easy = plan.filter(i => i.ok)
  useEffect(() => {
    if (lang === 'vn' || !canEdit || !easy.length || busy) return
    const sig = easy.map(i => i.key).join(',')
    if (tried.current === sig) return          // đã thử đúng bộ này rồi (tránh lặp nếu lỗi)
    tried.current = sig
    setBusy(true)
    fillByDictionary(d, easy).then(n => { if (n) toast(`Đã tự dịch ${n} ô sang tiếng Anh (từ điển chuyên ngành)`, 'ok'); return d.reload() }).catch(e => toast(String(e))).finally(() => setBusy(false))
  }, [lang, easy.length, canEdit])
  if (lang === 'vn' || !canEdit || (!rest.length && !busy)) return null
  const run = async () => {
    setBusy(true); setMsg('')
    try { const n = await fillByAI(d, rest, setMsg); toast(`AI đã dịch ${n} ô`, 'ok'); await d.reload() } catch (e) { toast(String(e)) }
    setBusy(false); setMsg('')
  }
  return (
    <div className="row gap small" style={{ margin: '6px 0', padding: '6px 10px', background: '#fff7e6', borderRadius: 8, flexWrap: 'wrap' }}>
      <span>🌐 {busy ? (msg || 'Đang dịch…') : `${rest.length} ô tiếng Anh chưa có – nội dung dài/phức tạp, từ điển chưa dịch chắc được.`}</span>
      {!busy && (isAdmin
        ? <button className="btn sm primary" onClick={run} title="AI dịch sang tiếng Anh chuyên ngành, chỉ điền vào ô tiếng Anh đang trống (không ghi đè). Có sao lưu trước.">Dịch bằng AI ({rest.length})</button>
        : <span className="muted">Nhờ quản trị viên bấm dịch bằng AI, hoặc gõ tay vào ô đỏ.</span>)}
    </div>)
}

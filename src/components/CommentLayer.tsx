import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useComments, type Comment } from '../lib/comments'
import { toast } from '../lib/toast'
import type { ProjectData } from '../lib/useProject'

type Target = { entryId: string | null; code: string | null; col: string | null; x: number; y: number }
type Person = { id: string; name: string; role: string }

/** Nhận xét + giao việc trong danh mục: bật "💬 Nhận xét", bấm vào hàng / ô / tiêu đề cột → ghi nội dung và chọn gửi cho ai.
 *  Người nhận thấy ở hộp 💬 trên thanh trên cùng, bấm "Mở đúng chỗ" là tới đúng hạng mục (ô được nháy sáng). */
export default function CommentLayer({ d }: { d: ProjectData }) {
  const { session } = useAuth()
  const { list, send, markSeen, setDone } = useComments()
  const [mode, setMode] = useState(false)
  const [tg, setTg] = useState<Target | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [to, setTo] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const [sp, setSp] = useSearchParams()
  const pid = d.project!.id
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => { supabase.rpc('project_people', { pid }).then(({ data }) => setPeople(((data ?? []) as Person[]).filter(p => p.id !== session.user.id))) }, [pid, session.user.id])
  useEffect(() => { document.body.classList.toggle('cmt-mode', mode); return () => document.body.classList.remove('cmt-mode') }, [mode])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setTg(null); setMode(false) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  useEffect(() => {
    if (!mode) return
    const h = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.cmt-ui')) return
      const th = el.closest('th') as HTMLTableCellElement | null, td = el.closest('td') as HTMLTableCellElement | null, tr = el.closest('tr[data-eid]') as HTMLElement | null
      if (!th && !tr) return
      e.preventDefault(); e.stopPropagation()
      const table = (th ?? td ?? tr)!.closest('table'), cell = (td ?? th) as HTMLTableCellElement | null
      const col = cell ? table?.querySelectorAll('thead th')[cell.cellIndex]?.textContent?.trim() || null : null
      setTg({ entryId: tr?.dataset.eid ?? null, code: tr?.dataset.code ?? null, col, x: Math.min(e.clientX, window.innerWidth - 360), y: Math.min(e.clientY, window.innerHeight - 330) })
      setText('')
    }
    document.addEventListener('click', h, true)
    return () => document.removeEventListener('click', h, true)
  }, [mode])
  const submit = async () => {
    if (!tg || !text.trim()) return
    setBusy(true)
    const err = await send({ project_id: pid, entry_id: tg.entryId, entry_code: tg.code, col: tg.col, body: text.trim(), to_user: to || null })
    setBusy(false)
    if (err) return toast('Không gửi được: ' + err)
    toast(to ? `Đã gửi ${people.find(p => p.id === to)?.name}` : 'Đã lưu', 'ok'); setTg(null)
  }
  // dấu 💬 ở các hàng đang có nhận xét chưa xử lý (liên quan đến tôi)
  const openByEntry = useMemo(() => { const m = new Map<string, Comment[]>(); for (const c of list) if (c.status === 'open' && c.entry_id && c.project_id === pid) m.set(c.entry_id, [...(m.get(c.entry_id) ?? []), c]); return m }, [list, pid])
  useEffect(() => {
    const id = window.setInterval(() => {
      document.querySelectorAll('tr.has-cmt').forEach(r => { const e = (r as HTMLElement).dataset.eid; if (!e || !openByEntry.has(e)) { r.classList.remove('has-cmt'); r.removeAttribute('data-cmt') } })
      openByEntry.forEach((cs, eid) => { const r = document.querySelector(`tr[data-eid="${eid}"]`); if (r && !r.classList.contains('has-cmt')) { r.classList.add('has-cmt'); r.setAttribute('data-cmt', String(cs.length)) } })
    }, 700)
    return () => window.clearInterval(id)
  }, [openByEntry])
  // đến từ thông báo: hiện khung nhận xét + cuộn tới hàng/ô và nháy sáng
  const cmtId = sp.get('cmt'), focus = sp.get('focus')
  const cur = list.find(c => c.id === cmtId)
  useEffect(() => { if (cur) markSeen(cur.id) }, [cur?.id]) // eslint-disable-line
  useEffect(() => {
    if (!focus && !cur) return
    let n = 0
    const t = window.setInterval(() => {
      const tr = focus ? document.querySelector(`tr[data-eid="${focus}"]`) as HTMLElement | null : null
      if (tr) {
        window.clearInterval(t)
        tr.scrollIntoView({ block: 'center', behavior: 'smooth' })
        tr.classList.add('cmt-flash')
        const col = cur?.col, ths = [...tr.closest('table')!.querySelectorAll('thead th')]
        const ix = col ? ths.findIndex(h => h.textContent?.trim() === col) : -1
        const td = ix >= 0 ? tr.children[ix] as HTMLElement | undefined : undefined
        td?.classList.add('cmt-flash-cell')
        window.setTimeout(() => { tr.classList.remove('cmt-flash'); td?.classList.remove('cmt-flash-cell') }, 5000)
      } else if (++n > 25) window.clearInterval(t)
    }, 250)
    return () => window.clearInterval(t)
  }, [focus, cmtId, !!cur]) // eslint-disable-line
  const close = () => { const q = new URLSearchParams(sp); q.delete('cmt'); q.delete('focus'); q.delete('t'); setSp(q, { replace: true }) }
  return <>
    <button className={'cmt-fab cmt-ui' + (mode ? ' on' : '')} onClick={() => { setMode(m => !m); setTg(null) }} >{mode ? '✕ Thoát (Esc)' : '💬 Nhận xét'}</button>
    {mode && !tg && <div className="cmt-hint cmt-ui">Chọn hàng, ô hoặc cột</div>}
    {cur && <div className="cmt-banner cmt-ui">
      <div><b>💬 {cur.author_id === session.user.id ? 'Bạn ghi' : (cur.author_name ?? 'Có người') + ' nhận xét'}</b>{cur.entry_code ? ` · ${cur.entry_code}` : ''}{cur.col ? ` · cột “${cur.col}”` : ''}: {cur.body}</div>
      <div className="row gap sm-gap">{cur.status === 'open' ? <button className="btn sm primary" onClick={() => { setDone(cur.id, true); close() }}>✓ Đã xử lý</button> : <span className="small">✓ đã xử lý</span>}<button className="btn sm" onClick={close}>Sau</button></div>
    </div>}
    {tg && createPortal(<div className="cmt-pop cmt-ui" ref={pop} style={{ left: tg.x, top: tg.y }}>
      <div className="row between"><b>Nhận xét</b><button className="btn ghost sm" onClick={() => setTg(null)}>✕</button></div>
      <div className="small muted">{tg.code ? <b>{tg.code}</b> : 'Cột'}{tg.col ? ` · ${tg.col}` : ''}</div>
      <label className="small">Gửi đến <select value={to} onChange={e => setTo(e.target.value)}><option value="">— chỉ ghi lại, không gửi ai —</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.role === 'admin' ? ' (quản trị)' : ''}</option>)}</select></label>
      <textarea autoFocus rows={4} placeholder="Nội dung" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
      <div className="row gap" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setTg(null)}>Huỷ</button><button className="btn primary" disabled={busy || !text.trim()} onClick={submit}>Gửi</button></div>
    </div>, document.body)}
  </>
}

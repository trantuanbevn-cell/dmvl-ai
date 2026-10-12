import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { colorOf, reportActivity } from '../lib/presence'

type Edit = { id: string; name: string; eid: string; panel: boolean; k: number; label: string; code: string; at: number }
const STALE = 12000

const labelOf = (el: HTMLElement): string => {
  const lab = el.closest('label'); if (lab) { const t = [...lab.childNodes].find(n => n.nodeType === 3)?.textContent?.trim(); if (t) return t.slice(0, 40) }
  const td = el.closest('td'), th = td?.closest('table')?.querySelectorAll('thead th')[(td as HTMLTableCellElement).cellIndex]
  return (th?.textContent?.trim() || (el as HTMLInputElement).placeholder || '').slice(0, 40)
}

/** CHỈ khi ai đó đang bấm vào ô để sửa (danh mục) thì admin mới thấy: ô được tô viền màu + thẻ tên; không theo dõi di chuột.
 *  Thành viên gửi "đang sửa ô nào của mã nào"; admin nhận và vẽ. Đồng thời báo trạng thái "đang sửa …" cho dải trên cùng của admin. */
export default function LiveCursors({ projectId }: { projectId: string }) {
  const { session, isAdmin, name } = useAuth()
  const [, force] = useState(0)
  const cur = useRef(new Map<string, Edit>())
  useEffect(() => {
    const ch = supabase.channel('cursors-' + projectId, { config: { broadcast: { self: false } } })
    let raf = 0, beat = 0, active: Omit<Edit, 'at'> | null = null
    if (isAdmin) {
      ch.on('broadcast', { event: 'e' }, ({ payload }) => { const p = payload as Edit & { bye?: boolean }; if (p.bye) cur.current.delete(p.id); else cur.current.set(p.id, { ...p, at: Date.now() }) })
      const loop = () => { if (cur.current.size) force(n => (n + 1) % 1e9); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    const send = (p: object) => { if (!isAdmin) ch.send({ type: 'broadcast', event: 'e', payload: p }) }
    const fin = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const host = el.closest('[data-eid],[data-eid-panel]') as HTMLElement | null; if (!host) return
      const panel = host.hasAttribute('data-eid-panel'), eid = (panel ? host.dataset.eidPanel : host.dataset.eid) ?? ''
      const inputs = [...host.querySelectorAll('input,textarea,select')]
      const code = host.dataset.code ?? ''
      const label = labelOf(el)
      active = { id: session.user.id, name, eid, panel, k: inputs.indexOf(el), label, code }
      reportActivity(`đang sửa ${code}${label ? ' · ' + label : ''}`, eid)
      send(active)
    }
    const fout = () => { active = null; reportActivity(null); send({ id: session.user.id, bye: true }) }
    document.addEventListener('focusin', fin)
    document.addEventListener('focusout', fout)
    beat = window.setInterval(() => { if (active) send(active) }, 4000)
    ch.subscribe()
    return () => { cancelAnimationFrame(raf); window.clearInterval(beat); document.removeEventListener('focusin', fin); document.removeEventListener('focusout', fout); if (active) fout(); supabase.removeChannel(ch); cur.current.clear() }
  }, [projectId, isAdmin, session.user.id, name])
  if (!isAdmin) return null
  const now = Date.now()
  const items = [...cur.current.values()].filter(c => now - c.at < STALE).map(c => {
    const host = (document.querySelector(`[data-eid-panel="${c.eid}"]`) ?? document.querySelector(`[data-eid="${c.eid}"]`)) as HTMLElement | null
    const el = host?.querySelectorAll('input,textarea,select')[c.k] as HTMLElement | undefined
    const r = (el ?? host)?.getBoundingClientRect()
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return null
    return { c, r }
  }).filter(Boolean) as { c: Edit; r: DOMRect }[]
  if (!items.length) return null
  return createPortal(<div className="live-cursors">{items.map(({ c, r }) => (
    <div key={c.id} className="live-edit" style={{ left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4, borderColor: colorOf(c.id) }}>
      <span style={{ background: colorOf(c.id) }}>{c.name} đang sửa{c.label ? ` · ${c.label}` : ''}</span>
    </div>))}</div>, document.body)
}

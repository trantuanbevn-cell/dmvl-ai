import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { colorOf } from '../lib/presence'

type Cur = { id: string; name: string; eid?: string | null; fx: number; fy: number; x: number; y: number; at: number }
const STALE = 6000

/** Con trỏ chuột trực tiếp (kiểu Canva) trong danh mục – CHỈ admin nhìn thấy.
 *  Thành viên (không phải admin) gửi vị trí chuột; admin nhận và vẽ. Vị trí gắn theo dòng vật liệu đang trỏ (data-eid)
 *  nên đúng dòng dù màn hình hai máy khác cỡ; ngoài dòng thì tính theo tỉ lệ bề ngang vùng nội dung. */
export default function LiveCursors({ projectId }: { projectId: string }) {
  const { session, isAdmin, name } = useAuth()
  const [, force] = useState(0)
  const cur = useRef(new Map<string, Cur>())
  useEffect(() => {
    const ch = supabase.channel('cursors-' + projectId, { config: { broadcast: { self: false } } })
    let last = 0, raf = 0
    if (isAdmin) {
      ch.on('broadcast', { event: 'c' }, ({ payload }) => { const p = payload as Cur & { bye?: boolean }; if (p.bye) cur.current.delete(p.id); else cur.current.set(p.id, { ...p, at: Date.now() }) })
      const loop = () => { if (cur.current.size) force(n => (n + 1) % 1e9); raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    const move = (e: MouseEvent) => {
      const now = performance.now(); if (now - last < 70) return; last = now
      const page = document.querySelector('.page') as HTMLElement | null; if (!page) return
      const pr = page.getBoundingClientRect()
      const row = (e.target as HTMLElement | null)?.closest?.('[data-eid]') as HTMLElement | null
      const rr = row?.getBoundingClientRect()
      ch.send({ type: 'broadcast', event: 'c', payload: { id: session.user.id, name, eid: row?.dataset.eid ?? null, fx: rr ? (e.clientX - rr.left) / Math.max(1, rr.width) : 0, fy: rr ? (e.clientY - rr.top) / Math.max(1, rr.height) : 0, x: (e.clientX - pr.left) / Math.max(1, pr.width), y: e.clientY - pr.top } })
    }
    const bye = () => { ch.send({ type: 'broadcast', event: 'c', payload: { id: session.user.id, bye: true } }) }
    ch.subscribe()
    if (!isAdmin) { window.addEventListener('mousemove', move, { passive: true }); document.addEventListener('mouseleave', bye) }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', bye); if (!isAdmin) bye(); supabase.removeChannel(ch); cur.current.clear() }
  }, [projectId, isAdmin, session.user.id, name])
  if (!isAdmin) return null
  const now = Date.now(), page = document.querySelector('.page') as HTMLElement | null, pr = page?.getBoundingClientRect()
  const items = [...cur.current.values()].filter(c => now - c.at < STALE).map(c => {
    let left: number, top: number
    const el = c.eid ? (document.querySelector(`[data-eid="${c.eid}"]`) as HTMLElement | null) : null
    if (el) { const r = el.getBoundingClientRect(); left = r.left + c.fx * r.width; top = r.top + c.fy * r.height }
    else if (pr) { left = pr.left + c.x * pr.width; top = pr.top + c.y } else return null
    if (top < -20 || top > window.innerHeight + 20 || left < -20 || left > window.innerWidth + 20) return null
    return { c, left, top }
  }).filter(Boolean) as { c: Cur; left: number; top: number }[]
  if (!items.length) return null
  return createPortal(<div className="live-cursors">{items.map(({ c, left, top }) => (
    <div key={c.id} className="live-cur" style={{ transform: `translate(${left}px, ${top}px)` }}>
      <svg width="16" height="20" viewBox="0 0 16 20"><path d="M1 1 L1 15 L5 11.5 L8 18 L10.5 17 L7.5 10.5 L13 10.5 Z" fill={colorOf(c.id)} stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" /></svg>
      <span style={{ background: colorOf(c.id) }}>{c.name}</span>
    </div>))}</div>, document.body)
}

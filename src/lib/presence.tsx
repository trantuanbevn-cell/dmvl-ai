import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type Online = { id: string; name: string; email: string; role: string; project: string | null; room: string | null; tab: string | null; since: number }
const Ctx = createContext<Online[]>([])
export const useOnline = () => useContext(Ctx)

/** Ai đang online và đang ở dự án / phòng nào (Supabase Realtime Presence – không tốn bảng dữ liệu) */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session, name, role } = useAuth()
  const loc = useLocation()
  const [online, setOnline] = useState<Online[]>([])
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const sinceRef = useRef(Date.now())
  const where = () => {
    const m = /^\/p\/([^/]+)(?:\/([^/]+))?/.exec(loc.pathname)
    return { project: m?.[1] ?? null, tab: m?.[2] ?? null, room: new URLSearchParams(loc.search).get('room') }
  }
  useEffect(() => {
    const ch = supabase.channel('dmvl-online', { config: { presence: { key: session.user.id } } })
    chRef.current = ch
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState() as Record<string, Online[]>
      // tài khoản quản trị không lộ cho thành viên khác (ẩn khỏi danh sách online của họ)
      setOnline(Object.values(st).map(arr => arr[arr.length - 1]).filter(Boolean).filter(o => role === 'admin' || o.role !== 'admin' || o.id === session.user.id))
    }).subscribe(async s => { if (s === 'SUBSCRIBED') await ch.track({ id: session.user.id, name, email: session.user.email ?? '', role: role ?? '', ...where(), since: sinceRef.current }) })
    return () => { supabase.removeChannel(ch); chRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id, role])
  useEffect(() => { chRef.current?.track({ id: session.user.id, name, email: session.user.email ?? '', role: role ?? '', ...where(), since: sinceRef.current }) }, [loc.pathname, loc.search, name, role]) // eslint-disable-line
  return <Ctx.Provider value={online}>{children}</Ctx.Provider>
}

const COLORS = ['#c57542', '#2e7d32', '#1565c0', '#8e24aa', '#00897b', '#ad1457', '#6d4c41', '#ef6c00']
export const colorOf = (id: string) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length]

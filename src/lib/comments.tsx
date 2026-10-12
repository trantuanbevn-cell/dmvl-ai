import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { toast } from './toast'

export type Comment = { id: string; project_id: string; entry_id: string | null; entry_code: string | null; col: string | null; body: string; author_id: string; author_name: string | null; to_user: string | null; status: 'open' | 'done'; seen_at: string | null; done_at: string | null; created_at: string }
type Ctx = { list: Comment[]; inbox: Comment[]; sent: Comment[]; open: number; unseen: number; send: (c: { project_id: string; entry_id: string | null; entry_code: string | null; col: string | null; body: string; to_user: string | null }) => Promise<string | null>; markSeen: (id: string) => void; setDone: (id: string, done: boolean) => Promise<void>; names: Map<string, string> }
const C = createContext<Ctx | null>(null)
export const useComments = () => useContext(C) ?? { list: [], inbox: [], sent: [], open: 0, unseen: 0, send: async () => 'chưa sẵn sàng', markSeen: () => undefined, setDone: async () => undefined, names: new Map<string, string>() } as Ctx

/** Nhận xét gửi cho tôi / tôi đã gửi – cập nhật trực tiếp; nhận xét mới gửi đến tôi hiện thông báo nổi ngay */
export function CommentsProvider({ children }: { children: ReactNode }) {
  const { session, role, name } = useAuth()
  const uid = session.user.id
  const [list, setList] = useState<Comment[]>([])
  const names = useRef(new Map<string, string>())
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('comments').select('*').or(`to_user.eq.${uid},author_id.eq.${uid}`).order('created_at', { ascending: false }).limit(300)
    if (!error) setList((data ?? []) as Comment[])
  }, [uid])
  useEffect(() => {
    if (!role) return
    load()
    let t: number | undefined
    const ch = supabase.channel('comments-' + uid).on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, p => {
      const n = p.new as Partial<Comment> | undefined
      if (p.eventType === 'INSERT' && n?.to_user === uid && n.author_id !== uid) toast(`💬 ${n.author_name ?? 'Có người'} nhận xét${n.entry_code ? ' · ' + n.entry_code : ''}`, 'info')
      window.clearTimeout(t); t = window.setTimeout(load, 300)
    }).subscribe()
    return () => { window.clearTimeout(t); supabase.removeChannel(ch) }
  }, [uid, role, load])
  const v = useMemo<Ctx>(() => {
    const inbox = list.filter(c => c.to_user === uid), sent = list.filter(c => c.author_id === uid)
    return {
      list, inbox, sent, names: names.current,
      open: inbox.filter(c => c.status === 'open').length,
      unseen: inbox.filter(c => c.status === 'open' && !c.seen_at).length,
      send: async c => { const { error } = await supabase.from('comments').insert({ ...c, author_id: uid, author_name: name }); if (error) return error.message; await load(); return null },
      markSeen: id => { const c = list.find(x => x.id === id); if (!c || c.seen_at || c.to_user !== uid) return; setList(l => l.map(x => x.id === id ? { ...x, seen_at: new Date().toISOString() } : x)); supabase.from('comments').update({ seen_at: new Date().toISOString() }).eq('id', id).then(() => undefined) },
      setDone: async (id, done) => { setList(l => l.map(x => x.id === id ? { ...x, status: done ? 'done' : 'open' } : x)); await supabase.from('comments').update({ status: done ? 'done' : 'open', done_at: done ? new Date().toISOString() : null }).eq('id', id) },
    }
  }, [list, uid, name, load])
  return <C.Provider value={v}>{children}</C.Provider>
}

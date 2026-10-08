import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'admin' | 'editor' | 'viewer'
export type Profile = { id: string; email: string | null; full_name: string | null; role: Role; active: boolean }
export const ROLE_VN: Record<Role, string> = { admin: 'Quản trị', editor: 'Chỉnh sửa', viewer: 'Chỉ xem' }
export const ROLE_HELP: Record<Role, string> = {
  admin: 'Toàn quyền: quản lý tài khoản, xoá dự án, chỉnh sửa mọi thứ',
  editor: 'Tải file, chạy phân tích, sửa danh mục, hoàn thành phòng, xuất file',
  viewer: 'Chỉ xem và xuất file, không sửa được dữ liệu',
}

type Ctx = { session: Session; profile: Profile | null; role: Role | null; canEdit: boolean; isAdmin: boolean; name: string; loading: boolean }
const AuthCtx = createContext<Ctx | null>(null)
export const useAuth = () => { const c = useContext(AuthCtx); if (!c) throw new Error('useAuth ngoài AuthProvider'); return c }

export function AuthProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let off = false
    const load = () => supabase.from('profiles').select('id,email,full_name,role,active').eq('id', session.user.id).maybeSingle().then(({ data }) => { if (!off) { setProfile((data as Profile) ?? null); setLoading(false) } })
    load()
    const ch = supabase.channel('profile-' + session.user.id).on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, load).subscribe()
    return () => { off = true; supabase.removeChannel(ch) }
  }, [session.user.id])
  const v = useMemo<Ctx>(() => {
    const ok = !!profile?.active
    const role = ok ? profile!.role : null
    return { session, profile, role, canEdit: role === 'admin' || role === 'editor', isAdmin: role === 'admin', name: profile?.full_name || session.user.email?.split('@')[0] || 'Ẩn danh', loading }
  }, [session, profile, loading])
  return <AuthCtx.Provider value={v}>{children}</AuthCtx.Provider>
}

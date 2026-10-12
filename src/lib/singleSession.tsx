import { useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export const KICK_KEY = 'dmvl_kicked'
const devId = () => { try { let d = localStorage.getItem('dmvl_device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('dmvl_device', d) } return d } catch { return 'nostore' } }
const label = () => { const u = navigator.userAgent; const os = /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Linux/.test(u) ? 'Linux' : 'máy khác'; const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : ''; return `${br} ${os}`.trim() }

/** Mỗi tài khoản chỉ dùng trên 1 máy (quản trị viên: tối đa 2 máy): máy đăng nhập sau cùng giữ phiên, máy cũ nhất tự đăng xuất (nhiều tab trong cùng 1 trình duyệt vẫn dùng được) */
export default function SingleSession() {
  const { session, role } = useAuth()
  useEffect(() => {
    if (!role) return
    const me = devId(), uid = session.user.id, max = role === 'admin' ? 2 : 1
    const ids = (v?: string | null) => (v ?? '').split(',').filter(Boolean)
    let dead = false, off = false
    const kick = async () => { if (off) return; off = true; try { localStorage.setItem(KICK_KEY, '1') } catch { /* */ } await supabase.auth.signOut() }
    const claim = async () => {
      const cur = await supabase.from('user_sessions').select('device_id').eq('user_id', uid).maybeSingle()
      if (cur.error) { dead = true; return }   // chưa có bảng → không áp dụng giới hạn
      const have = ids(cur.data?.device_id)
      const next = have.includes(me) ? have : [...have, me].slice(-max)   // giữ các máy mới nhất, tối đa `max`
      const { error } = await supabase.from('user_sessions').upsert({ user_id: uid, device_id: next.join(','), device_label: label(), updated_at: new Date().toISOString() })
      if (error) dead = true
    }
    const check = async () => {
      if (dead || off) return
      const { data, error } = await supabase.from('user_sessions').select('device_id').eq('user_id', uid).maybeSingle()
      if (error) return
      if (data && !ids(data.device_id).includes(me)) kick()
    }
    // lần đầu mở trang: nếu máy này vừa đăng nhập mới (không bị đá) thì giành phiên
    claim().then(check)
    const t = window.setInterval(check, 15000)
    const vis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', vis)
    const ch = supabase.channel('sess-' + uid).on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions', filter: `user_id=eq.${uid}` }, check).subscribe()
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', vis); supabase.removeChannel(ch) }
  }, [session.user.id, role]) // eslint-disable-line
  return null
}

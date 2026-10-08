import { supabase, FUNCTIONS_URL } from './supabase'
import type { Role } from './auth'

export type TeamUser = { id: string; email: string; full_name: string | null; role: Role; active: boolean; created_at: string; last_sign_in_at: string | null }
async function call<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/admin-users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error ?? `Lỗi ${res.status}`)
  return j as T
}
export const listUsers = () => call<{ users: TeamUser[] }>('list').then(r => r.users)
export const createUser = (u: { username: string; password: string; full_name: string; role: Role }) => call<{ id: string; email: string }>('create', u)
export const loginName = (email: string | null | undefined) => (email ?? '').replace(/@dmvl\.local$/i, '')
export const slugName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)
export const appLink = () => `${location.origin}${location.pathname}`
/** Nội dung "bảng tin" gửi cho thành viên */
export const inviteText = (name: string, username: string, password: string) => `PHẦN MỀM DMVL – GS-ARCHI\nLink: ${appLink()}\nTên đăng nhập: ${username}\nMật khẩu dùng lần đầu: ${password}\n(Lần đăng nhập đầu tiên phần mềm sẽ yêu cầu bạn tự đặt mật khẩu riêng.)\nXin chào ${name}!`
export const updateUser = (id: string, patch: { role?: Role; active?: boolean; full_name?: string; password?: string }) => call('update', { id, ...patch })
export const deleteUser = (id: string) => call('delete', { id })
export const genPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(12)), v => a[v % a.length]).join('') }

// ---- Gán dự án cho từng thành viên (bảng project_members; chỉ quản trị ghi được)
export type ProjectLite = { id: string; name: string }
export const listProjectsLite = async (): Promise<ProjectLite[]> => { const { data } = await supabase.from('projects').select('id,name').order('created_at', { ascending: false }); return (data ?? []) as ProjectLite[] }
/** user_id → danh sách project_id. Trả về null nếu chưa chạy migration phân quyền theo dự án */
export async function listMembers(): Promise<Map<string, string[]> | null> {
  const { data, error } = await supabase.from('project_members').select('project_id,user_id')
  if (error) return null
  const m = new Map<string, string[]>()
  for (const r of data ?? []) m.set(r.user_id, [...(m.get(r.user_id) ?? []), r.project_id])
  return m
}
export async function setMemberProjects(userId: string, projectIds: string[]) {
  const { data, error } = await supabase.from('project_members').select('project_id').eq('user_id', userId)
  if (error) throw new Error(error.message)
  const have = new Set((data ?? []).map(r => r.project_id as string)), want = new Set(projectIds)
  const del = [...have].filter(p => !want.has(p)), add = [...want].filter(p => !have.has(p))
  if (del.length) { const r = await supabase.from('project_members').delete().eq('user_id', userId).in('project_id', del); if (r.error) throw new Error(r.error.message) }
  if (add.length) { const r = await supabase.from('project_members').insert(add.map(project_id => ({ project_id, user_id: userId }))); if (r.error) throw new Error(r.error.message) }
}

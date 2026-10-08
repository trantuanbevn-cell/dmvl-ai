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
export const createUser = (u: { email: string; password: string; full_name: string; role: Role }) => call('create', u)
export const updateUser = (id: string, patch: { role?: Role; active?: boolean; full_name?: string; password?: string }) => call('update', { id, ...patch })
export const deleteUser = (id: string) => call('delete', { id })
export const genPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(12)), v => a[v % a.length]).join('') }

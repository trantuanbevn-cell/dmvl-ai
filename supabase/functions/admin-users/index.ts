// Edge Function "admin-users": quản trị tài khoản (chỉ admin). Dùng service role nên khoá không lộ ra trình duyệt.
// Hành động: list | create | update | delete   (body JSON: { action, ... })
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const ROLES = ['admin', 'editor', 'viewer']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, service, { auth: { persistSession: false } })
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u, error: ue } = await admin.auth.getUser(token)
    if (ue || !u?.user) return json({ error: 'Chưa đăng nhập' }, 401)
    const { data: me } = await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle()
    if (!me || !me.active || me.role !== 'admin') return json({ error: 'Chỉ quản trị viên mới được quản lý tài khoản' }, 403)

    const b = await req.json()
    const adminsLeft = async (excludeId: string) => {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true).neq('id', excludeId)
      return (count ?? 0) > 0
    }

    if (b.action === 'list') {
      const { data: profiles } = await admin.from('profiles').select('*').order('created_at')
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const last = new Map((users?.users ?? []).map(x => [x.id, x.last_sign_in_at]))
      return json({ users: (profiles ?? []).map(p => ({ ...p, last_sign_in_at: last.get(p.id) ?? null })) })
    }

    if (b.action === 'create') {
      // chỉ cần TÊN ĐĂNG NHẬP (không cần email thật): lưu dưới dạng ten@dmvl.local; vẫn nhận email thật nếu có @
      let email = String(b.email ?? b.username ?? '').trim().toLowerCase(); const password = String(b.password ?? '')
      if (!email.includes('@')) { if (!/^[a-z0-9._-]{3,30}$/.test(email)) return json({ error: 'Tên đăng nhập 3–30 ký tự: chữ không dấu, số, . _ -' }, 400); email += '@dmvl.local' }
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Tên đăng nhập không hợp lệ' }, 400)
      if (password.length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400)
      const role = ROLES.includes(b.role) ? b.role : 'viewer'
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { must_change: true } })
      if (error || !data.user) return json({ error: error?.message ?? 'Không tạo được tài khoản' }, 400)
      const { error: pe } = await admin.from('profiles').upsert({ id: data.user.id, email, full_name: String(b.full_name ?? '').trim() || email.split('@')[0], role, active: true })
      if (pe) { await admin.auth.admin.deleteUser(data.user.id); return json({ error: pe.message }, 400) }
      return json({ ok: true, id: data.user.id })
    }

    if (b.action === 'update') {
      const id = String(b.id)
      const patch: Record<string, unknown> = {}
      if (b.role !== undefined) { if (!ROLES.includes(b.role)) return json({ error: 'Vai trò không hợp lệ' }, 400); patch.role = b.role }
      if (b.active !== undefined) patch.active = !!b.active
      if (b.full_name !== undefined) patch.full_name = String(b.full_name).trim()
      if ((patch.role && patch.role !== 'admin') || patch.active === false) if (!(await adminsLeft(id))) return json({ error: 'Phải còn ít nhất một quản trị viên đang hoạt động' }, 400)
      if (Object.keys(patch).length) { const { error } = await admin.from('profiles').update(patch).eq('id', id); if (error) return json({ error: error.message }, 400) }
      const authPatch: Record<string, unknown> = {}
      if (b.password) { if (String(b.password).length < 8) return json({ error: 'Mật khẩu tối thiểu 8 ký tự' }, 400); authPatch.password = String(b.password); authPatch.user_metadata = { must_change: true } }
      if (patch.active !== undefined) authPatch.ban_duration = patch.active ? 'none' : '876000h' // khoá hẳn đăng nhập khi ngưng tài khoản
      if (Object.keys(authPatch).length) { const { error } = await admin.auth.admin.updateUserById(id, authPatch); if (error) return json({ error: error.message }, 400) }
      return json({ ok: true })
    }

    if (b.action === 'delete') {
      const id = String(b.id)
      if (id === u.user.id) return json({ error: 'Không thể tự xoá tài khoản của mình' }, 400)
      if (!(await adminsLeft(id))) return json({ error: 'Phải còn ít nhất một quản trị viên' }, 400)
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }
    return json({ error: 'Hành động không hợp lệ' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})

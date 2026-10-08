// Edge Function "fetch-product": tải trang sản phẩm của nhà sản xuất hộ trình duyệt (trình duyệt bị chặn CORS).
// Chỉ trả HTML thô; việc đọc thông số làm ở trình duyệt (không dùng AI). Chặn địa chỉ nội bộ (SSRF), giới hạn dung lượng + thời gian.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MAX = 2_500_000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function privateIp(h: string) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h)
  if (m) { const [a, b] = [+m[1], +m[2]]; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224 }
  const l = h.toLowerCase()
  return l === 'localhost' || l.endsWith('.localhost') || l.endsWith('.local') || l.endsWith('.internal') || l.includes(':') || !l.includes('.')
}
async function safe(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('Chỉ nhận link http/https')
  if (u.username || u.password) throw new Error('Link không hợp lệ')
  if (privateIp(u.hostname)) throw new Error('Địa chỉ không được phép')
  try { // kiểm tra cả IP thật sau khi phân giải tên miền
    for (const t of ['A', 'AAAA'] as const) { const r = await Deno.resolveDns(u.hostname, t).catch(() => []); for (const ip of r as string[]) if (privateIp(ip)) throw new Error('Địa chỉ không được phép') }
  } catch (e) { if (String((e as Error).message).includes('không được phép')) throw e }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u, error: ue } = await admin.auth.getUser(token)
    if (ue || !u?.user) return json({ error: 'Chưa đăng nhập' }, 401)
    const { data: me } = await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle()
    if (!me || !me.active || !['admin', 'editor'].includes(me.role)) return json({ error: 'Không có quyền' }, 403)

    const b = await req.json()
    let cur = new URL(String(b.url ?? '').trim())
    let res: Response | null = null
    for (let i = 0; i < 5; i++) {
      await safe(cur)
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 12000)
      try {
        res = await fetch(cur, { redirect: 'manual', signal: ac.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'vi,en;q=0.8' } })
      } finally { clearTimeout(to) }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { cur = new URL(res.headers.get('location')!, cur); res = null; continue }
      break
    }
    if (!res) return json({ error: 'Quá nhiều lần chuyển hướng' }, 502)
    if (!res.ok) return json({ error: `Trang trả về lỗi ${res.status}${res.status === 403 || res.status === 429 ? ' (trang chặn truy cập tự động)' : ''}`, status: res.status }, 200)
    const ct = res.headers.get('content-type') ?? ''
    if (!/html|xml|text/i.test(ct)) return json({ error: 'Link không phải trang web (loại ' + ct + ')' }, 200)
    const reader = res.body!.getReader(); const chunks: Uint8Array[] = []; let n = 0
    while (n < MAX) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.length }
    try { reader.cancel() } catch { /* */ }
    const buf = new Uint8Array(Math.min(n, MAX)); let o = 0; for (const c of chunks) { const s = c.subarray(0, Math.min(c.length, buf.length - o)); buf.set(s, o); o += s.length; if (o >= buf.length) break }
    let cs = /charset=([\w-]+)/i.exec(ct)?.[1]
    if (!cs) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder('latin1').decode(buf.subarray(0, 4096)))?.[1]
    let html: string
    try { html = new TextDecoder(cs ?? 'utf-8').decode(buf) } catch { html = new TextDecoder('utf-8').decode(buf) }
    return json({ ok: true, url: cur.toString(), html })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 200)
  }
})

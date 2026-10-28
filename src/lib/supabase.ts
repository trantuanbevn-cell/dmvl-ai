import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing')
export const FUNCTIONS_URL = `${url}/functions/v1`
export const BUCKET = 'concept'

// Link ký có hạn 24 giờ và được nhớ trong trình duyệt (localStorage) → mở lại dự án trong ngày dùng lại đúng link cũ,
// nên trình duyệt dùng ảnh đã lưu thay vì tải lại từ Supabase (tiết kiệm egress). Còn <2 giờ thì ký lại.
const SIGN_TTL = 86400, SIGN_MIN_LEFT = 7200_000, LS_KEY = 'dmvl-signed-v1', LS_MAX = 2500
const urlCache = new Map<string, { url: string; exp: number }>()
try {
  const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Record<string, { url: string; exp: number }>
  for (const [k, v] of Object.entries(raw)) if (v && v.exp > Date.now() + SIGN_MIN_LEFT) urlCache.set(k, v)
} catch { /* không có localStorage → chỉ nhớ trong phiên */ }
let saveT: ReturnType<typeof setTimeout> | null = null
function persist() {
  if (saveT) return
  saveT = setTimeout(() => {
    saveT = null
    try {
      const all = [...urlCache.entries()].sort((a, b) => b[1].exp - a[1].exp).slice(0, LS_MAX)
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(all)))
    } catch { /* đầy bộ nhớ → bỏ qua */ }
  }, 1500)
}
const keep = (path: string, url: string) => { urlCache.set(path, { url, exp: Date.now() + SIGN_TTL * 1000 }); persist() }
/** Ảnh/tệp ở đường dẫn này vừa bị ghi đè hoặc xoá → bỏ link cũ để lần sau ký link mới (tải bản mới) */
export function dropSigned(path: string) { if (urlCache.delete(path)) persist() }
{ // mọi ghi/xoá trong bucket dự án đều tự bỏ link cũ
  const origFrom = supabase.storage.from.bind(supabase.storage)
  ;(supabase.storage as any).from = (b: string) => {
    const s: any = origFrom(b)
    if (b !== BUCKET) return s
    const up = s.upload.bind(s), rm = s.remove.bind(s)
    s.upload = (p: string, ...a: any[]) => up(p, ...a).then((r: any) => { dropSigned(p); return r })
    s.remove = (ps: string[]) => rm(ps).then((r: any) => { ps.forEach(dropSigned); return r })
    return s
  }
}
const fresh = (path: string) => { const c = urlCache.get(path); return c && c.exp > Date.now() + SIGN_MIN_LEFT ? c : undefined }
/** Link tạm thời (24 giờ) cho ảnh trong bucket riêng tư – dùng cho hiển thị và gửi Claude đọc */
export async function signedUrl(path: string): Promise<string> {
  const c = fresh(path); if (c) return c.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL)
  if (error || !data) throw error ?? new Error('signed url failed')
  keep(path, data.signedUrl)
  return data.signedUrl
}
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const need = paths.filter(p => { const c = fresh(p); if (c) { out[p] = c.url; return false } return true })
  if (need.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, SIGN_TTL)
    if (error) throw error
    for (const d of data ?? []) if (d.path && d.signedUrl) { out[d.path] = d.signedUrl; keep(d.path, d.signedUrl) }
  }
  return out
}

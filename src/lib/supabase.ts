import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const configured = Boolean(url && key)
export const supabase = createClient(url || 'http://localhost', key || 'missing')
export const FUNCTIONS_URL = `${url}/functions/v1`
export const BUCKET = 'concept'

const urlCache = new Map<string, { url: string; exp: number }>()
/** Link tạm thời (2 giờ) cho ảnh trong bucket riêng tư – dùng cho hiển thị và gửi Claude đọc */
export async function signedUrl(path: string): Promise<string> {
  const c = urlCache.get(path)
  if (c && c.exp > Date.now() + 60_000) return c.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 7200)
  if (error || !data) throw error ?? new Error('signed url failed')
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 7200_000 })
  return data.signedUrl
}
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const need = paths.filter(p => { const c = urlCache.get(p); if (c && c.exp > Date.now() + 60_000) { out[p] = c.url; return false } return true })
  if (need.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, 7200)
    if (error) throw error
    for (const d of data ?? []) if (d.path && d.signedUrl) { out[d.path] = d.signedUrl; urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 7200_000 }) }
  }
  return out
}

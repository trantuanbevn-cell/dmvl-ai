import { supabase, FUNCTIONS_URL } from './supabase'
import { saveEntry } from './entryLink'
import { extractProduct, planFill, type Extracted, type FieldChange } from './productExtract'
import type { Entry } from './types'

export const normalizeUrl = (s: string) => { const t = s.trim(); if (!t) return ''; return /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t) ? 'https://' + t : t }
export const isUrl = (s: string) => { try { const u = new URL(normalizeUrl(s)); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') } catch { return false } }

/** Tải và đọc trang sản phẩm (qua edge function fetch-product vì trình duyệt bị chặn CORS) */
export async function readProductPage(url: string): Promise<Extracted> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/fetch-product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ url: normalizeUrl(url) }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.error) throw new Error(j.error ?? 'Không đọc được link (lỗi ' + res.status + ')')
  const ex = extractProduct(String(j.html ?? ''), String(j.url ?? url))
  if (!ex.product_name && !ex.specs.length && !ex.product_code) throw new Error('Đọc được trang nhưng không thấy thông số (trang có thể dựng bằng JavaScript hoặc cần đăng nhập)')
  return ex
}
export async function applyFill(e: Entry, ch: FieldChange[]) {
  if (!ch.length) return null
  const patch: Record<string, unknown> = {}; for (const c of ch) patch[c.key] = c.value
  return saveEntry(e, patch)
}
export { planFill }
export type { Extracted, FieldChange }

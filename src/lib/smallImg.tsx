// Ảnh nhỏ cho thư viện vật liệu: mỗi ảnh gốc có thêm bản 320×160 (cắt giữa, tỉ lệ 2:1, ~10–20KB) nằm cạnh ảnh gốc
// với tên `<tên>_s.jpg`. Lưới thư viện, bảng so vân AI… chỉ tải bản nhỏ → tiết kiệm băng thông Supabase (egress).
// Ảnh gốc chỉ tải khi bấm xem to. Chưa có bản nhỏ (chưa chạy "Tạo ảnh nhỏ") → tự quay về ảnh gốc.
import { useState } from 'react'
import { supabase } from './supabase'

const MARK = '/storage/v1/object/public/materials/'
export const SMALL_W = 320, SMALL_H = 160
const ONE_YEAR = '31536000'

/** đường dẫn trong bucket từ URL công khai (null nếu không phải ảnh của bucket materials) */
export function pathOfUrl(u?: string | null): string | null {
  if (!u) return null
  const i = u.indexOf(MARK); if (i < 0) return null
  try { return decodeURIComponent(u.slice(i + MARK.length).split(/[?#]/)[0]) } catch { return null }
}
export const smallPathOf = (path: string) => path.replace(/\.[a-z0-9]+$/i, '') + '_s.jpg'
/** URL ảnh nhỏ tương ứng (null nếu không suy ra được → dùng ảnh gốc) */
export function smallUrl(u?: string | null): string | null {
  const p = pathOfUrl(u); if (!p) return null
  return supabase.storage.from('materials').getPublicUrl(smallPathOf(p)).data.publicUrl
}

const missing = new Set<string>()   // URL ảnh nhỏ đã thử mà chưa có (trong phiên này) → khỏi hỏi lại
export const markSmallMissing = (url: string) => { missing.add(url) }
export const isSmallMissing = (url: string) => missing.has(url)
/** URL nên dùng để hiển thị: ảnh nhỏ nếu có thể, không thì ảnh gốc */
export function thumbUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  const s = smallUrl(u)
  return s && !missing.has(s) ? s : u
}

/** Ảnh vật liệu trong lưới: tải bản nhỏ trước, lỗi thì dùng ảnh gốc, lỗi nữa thì ẩn */
export function MatThumb({ url, lazy, style }: { url: string; lazy?: boolean; style?: React.CSSProperties }) {
  const [src, setSrc] = useState(() => thumbUrl(url) ?? url)
  const [last, setLast] = useState(url)
  if (last !== url) { setLast(url); setSrc(thumbUrl(url) ?? url) }
  return <img src={src} alt="" decoding="async" loading={lazy ? 'lazy' : undefined} referrerPolicy="no-referrer"
    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }}
    onError={e => { if (src !== url) { markSmallMissing(src); setSrc(url) } else (e.target as HTMLImageElement).style.visibility = 'hidden' }} />
}

/** Cắt giữa theo tỉ lệ 2:1 rồi thu về 320×160 JPEG */
export async function makeSmall(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  try {
    const c = document.createElement('canvas'); c.width = SMALL_W; c.height = SMALL_H
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, SMALL_W, SMALL_H)
    const r = Math.max(SMALL_W / bmp.width, SMALL_H / bmp.height), sw = SMALL_W / r, sh = SMALL_H / r
    g.imageSmoothingQuality = 'high'
    g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, SMALL_W, SMALL_H)
    return await new Promise<Blob>((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('toBlob')), 'image/jpeg', 0.78))
  } finally { bmp.close() }
}
/** Ghi ảnh nhỏ (cho trình duyệt nhớ 1 năm vì nội dung không đổi) */
export async function uploadSmall(origPath: string, original: Blob): Promise<void> {
  const sm = await makeSmall(original)
  const { error } = await supabase.storage.from('materials').upload(smallPathOf(origPath), sm, { contentType: 'image/jpeg', upsert: true, cacheControl: ONE_YEAR })
  if (error) throw new Error(error.message)
}
export const IMMUTABLE_CACHE = ONE_YEAR

/** Admin: tạo ảnh nhỏ cho các mã thư viện chưa có (dừng giữa chừng rồi chạy lại được; mỗi ảnh gốc tải 1 lần) */
export async function backfillSmall(onProgress: (done: number, total: number, msg?: string) => void, stop: () => boolean): Promise<{ made: number; failed: number }> {
  // 1) gom đường dẫn ảnh gốc từ DB
  const paths = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('materials').select('tex_url').not('tex_url', 'is', null).order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) { const p = pathOfUrl((r as any).tex_url); if (p) paths.add(p) }
    if (!data || data.length < 1000) break
  }
  // 2) liệt kê ảnh nhỏ đã có theo từng thư mục
  onProgress(0, paths.size, 'Đang kiểm tra ảnh nhỏ đã có…')
  const dirs = new Set([...paths].map(p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''))
  const have = new Set<string>()
  for (const d of dirs) {
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase.storage.from('materials').list(d, { limit: 1000, offset: off })
      if (error) throw new Error(error.message)
      for (const f of data ?? []) if (/_s\.jpg$/i.test(f.name)) have.add((d ? d + '/' : '') + f.name)
      if (!data || data.length < 1000) break
    }
  }
  const todo = [...paths].filter(p => !have.has(smallPathOf(p)))
  const total = todo.length; let done = 0, made = 0, failed = 0, i = 0
  if (!total) { onProgress(0, 0, 'Đã đủ ảnh nhỏ'); return { made, failed } }
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (i < todo.length && !stop()) {
      const p = todo[i++]
      try {
        const res = await fetch(supabase.storage.from('materials').getPublicUrl(p).data.publicUrl)
        if (!res.ok) throw new Error(String(res.status))
        await uploadSmall(p, await res.blob()); made++
      } catch { failed++ }
      done++; if (done % 10 === 0 || done === total) onProgress(done, total)
    }
  }))
  onProgress(done, total)
  return { made, failed }
}

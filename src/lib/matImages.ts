// Ảnh vật liệu: ảnh chính (mat_view / ảnh từ link) + tối đa 2 ảnh phụ (mat_extra) → tối đa 3 ảnh mỗi dòng
import type { Entry } from './types'
import { regionCanvas } from './crop'

export type MatImg = { img?: string | null; region?: number[] | null }
export const MAT_MAX = 3
export const extrasOf = (e: Entry): MatImg[] => ((e.mat_extra ?? []) as MatImg[]).filter(x => x && (x.img || x.region)).slice(0, MAT_MAX - 1)
export const extraPaths = (e: Entry): string[] => extrasOf(e).map(x => x.img).filter(Boolean) as string[]

/** Ghép 1–3 ảnh vật liệu thành một ảnh duy nhất tỉ lệ 120:92 để chèn vào ô xuất file (null nếu chỉ có ≤1 ảnh → dùng cách cũ) */
export async function matMontage(e: Entry, urls: Record<string, string>): Promise<string | null> {
  const ex = extrasOf(e); if (!ex.length) return null
  const list: { src: string; region?: number[] | null }[] = []
  const main = e.mat_view?.img ? urls[e.mat_view.img] : e.product_image_url
  if (main) list.push({ src: main, region: e.mat_view?.region })
  for (const x of ex) { const s = x.img ? urls[x.img] : e.product_image_url; if (s) list.push({ src: s, region: x.region }) }
  if (list.length < 2) return null
  const W = 720, H = 552, gap = 10, n = list.length, cw = (W - gap * (n - 1)) / n
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H)
  for (const [i, it] of list.entries()) {
    try {
      const cv = await regionCanvas(it.src, it.region, 400)
      const s = Math.min(cw / cv.width, H / cv.height), w = cv.width * s, h = cv.height * s
      g.drawImage(cv, i * (cw + gap) + (cw - w) / 2, (H - h) / 2, w, h)
    } catch { /* bỏ ảnh lỗi */ }
  }
  return c.toDataURL('image/png')
}

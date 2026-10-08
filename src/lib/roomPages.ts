// Trang concept dùng chung giữa các phòng (slide đôi đã tách): trang thuộc phòng chính, ô ảnh nào của phòng nào ghi trong views.rect_rooms
import type { Page } from './types'
import type { Rect } from './renders'
import type { CSSProperties } from 'react'

type V = { rects?: Rect[]; rect_rooms?: string[] } | null
export const rectsOf = (p: Page) => ((p.views as V)?.rects ?? []) as Rect[]
export const isShared = (p: Page, roomId: string) => !!((p.views as V)?.rect_rooms ?? []).includes(roomId)
/** Các trang của một phòng, kể cả trang chung với phòng khác */
export const roomPages = (pages: Page[], roomId: string | undefined | null) => roomId ? pages.filter(p => p.room_id === roomId || isShared(p, roomId)) : []
/** Ô ảnh đầu tiên của trang thuộc về phòng (chỉ khi trang đã tách ô ảnh theo phòng) */
export function roomRect(p: Page, roomId: string): Rect | null {
  const v = p.views as V, rr = v?.rect_rooms
  if (!rr || !v?.rects) return null
  const i = rr.indexOf(roomId)
  return i >= 0 ? v.rects[i] ?? null : null
}
/** Nền CSS hiển thị đúng ô ảnh r của trang (phủ kín khung có tỉ lệ ar = rộng/cao) */
export function rectBg(url: string, p: Page, r: Rect, ar = 16 / 9): CSSProperties {
  const P = (p.width ?? 1600) / (p.height ?? 900), ch = 1 / ar
  const s = Math.max(1 / r.w, ch / (r.h / P))
  const iw = s, ih = s / P
  const px = iw > 1 ? ((0.5 - (r.x + r.w / 2) * iw) / (1 - iw)) * 100 : 0
  const py = ih > ch ? ((ch / 2 - (r.y + r.h / 2) * ih) / (ch - ih)) * 100 : 0
  return { backgroundImage: `url("${url}")`, backgroundRepeat: 'no-repeat', backgroundSize: `${iw * 100}% ${(ih / ch) * 100}%`, backgroundPosition: `${Math.max(0, Math.min(100, px))}% ${Math.max(0, Math.min(100, py))}%` }
}

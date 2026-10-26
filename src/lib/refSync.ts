// ĐỒNG BỘ THAM CHIẾU khi mã / ký hiệu bị đổi (sắp xếp lại thứ tự, kéo thả…): mọi ô chữ trong dự án đang nhắc tới ký hiệu cũ (mô tả, cấu tạo, mã vật liệu,
// ghi chú…) được đổi sang ký hiệu mới của ĐÚNG vật liệu đó, để thông tin luôn trỏ đúng vật liệu. Thay đồng thời một lượt nên hoán đổi (A↔B) không bị chồng chéo.
import { supabase } from './supabase'
import { symbolMap } from './sections'
import type { Entry } from './types'

/** Các ô chữ của vật liệu có thể nhắc tới mã/ký hiệu của vật liệu khác */
export const REF_FIELDS = ['desc_vn', 'desc_en', 'note_vn', 'note_en', 'perf_vn', 'perf_en', 'composition', 'product_code', 'material_vn', 'material_en', 'loc_note_vn', 'loc_note_en', 'standards', 'part_vn', 'part_en', 'name_vn', 'name_en'] as const

/** token cũ → token mới, cho cả mã nội bộ (FB-03) lẫn ký hiệu bản vẽ (FAB-03). Ký hiệu bản vẽ thắng khi trùng token */
export function refMap(before: Entry[], after: Entry[]): Map<string, string> {
  const m = new Map<string, string>(), aft = new Map(after.map(e => [e.id, e]))
  for (const e of before) { const a = aft.get(e.id); if (a && a.code !== e.code) m.set(e.code, a.code) }
  const sb = symbolMap(before), sa = symbolMap(after)
  for (const [id, old] of sb) { const nw = sa.get(id); if (nw && nw !== old) m.set(old, nw) }
  return m
}
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function rewriteRefs(text: string, map: Map<string, string>, re?: RegExp): string {
  if (!text || !map.size) return text
  const r = re ?? new RegExp(`(?<![A-Za-z0-9])(${[...map.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![0-9])`, 'g')
  return text.replace(r, t => map.get(t) ?? t)
}

export type RefSyncResult = { entries: number; fields: number }
/** Đổi mọi tham chiếu trong toàn bộ dự án theo `map`. `entries` = trạng thái các vật liệu TRƯỚC khi đổi (chữ chưa đổi). Cũng cập nhật nhãn mã ở nhận xét / gợi ý QC. */
export async function syncRefs(entries: Entry[], map: Map<string, string>, newCode: Map<string, string>): Promise<RefSyncResult> {
  const res: RefSyncResult = { entries: 0, fields: 0 }
  if (!map.size && !newCode.size) return res
  const re = map.size ? new RegExp(`(?<![A-Za-z0-9])(${[...map.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![0-9])`, 'g') : undefined
  const jobs: (() => Promise<unknown>)[] = []
  for (const e of entries) {
    const patch: Record<string, unknown> = {}
    const src = e.en_src ? JSON.parse(JSON.stringify(e.en_src)) as Record<string, { vi: string; en: string }> : null
    let srcChanged = false
    for (const f of REF_FIELDS) {
      const v = (e as unknown as Record<string, unknown>)[f]
      if (typeof v !== 'string' || !v) continue
      const nv = rewriteRefs(v, map, re)
      if (nv === v) continue
      patch[f] = nv; res.fields++
      const t = src?.[f]; if (t) { t.vi = rewriteRefs(t.vi, map, re); t.en = rewriteRefs(t.en, map, re); srcChanged = true }   // giữ dấu vết dịch khớp để không bị dịch lại
    }
    if (srcChanged) patch.en_src = src
    if (Object.keys(patch).length) { res.entries++; jobs.push(async () => { const { error } = await supabase.from('entries').update(patch).eq('id', e.id); if (error) throw new Error(`Đồng bộ ${e.name_vn}: ${error.message}`) }) }
  }
  // nhãn mã ở nhận xét và gợi ý QC (chỉ hiển thị, gắn theo entry_id)
  for (const [id, code] of newCode) {
    jobs.push(async () => { await supabase.from('comments').update({ entry_code: code }).eq('entry_id', id) })
    jobs.push(async () => { await supabase.from('qc_findings').update({ code }).eq('entry_id', id) })
  }
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map(j => j()))
  return res
}

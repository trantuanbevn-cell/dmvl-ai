// Gộp mã trùng: cùng một vật liệu thật nhưng bị tạo thành nhiều mã (do nhiều góc camera). Phần mềm tự so, không dùng AI.
import { supabase } from './supabase'
import { findSimilar } from './similar'
import type { Entry } from './types'

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message ?? String(error))
  return data
}
const codeNum = (c: string) => Number(/(\d+)$/.exec(c)?.[1] ?? 0)

/** Gộp `dup` vào `keep`: chuyển vị trí xuất hiện, tham chiếu cha/con, điền các ô còn trống, rồi xoá `dup` */
export async function mergeEntries(keep: Entry, dup: Entry, all: Entry[]) {
  await must(supabase.from('occurrences').update({ entry_id: keep.id }).eq('entry_id', dup.id))
  await must(supabase.from('entries').update({ parent_id: keep.id }).eq('parent_id', dup.id))
  // các mã tổ hợp nhắc tới mã bị gộp → đổi sang mã giữ lại
  for (const e of all) if (e.id !== dup.id && e.composition?.includes(dup.code)) {
    const re = new RegExp(`\\b${dup.code}\\b`, 'g')
    await must(supabase.from('entries').update({ composition: e.composition.replace(re, keep.code) }).eq('id', e.id))
  }
  const patch: Record<string, unknown> = {}
  for (const k of ['name_en', 'part_vn', 'part_en', 'material_vn', 'material_en', 'color_hex', 'desc_vn', 'desc_en', 'brand', 'product_code', 'product_name', 'product_url', 'product_image_url', 'origin', 'note_vn', 'note_en', 'parent_id'] as const)
    if ((keep[k] == null || keep[k] === '') && dup[k]) patch[k] = dup[k]
  if (keep.qty == null && dup.qty != null) { patch.qty = dup.qty; patch.unit = dup.unit; patch.qty_flag = dup.qty_flag; patch.qty_note = dup.qty_note }
  if (keep.parent_id === dup.id) patch.parent_id = null
  if (Object.keys(patch).length) await must(supabase.from('entries').update(patch).eq('id', keep.id))
  await must(supabase.from('entries').delete().eq('id', dup.id))
}

export type DupPair = { keep: Entry; dup: Entry; score: number; dE: number | null; why: string[] }
/** Tìm các cặp mã có khả năng là một vật liệu. strict=true: chỉ những cặp gần như chắc chắn (dùng để tự gộp) */
export function findDuplicates(entries: Entry[], strict = false): DupPair[] {
  const live = entries.filter(e => e.status !== 'rejected' && e.source !== 'inferred' && e.group_code !== 'AW')
  const seen = new Set<string>(), out: DupPair[] = []
  for (const e of live) {
    for (const s of findSimilar(live.filter(x => x.id !== e.id && x.group_code === e.group_code && x.parent_id === e.parent_id), { group: e.group_code, name: e.name_vn, material: e.material_vn ?? '', color: e.color_hex, brand: e.brand ?? undefined, product_code: e.product_code ?? undefined }, 3)) {
      const key = [e.id, s.entry.id].sort().join('|'); if (seen.has(key)) continue
      if (strict ? !(s.score >= 0.9 && (s.dE == null || s.dE < 8) && !(e.product_code && s.entry.product_code && e.product_code !== s.entry.product_code)) : s.score < 0.7) continue
      if (e.status === 'approved' && s.entry.status === 'approved' && strict) continue
      seen.add(key)
      const [keep, dup] = codeNum(e.code) <= codeNum(s.entry.code) ? [e, s.entry] : [s.entry, e]
      out.push({ keep, dup, score: s.score, dE: s.dE, why: s.why })
    }
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Tự gộp các cặp gần như chắc chắn trùng; trả về số mã đã gộp */
export async function autoMerge(entries: Entry[]): Promise<number> {
  let n = 0, cur = entries
  for (let guard = 0; guard < 40; guard++) {
    const pair = findDuplicates(cur, true).find(p => p.dup.status !== 'approved' || p.keep.status === 'approved')
    if (!pair) break
    await mergeEntries(pair.keep, pair.dup, cur)
    cur = cur.filter(e => e.id !== pair.dup.id); n++
  }
  return n
}

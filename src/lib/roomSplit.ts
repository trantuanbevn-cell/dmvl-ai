// Tách một "phòng" thực ra gồm nhiều phòng (cùng một slide concept) thành các phòng riêng – không dùng AI.
import { supabase } from './supabase'
import type { Page, Room, Occurrence } from './types'
import type { PageViews } from './planPipeline'
import type { ProjectData } from './useProject'

export type Part = { name_vn: string; name_en: string }
const VN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
const AREA = /^\s*S\s*[=:]\s*[\d.,]+\s*m/i
const sentence = (s: string) => { const t = s.toLowerCase().trim(); return t.charAt(0).toUpperCase() + t.slice(1) }
const title = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).trim()
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Slide ghi nhiều tiêu đề phòng, mỗi tiêu đề kèm “S=…m²”: lấy 1–2 dòng ngay trước mỗi ô diện tích làm tên phòng */
export function partsFromText(text: string | null): Part[] {
  if (!text) return []
  const lines = text.split('\n').map(clean).filter(Boolean)
  const marks = lines.map((l, i) => (AREA.test(l) ? i : -1)).filter(i => i >= 0)
  if (marks.length < 2) return []
  const out: Part[] = []
  let prev = -1
  for (const m of marks) {
    const block = lines.slice(Math.max(prev + 1, m - 2), m).filter(l => l.length >= 3 && !AREA.test(l))
    prev = m
    if (!block.length) continue
    const vn = block.find(l => VN.test(l)) ?? '', en = block.find(l => !VN.test(l)) ?? ''
    out.push({ name_vn: vn ? sentence(vn) : title(en), name_en: en ? title(en) : title(vn) })
  }
  return out.length >= 2 ? out : []
}
/** Tên phòng dạng “A & B” / “A và B” / “A + B” → tách thành các tên */
export function partsFromName(room: Room): Part[] {
  const sp = (s: string | null) => (s ?? '').split(/\s+(?:&|\+|và|and|\/)\s+/i).map(clean).filter(x => x.length >= 3)
  const vn = sp(room.name_vn); if (vn.length < 2) return []
  const en = sp(room.name_en)
  return vn.map((v, i) => ({ name_vn: v, name_en: en.length === vn.length ? en[i] : '' }))
}
export function suggestParts(room: Room, pages: Page[]): Part[] {
  for (const p of pages.filter(x => x.room_id === room.id)) { const a = partsFromText(p.page_text); if (a.length >= 2) return a }
  return partsFromName(room)
}
export const suggestSplits = (rooms: Room[], pages: Page[]) => rooms.map(room => ({ room, parts: suggestParts(room, pages) })).filter(x => x.parts.length >= 2)

/** Ảnh phối cảnh (ô ảnh) của một trang: nếu slide có nhiều ô ảnh thì mỗi ô chọn phòng riêng */
export const pageRects = (p: Page) => ((p.views as PageViews | null)?.rects ?? []).slice()
const pad = (n: number) => String(n).padStart(2, '0')

/** choice[pageId][i] = chỉ số phòng (trong `parts`) của ô ảnh i (hoặc cả trang nếu không tách được ô ảnh). Giữ nguyên mọi vật liệu đã có, chỉ chia lại theo phòng. */
export async function splitRoom(d: ProjectData, room: Room, parts: Part[], choice: Record<string, number[]>) {
  const project = d.project!
  // 1) phòng đầu giữ mã cũ, các phòng sau tạo mới và xếp liền kề
  const ids: string[] = [room.id]
  await must(supabase.from('rooms').update({ name_vn: parts[0].name_vn, name_en: parts[0].name_en || null }).eq('id', room.id))
  let maxCode = d.rooms.reduce((m, r) => Math.max(m, parseInt(r.code.replace(/\D/g, ''), 10) || 0), 0)
  for (const pt of parts.slice(1)) {
    maxCode++
    const r = await must(supabase.from('rooms').insert({ project_id: project.id, code: `R${pad(maxCode)}`, name_vn: pt.name_vn, name_en: pt.name_en || null, room_type: room.room_type, concept_counts: [], sort: 9999 }).select().single()) as Room
    ids.push(r.id)
  }
  const ordered = [...d.rooms].sort((a, b) => a.sort - b.sort)
  const at = ordered.findIndex(r => r.id === room.id)
  const seq = [...ordered.slice(0, at + 1).map(r => r.id), ...ids.slice(1), ...ordered.slice(at + 1).map(r => r.id)]
  for (const [i, id] of seq.entries()) await supabase.from('rooms').update({ sort: i + 1 }).eq('id', id)

  // 2) trang: phòng chính của trang = phòng của ô ảnh đầu; camera ghép với ô ảnh nào thì đứng trong phòng đó
  const pages = d.pages.filter(p => p.room_id === room.id)
  const roomOfRect = new Map<string, (i: number) => string>()
  for (const p of pages) {
    const ch = choice[p.id] ?? [0], rid = (i: number) => ids[Math.min(ch[i] ?? ch[0] ?? 0, ids.length - 1)]
    roomOfRect.set(p.id, rid)
    const patch: Record<string, unknown> = { room_id: rid(0) }
    const v = p.views as PageViews | null
    if (v?.rects?.length && v.cams?.length) patch.views = { ...v, cams: v.cams.map((c, ci) => { const vi = v.pair.indexOf(ci); return vi >= 0 ? { ...c, room_id: rid(vi) } : c }) }
    await must(supabase.from('pages').update(patch).eq('id', p.id))
  }
  // 3) vật liệu đã nhận diện: chia theo ô ảnh chứa tâm khung; không thuộc trang nào thì ở lại phòng đầu
  const occ = d.occ.filter((o: Occurrence) => o.room_id === room.id && o.page_id && roomOfRect.has(o.page_id))
  let moved = 0
  for (const o of occ) {
    const p = pages.find(x => x.id === o.page_id)!, rects = pageRects(p), rid = roomOfRect.get(p.id)!
    let target = rid(0)
    if (rects.length && o.bbox) {
      const cx = o.bbox[0] + o.bbox[2] / 2, cy = o.bbox[1] + o.bbox[3] / 2
      const i = rects.findIndex(r => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h)
      if (i >= 0) target = rid(i)
    }
    if (target !== room.id) { await must(supabase.from('occurrences').update({ room_id: target }).eq('id', o.id)); moved++ }
  }
  return { rooms: ids.length, moved }
}
async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> { const { data, error } = await p; if (error) throw new Error(error.message ?? String(error)); return data }

// Quét chính tả + dấu câu toàn bộ nội dung dự án (hạng mục, tên phòng) – dùng cho thẻ "Chính tả" ở tab QC.
import { supabase } from './supabase'
import { saveEntry } from './entryLink'
import { addIgnore, addIgnores, isIgnored } from './qcIgnore'
import { bulletOf, fixText, type Fix, type Flag, type SpellLang } from './spell'
import type { ProjectData } from './useProject'

export type SpellItem = { key: string; kind: 'entry' | 'room'; id: string; label: string; field: string; fieldLabel: string; lang: SpellLang; cap: boolean; before: string; after: string; fixes: Fix[]; flags: Flag[] }
const ENTRY_FIELDS: [string, string, SpellLang, boolean][] = [
  ['name_vn', 'Tên hạng mục', 'vi', true], ['name_en', 'Item name', 'en', true], ['material_vn', 'Vật liệu', 'vi', true], ['material_en', 'Material', 'en', true],
  ['desc_vn', 'Thông số', 'vi', true], ['desc_en', 'Specification', 'en', true], ['part_vn', 'Bộ phận', 'vi', true], ['part_en', 'Part', 'en', true],
  ['note_vn', 'Ghi chú', 'vi', true], ['note_en', 'Remarks', 'en', true], ['perf_vn', 'Tính chất', 'vi', true], ['perf_en', 'Properties', 'en', true],
  ['brand', 'Thương hiệu', null, false], ['origin', 'Xuất xứ', null, false], ['product_name', 'Tên sản phẩm', null, false],
]
/** Xác nhận một mục KHÔNG phải lỗi: ẩn mục này và coi các từ bị nghi trong đó là đúng (toàn công ty) – từ nay dùng lại ở đâu cũng không báo */
export async function confirmNotError(it: SpellItem, projectId: string) {
  await addIgnore('spell', it.key, projectId)
  // cả từ bị phần mềm TỰ SỬA (vd Martindale → Martingale) mà người dùng xác nhận là đúng → coi là từ đúng, các mục khác cũng không bị tự sửa/báo nữa
  const ok = [...it.flags.map(f => f.word), ...it.fixes.filter(f => f.kind === 'spell').map(f => f.from)]
  await addIgnores('word', ok.filter(w => !w.startsWith('⚠') && w.length > 1 && !/\s/.test(w)).map(w => w.toLowerCase()), null)
}

const WORD_RE = /[\p{L}\p{M}]+(?:'[\p{L}]+)?/gu
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Các từ người dùng đã đổi: ghép từng từ trước/sau (cùng số từ), hoặc một từ thay một từ giữa hai đoạn giống nhau */
export function wordPairs(before: string, after: string): [string, string][] {
  const a = before.match(WORD_RE) ?? [], b = after.match(WORD_RE) ?? []
  const out: [string, string][] = []
  if (a.length === b.length) a.forEach((w, i) => { if (w !== b[i]) out.push([w, b[i]]) })
  else {
    let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++
    let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
    if (a.length - p - q === 1 && b.length - p - q === 1) out.push([a[p], b[p]])
  }
  return out.filter(([f]) => f.length > 1)
}
/** Người dùng đã sửa `src` thành `finalText` → mọi mục khác (cùng ngôn ngữ) chứa đúng từ sai đó, hoặc có nguyên văn giống hệt, được sửa y như vậy */
export function planPropagate(src: SpellItem, finalText: string, items: SpellItem[]): { item: SpellItem; text: string }[] {
  const pairs = wordPairs(src.before, finalText), out: { item: SpellItem; text: string }[] = []
  for (const it of items) {
    if (it.key === src.key || it.lang !== src.lang) continue
    let t = it.before
    if (it.before === src.before) t = finalText
    else for (const [f, to] of pairs) t = t.replace(new RegExp(`(?<![\\p{L}\\p{M}])${esc(f)}(?![\\p{L}\\p{M}])`, 'gu'), to)
    if (t !== it.before) out.push({ item: it, text: t })
  }
  return out
}

export function spellScan(d: ProjectData): SpellItem[] {
  const out: SpellItem[] = []
  const run = (kind: 'entry' | 'room', id: string, label: string, field: string, fieldLabel: string, lang: SpellLang, cap: boolean, v: unknown, like?: unknown) => {
    const before = String(v ?? ''); if (!before.trim()) return
    const key = `${id}:${field}:${before}`; if (isIgnored('spell', key)) return
    // ô tiếng Anh: trình bày theo ô tiếng Việt (giống hệt cách bản dịch được tạo ra) – không tự mâu thuẫn với bản dịch
    const r = fixText(before, lang, { cap, bullet: bulletOf(field), like: lang === 'en' && like ? String(like) : null })
    if (r.text !== before || r.flags.length) out.push({ key, kind, id, label, field, fieldLabel, lang, cap, before, after: r.text, fixes: r.fixes, flags: r.flags })
  }
  for (const e of d.entries) if (e.status !== 'rejected') for (const [f, fl, lang, cap] of ENTRY_FIELDS) run('entry', e.id, `${e.code} · ${e.name_vn}`, f, fl, lang, cap, (e as any)[f], f.endsWith('_en') ? (e as any)[f.replace(/_en$/, '_vn')] : null)
  for (const r of d.rooms) { run('room', r.id, `${r.code}`, 'name_vn', 'Tên phòng (VN)', 'vi', true, r.name_vn); run('room', r.id, `${r.code}`, 'name_en', 'Room name (EN)', 'en', true, r.name_en) }
  return out
}
export async function applySpell(d: ProjectData, it: SpellItem, text: string) {
  const val = text.trim() || null
  if (it.kind === 'room') { const { error } = await supabase.from('rooms').update({ [it.field]: it.field === 'name_vn' ? (val ?? '') : val }).eq('id', it.id); if (error) throw new Error(error.message); return }
  const e = d.entries.find(x => x.id === it.id)!
  const error = await saveEntry(e, { [it.field]: val }); if (error) throw new Error(error.message)
}

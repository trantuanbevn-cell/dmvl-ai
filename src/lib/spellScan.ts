// Quét chính tả + dấu câu toàn bộ nội dung dự án (hạng mục, tên phòng) – dùng cho thẻ "Chính tả" ở tab QC.
import { supabase } from './supabase'
import { saveEntry } from './entryLink'
import { addIgnore, addIgnores, isIgnored } from './qcIgnore'
import { fixText, type Fix, type Flag, type SpellLang } from './spell'
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
  await addIgnores('word', it.flags.map(f => f.word).filter(w => !w.startsWith('⚠') && w.length > 1).map(w => w.toLowerCase()), null)
}

export function spellScan(d: ProjectData): SpellItem[] {
  const out: SpellItem[] = []
  const run = (kind: 'entry' | 'room', id: string, label: string, field: string, fieldLabel: string, lang: SpellLang, cap: boolean, v: unknown) => {
    const before = String(v ?? ''); if (!before.trim()) return
    const key = `${id}:${field}:${before}`; if (isIgnored('spell', key)) return
    const r = fixText(before, lang, { cap })
    if (r.text !== before || r.flags.length) out.push({ key, kind, id, label, field, fieldLabel, lang, cap, before, after: r.text, fixes: r.fixes, flags: r.flags })
  }
  for (const e of d.entries) if (e.status !== 'rejected') for (const [f, fl, lang, cap] of ENTRY_FIELDS) run('entry', e.id, `${e.code} · ${e.name_vn}`, f, fl, lang, cap, (e as any)[f])
  for (const r of d.rooms) { run('room', r.id, `${r.code}`, 'name_vn', 'Tên phòng (VN)', 'vi', true, r.name_vn); run('room', r.id, `${r.code}`, 'name_en', 'Room name (EN)', 'en', true, r.name_en) }
  return out
}
export async function applySpell(d: ProjectData, it: SpellItem, text: string) {
  const val = text.trim() || null
  if (it.kind === 'room') { const { error } = await supabase.from('rooms').update({ [it.field]: it.field === 'name_vn' ? (val ?? '') : val }).eq('id', it.id); if (error) throw new Error(error.message); return }
  const e = d.entries.find(x => x.id === it.id)!
  const error = await saveEntry(e, { [it.field]: val }); if (error) throw new Error(error.message)
}

// Rà soát toàn bộ danh mục (không AI): thông tin thiếu, sai/lệch, chưa gán phòng/ảnh… dùng cho tab Kiểm tra.
import type { Entry } from './types'
import type { Lang } from './sections'
import type { ProjectData } from './useProject'
import { missingOf, missText } from './missing'
import { CATEGORY_GROUPS } from './codes'
import { supabase } from './supabase'
import { SYNC_KEYS, SYNC_LABEL } from './entryLink'
import { internalSet, realCodes, numbersOf } from './qc'

/** keys = ô cần tô đỏ trong khung sửa: tên cột của mã (name_vn, product_code…) hoặc 'loc' | 'shot' | 'group' | 'category' | 'link' | 'qty' */
export type Issue = { kind: 'err' | 'miss' | 'info'; text: string; keys: string[]; fix?: 'category' }
export type EntryIssues = { e: Entry; issues: Issue[] }
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** Loại “Bề mặt / mục” đúng với nhóm mã (vd nhóm FF – Đồ rời ⇒ “Đồ rời”); undefined nếu nhóm không gắn với loại nào (đá, kim loại, ốp tường… dùng được ở nhiều loại) */
export const categoryForGroup = (g: string) => Object.entries(CATEGORY_GROUPS).find(([, gs]) => gs.includes(g))?.[0]
/** Đồng bộ ô “Bề mặt / mục” theo nhóm mã (cả ở các vị trí phòng của mã) */
export async function fixCategory(e: Entry) {
  const c = categoryForGroup(e.group_code); if (!c) return
  await supabase.from('entries').update({ category: c }).eq('id', e.id)
  await supabase.from('occurrences').update({ category: c }).eq('entry_id', e.id)
}

export function checkEntries(d: ProjectData, lang: Lang): EntryIssues[] {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const sets = internalSet(d.entries)
  // Chỉ so mã sản phẩm THẬT (bỏ mã vật liệu nội bộ như EWD-06, MTL-07 mà đồ rời dùng để chỉ thành phần)
  const byCode = new Map<string, Entry[]>()
  for (const e of live) for (const c of realCodes(e, sets)) { const k = norm(c); if (k) byCode.set(k, [...(byCode.get(k) ?? []), e]) }
  const out: EntryIssues[] = []
  for (const e of live) {
    const issues: Issue[] = []
    const m = missingOf(e, lang)
    if (m.length) issues.push({ kind: 'miss', text: 'Thiếu: ' + missText(m), keys: m.map(x => String(x.key)) })
    const occ = d.occ.filter(o => o.entry_id === e.id)
    if (!occ.some(o => o.room_id)) issues.push({ kind: 'err', text: 'Chưa gán vào phòng nào – thêm phòng ở ô “Vị trí”', keys: ['loc'] })
    // Mã gốc phải khớp nhóm (ký hiệu hiển thị trên bản vẽ có thể khác mã gốc – không so ký hiệu)
    if (e.code.split('-')[0] !== e.group_code) issues.push({ kind: 'err', text: `Mã ${e.code} không khớp ô “Nhóm” (${e.group_code}) – sửa lại mã hoặc nhóm`, keys: ['group', 'code'] })
    // Việt ↔ Anh: số liệu (kích thước, độ dày…) phải giống nhau
    for (const [vk, ek, lb] of [['desc_vn', 'desc_en', 'Thông số'], ['material_vn', 'material_en', 'Vật liệu']] as const) {
      const v = e[vk], en = e[ek]
      if (!v || !en || v.length < 12 || en.length < 12) continue
      const nv = [...new Set(numbersOf(v))], ne = [...new Set(numbersOf(en))]
      const onlyV = nv.filter(x => !ne.includes(x)), onlyE = ne.filter(x => !nv.includes(x))
      if (onlyV.length || onlyE.length) issues.push({ kind: 'err', text: `${lb}: số liệu tiếng Việt và tiếng Anh khác nhau (${[...onlyV.map(x => 'VN ' + x), ...onlyE.map(x => 'EN ' + x)].slice(0, 4).join(', ')})`, keys: [vk, ek] })
    }
    const mine = realCodes(e, sets)
    const same = [...new Set(mine.flatMap(c => byCode.get(norm(c)) ?? []))].filter(x => x.id !== e.id)
    const diff = same.filter(x => norm(x.brand) && norm(e.brand) && norm(x.brand) !== norm(e.brand) && !norm(x.brand).includes(norm(e.brand)) && !norm(e.brand).includes(norm(x.brand)))
    if (diff.length) issues.push({ kind: 'err', text: `Cùng mã SP ${mine.join(', ')} nhưng hãng khác nhau (${e.brand} ≠ ${diff.map(x => x.brand).join(', ')} ở ${diff.map(x => x.code).join(', ')})`, keys: ['brand', 'product_code'] })
    if (e.link_id) {
      const grp = live.filter(x => x.link_id === e.link_id && x.id !== e.id)
      const bad = SYNC_KEYS.filter(k => grp.some(x => norm(x[k]) !== norm(e[k])))
      if (bad.length) issues.push({ kind: 'err', text: `Lệch với mã liên kết (${bad.map(k => SYNC_LABEL[k].toLowerCase()).join(', ')}) – sửa cho giống nhau`, keys: ['link', ...bad] })
    }
    if (issues.length) out.push({ e, issues })
  }
  const w = (r: EntryIssues) => (r.issues.some(i => i.kind === 'err') ? 0 : 1)
  return out.sort((a, b) => w(a) - w(b) || a.e.code.localeCompare(b.e.code, undefined, { numeric: true }))
}

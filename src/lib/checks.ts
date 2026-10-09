// Rà soát toàn bộ danh mục (không AI): thông tin thiếu, sai/lệch, chưa gán phòng/ảnh… dùng cho tab Kiểm tra.
import type { Entry } from './types'
import type { Lang } from './sections'
import type { ProjectData } from './useProject'
import { missingOf, missText } from './missing'
import { CATEGORY_GROUPS, catLabel, groupOf } from './codes'
import { supabase } from './supabase'
import { SYNC_KEYS, SYNC_LABEL } from './entryLink'

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
  const byCode = new Map<string, Entry[]>()
  for (const e of live) { const k = norm(e.product_code); if (k) byCode.set(k, [...(byCode.get(k) ?? []), e]) }
  const out: EntryIssues[] = []
  for (const e of live) {
    const issues: Issue[] = []
    const m = missingOf(e, lang)
    if (m.length) issues.push({ kind: 'miss', text: 'Thiếu: ' + missText(m), keys: m.map(x => String(x.key)) })
    const occ = d.occ.filter(o => o.entry_id === e.id)
    if (!occ.some(o => o.room_id)) issues.push({ kind: 'err', text: 'Chưa gán vào phòng nào – thêm phòng ở ô “Vị trí”', keys: ['loc'] })
    else if (e.source !== 'inferred' && !occ.some(o => o.bbox && (o.page_id || o.view?.img))) issues.push({ kind: 'miss', text: 'Chưa có hình phối cảnh – khoanh ảnh ở phần hình bên dưới', keys: ['shot'] })
    if (e.code.split('-')[0] !== e.group_code) issues.push({ kind: 'err', text: `Ký hiệu ${e.code} không khớp ô “Nhóm” (${e.group_code}) – sửa lại ký hiệu hoặc nhóm`, keys: ['group', 'code'] })
    // Hai ô “Nhóm” và “Bề mặt / mục” chọn lệch nhau (vd Nhóm = FF Đồ rời nhưng Bề mặt = Đồ liền tường). Chỉ báo khi nhóm có loại tương ứng rõ ràng để tự sửa.
    const cat = occ.find(o => o.category)?.category ?? e.category
    const want = categoryForGroup(e.group_code)
    if (cat && want && cat !== want && CATEGORY_GROUPS[cat]) issues.push({ kind: 'err', text: `Chọn lệch: “Bề mặt / mục” đang là “${catLabel(cat)}” nhưng “Nhóm” là ${e.group_code} – ${groupOf(e.group_code)?.vn ?? ''} (đúng phải là “${catLabel(want)}”)`, keys: ['category', 'group'], fix: 'category' })
    const same = e.product_code ? (byCode.get(norm(e.product_code)) ?? []).filter(x => x.id !== e.id) : []
    for (const k of ['brand'] as const) {
      const diff = same.filter(x => norm(x[k]) && norm(e[k]) && norm(x[k]) !== norm(e[k]))
      if (diff.length) issues.push({ kind: 'err', text: `Cùng mã SP ${e.product_code} nhưng ${SYNC_LABEL[k].toLowerCase()} khác ${diff.map(x => x.code).join(', ')}`, keys: [k, 'product_code'] })
    }
    if (e.link_id) {
      const grp = live.filter(x => x.link_id === e.link_id && x.id !== e.id)
      const bad = SYNC_KEYS.filter(k => grp.some(x => norm(x[k]) !== norm(e[k])))
      if (bad.length) issues.push({ kind: 'err', text: `Lệch với mã liên kết (${bad.map(k => SYNC_LABEL[k].toLowerCase()).join(', ')}) – sửa cho giống nhau`, keys: ['link', ...bad] })
    }
    if (e.qty_flag === 'warn' && e.source === 'image' && e.qty == null) issues.push({ kind: 'info', text: 'Chưa có số lượng – nhập ở phần “Số lượng”', keys: ['qty'] })
    if (issues.length) out.push({ e, issues })
  }
  const w = (r: EntryIssues) => (r.issues.some(i => i.kind === 'err') ? 0 : r.issues.some(i => i.kind === 'miss') ? 1 : 2)
  return out.sort((a, b) => w(a) - w(b) || a.e.code.localeCompare(b.e.code, undefined, { numeric: true }))
}

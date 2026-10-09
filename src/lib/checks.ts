// Rà soát toàn bộ danh mục (không AI): thông tin thiếu, sai/lệch, chưa gán phòng/ảnh… dùng cho tab Kiểm tra.
import type { Entry } from './types'
import type { Lang } from './sections'
import type { ProjectData } from './useProject'
import { missingOf, missText } from './missing'
import { CATEGORY_GROUPS } from './codes'
import { SYNC_KEYS, SYNC_LABEL } from './entryLink'

export type Issue = { kind: 'err' | 'miss' | 'info'; text: string }
export type EntryIssues = { e: Entry; issues: Issue[] }
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

export function checkEntries(d: ProjectData, lang: Lang): EntryIssues[] {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const byCode = new Map<string, Entry[]>()
  for (const e of live) { const k = norm(e.product_code); if (k) byCode.set(k, [...(byCode.get(k) ?? []), e]) }
  const out: EntryIssues[] = []
  for (const e of live) {
    const issues: Issue[] = []
    const m = missingOf(e, lang)
    if (m.length) issues.push({ kind: 'miss', text: 'Thiếu: ' + missText(m) })
    const occ = d.occ.filter(o => o.entry_id === e.id)
    if (!occ.some(o => o.room_id)) issues.push({ kind: 'err', text: 'Chưa gán vào phòng nào' })
    else if (e.source !== 'inferred' && !occ.some(o => o.bbox && (o.page_id || o.view?.img))) issues.push({ kind: 'miss', text: 'Chưa có hình phối cảnh' })
    if (e.code.split('-')[0] !== e.group_code) issues.push({ kind: 'err', text: `Mã ${e.code} không khớp nhóm ${e.group_code}` })
    const cat = occ.find(o => o.category)?.category ?? e.category
    const ok = cat ? CATEGORY_GROUPS[cat] : undefined
    if (ok && !ok.includes(e.group_code)) issues.push({ kind: 'err', text: `Hạng mục “${cat}” không khớp nhóm ${e.group_code}` })
    const same = e.product_code ? (byCode.get(norm(e.product_code)) ?? []).filter(x => x.id !== e.id) : []
    for (const k of ['brand'] as const) {
      const diff = same.filter(x => norm(x[k]) && norm(e[k]) && norm(x[k]) !== norm(e[k]))
      if (diff.length) issues.push({ kind: 'err', text: `Cùng mã SP ${e.product_code} nhưng ${SYNC_LABEL[k].toLowerCase()} khác ${diff.map(x => x.code).join(', ')}` })
    }
    if (e.link_id) {
      const grp = live.filter(x => x.link_id === e.link_id && x.id !== e.id)
      const bad = SYNC_KEYS.filter(k => grp.some(x => norm(x[k]) !== norm(e[k])))
      if (bad.length) issues.push({ kind: 'err', text: `Lệch với mã liên kết (${bad.map(k => SYNC_LABEL[k].toLowerCase()).join(', ')})` })
    }
    if (e.qty_flag === 'warn' && e.source === 'image' && e.qty == null) issues.push({ kind: 'info', text: 'Chưa có số lượng' })
    if (issues.length) out.push({ e, issues })
  }
  const w = (r: EntryIssues) => (r.issues.some(i => i.kind === 'err') ? 0 : r.issues.some(i => i.kind === 'miss') ? 1 : 2)
  return out.sort((a, b) => w(a) - w(b) || a.e.code.localeCompare(b.e.code, undefined, { numeric: true }))
}

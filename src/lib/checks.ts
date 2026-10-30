// Rà soát toàn bộ danh mục (không AI): thông tin thiếu, sai/lệch, chưa gán phòng/ảnh… dùng cho tab Kiểm tra.
import type { Entry } from './types'
import type { Lang } from './sections'
import type { ProjectData } from './useProject'
import { missingOf, missText } from './missing'
import { CATEGORY_GROUPS } from './codes'
import { supabase } from './supabase'
import { SYNC_KEYS, SYNC_LABEL } from './entryLink'
import { internalSet, realCodes } from './qc'
import { finishCtx, finishIssues, type FinishFix } from './finishCheck'
import { symbolMap } from './sections'

/** keys = ô cần tô đỏ trong khung sửa: tên cột của mã (name_vn, product_code…) hoặc 'loc' | 'shot' | 'group' | 'category' | 'link' | 'qty' */
export type Issue = { kind: 'err' | 'miss' | 'info'; text: string; keys: string[]; fix?: 'category'; /** ô tiếng Anh còn nội dung trong khi ô tiếng Việt tương ứng trống */ orphanEn?: string[]; finishFix?: FinishFix; finishKey?: string }
export type EntryIssues = { e: Entry; issues: Issue[] }
const ORPH_LABEL: Record<string, string> = { name_en: 'tên', part_en: 'bộ phận', material_en: 'vật liệu', desc_en: 'thông số', perf_en: 'tính chất', note_en: 'ghi chú', loc_note_en: 'ghi chú vị trí' }
const blankV = (v: unknown) => v == null || String(v).trim() === ''
/** Các ô EN còn chữ trong khi ô VN cùng loại trống */
export const orphanEnFields = (e: Entry): string[] => Object.keys(ORPH_LABEL).filter(ef => blankV((e as any)[ef.replace(/_en$/, '_vn')]) && !blankV((e as any)[ef]))
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
  const smap = symbolMap(d.entries), fctx = finishCtx(d, x => smap.get(x.id) ?? x.code)
  for (const e of live) {
    const issues: Issue[] = []
    const m = missingOf(e, lang)
    if (m.length) issues.push({ kind: 'miss', text: 'Thiếu: ' + missText(m), keys: m.map(x => String(x.key)) })
    // Ô tiếng Anh “mồ côi”: tiếng Việt (bản gốc) trống nhưng tiếng Anh vẫn còn – thường do đã xoá / chuyển nội dung tiếng Việt sang ô khác mà bản dịch cũ còn sót → hiện 2 bản tiếng Anh trùng ý
    const orph = orphanEnFields(e)
    if (orph.length) issues.push({ kind: 'err', text: `Ô tiếng Anh không có tiếng Việt tương ứng (${orph.map(f => ORPH_LABEL[f] ?? f).join(', ')}) – tiếng Việt đã bị xoá/chuyển sang ô khác nhưng bản dịch cũ còn sót`, keys: orph, orphanEn: orph })
    const occ = d.occ.filter(o => o.entry_id === e.id)
    if (!occ.some(o => o.room_id)) issues.push({ kind: 'err', text: 'Chưa gán vào phòng nào – thêm phòng ở ô “Vị trí”', keys: ['loc'] })
    const mine = realCodes(e, sets)
    const same = [...new Set(mine.flatMap(c => byCode.get(norm(c)) ?? []))].filter(x => x.id !== e.id)
    const diff = same.filter(x => norm(x.brand) && norm(e.brand) && norm(x.brand) !== norm(e.brand) && !norm(x.brand).includes(norm(e.brand)) && !norm(e.brand).includes(norm(x.brand)))
    if (diff.length) issues.push({ kind: 'err', text: `Cùng mã SP ${mine.join(', ')} nhưng hãng khác nhau (${e.brand} ≠ ${diff.map(x => x.brand).join(', ')} ở ${diff.map(x => x.code).join(', ')})`, keys: ['brand', 'product_code'] })
    if (e.link_id) {
      const grp = live.filter(x => x.link_id === e.link_id && x.id !== e.id)
      const bad = SYNC_KEYS.filter(k => grp.some(x => norm(x[k]) !== norm(e[k])))
      if (bad.length) issues.push({ kind: 'err', text: `Lệch với mã liên kết (${bad.map(k => SYNC_LABEL[k].toLowerCase()).join(', ')}) – sửa cho giống nhau`, keys: ['link', ...bad] })
    }
    // Hạng mục (cột ma trận) phải khớp "Bộ phận áp dụng": đồ rời / đồ liền tường / cửa / trần không được nằm ở Tường – Tường nhấn
    if (e.category === 'wall' || e.category === 'feature_wall') {
      const raw = norm(e.part_vn), p = raw.replace(/đồ liền tường/g, 'ĐLT')
      if (raw && !/tường/.test(p)) {
        const to = /đồ rời/.test(p) ? 'Đồ rời' : /ĐLT/.test(p) ? 'Đồ liền tường' : /cửa/.test(p) ? 'Cửa & phụ kiện' : /trần/.test(p) ? 'Trần' : ''
        if (to) issues.push({ kind: 'err', text: `Bộ phận áp dụng là “${e.part_vn}” nhưng hạng mục đang là “${e.category === 'wall' ? 'Tường' : 'Tường nhấn'}” – nên là “${to}” (đổi ô “Bề mặt / mục”)`, keys: ['category', 'part_vn'] })
      }
    }
    for (const f of finishIssues(e, fctx)) issues.push({ kind: f.kind === 'err' ? 'err' : 'miss', text: '🎨 ' + f.text, keys: ['finish', 'desc_vn'], finishFix: f.fix, finishKey: f.key })
    if (issues.length) out.push({ e, issues })
  }
  const w = (r: EntryIssues) => (r.issues.some(i => i.kind === 'err') ? 0 : 1)
  return out.sort((a, b) => w(a) - w(b) || a.e.code.localeCompare(b.e.code, undefined, { numeric: true }))
}

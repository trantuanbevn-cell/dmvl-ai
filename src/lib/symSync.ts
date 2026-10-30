// ĐỒNG BỘ KÝ HIỆU VẬT LIỆU TRONG NỘI DUNG CHỮ
// Ký hiệu bản vẽ (EWD-03, MTL-05…) được đánh số liên tục, tự nhảy khi thêm / xoá / đổi nhóm vật liệu.
// Các ô chữ (vật liệu, thông số, mã VL…) hay NHẮC tới ký hiệu của vật liệu khác (“mặt bàn mã EWD-02”) – trước đây chỉ là chữ
// nên số không nhảy theo → nhắc sai vật liệu. Nay lưu bảng ký hiệu lần trước (projects.sym_map); khi số đổi, mọi chỗ nhắc
// ký hiệu cũ được đổi sang ký hiệu mới của ĐÚNG vật liệu đó (đổi đồng thời, không bị nhảy dây chuyền).
import { supabase } from './supabase'
import { symbolMap } from './sections'
import type { Entry, Project } from './types'

export const SYM_FIELDS = ['name_vn', 'name_en', 'material_vn', 'material_en', 'desc_vn', 'desc_en', 'part_vn', 'part_en', 'perf_vn', 'perf_en', 'note_vn', 'note_en', 'product_code'] as const
const sigOf = (m: Record<string, string>) => { const s = Object.keys(m).sort().map(k => k + '=' + m[k]).join(';'); let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return s.length + ':' + (h >>> 0).toString(36) }

/** Đổi đồng thời các ký hiệu cũ → mới trong một đoạn chữ (chỉ khớp nguyên mã, vd EWD-03 không khớp EWD-031 hay XEWD-03) */
export function remapCodes(text: string, map: Map<string, string>): string {
  if (!map.size) return text
  const re = new RegExp(`(?<![A-Za-z0-9-])(${[...map.keys()].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`, 'g')
  return text.replace(re, m => map.get(m) ?? m)
}
/** Kế hoạch: từ bảng ký hiệu cũ + danh sách hiện tại → cặp đổi mã và các ô cần sửa */
export function planSymSync(entries: Entry[], old: Record<string, string>) {
  const cur = symbolMap(entries), live = entries.filter(e => e.status !== 'rejected')
  const map = new Map<string, string>()
  for (const e of live) { const o = old[e.id], n = cur.get(e.id); if (o && n && o !== n) map.set(o, n) }
  // ký hiệu cũ của vật liệu đã xoá/bỏ mà nay trùng với ký hiệu của vật liệu khác: không đổi (không biết chắc đang nhắc vật liệu nào)
  const edits: { e: Entry; field: string; from: string; to: string }[] = []
  if (map.size) for (const e of live) for (const f of SYM_FIELDS) {
    const v = (e as any)[f]; if (!v) continue
    const t = remapCodes(String(v), map); if (t !== v) edits.push({ e, field: f, from: String(v), to: t })
  }
  const next: Record<string, string> = {}; for (const e of live) { const n = cur.get(e.id); if (n) next[e.id] = n }
  return { map, edits, next }
}

let busy = false
/** Chạy sau mỗi lần tải dự án (người có quyền sửa). Chỉ MỘT máy được nhận việc (khoá lạc quan bằng sym_sig) để không đổi mã hai lần. */
export async function syncSymbols(project: Project | null, entries: Entry[]): Promise<number> {
  if (!project || busy || !entries.length) return 0
  busy = true
  try {
    const old = project.sym_map ?? null
    const { edits, next } = planSymSync(entries, old ?? {})
    const sig = sigOf(next)
    if (old && project.sym_sig === sig) return 0
    // nhận việc: chỉ thành công nếu chưa ai đồng bộ kể từ lúc tải
    let q = supabase.from('projects').update({ sym_map: next, sym_sig: sig }).eq('id', project.id)
    q = project.sym_sig ? q.eq('sym_sig', project.sym_sig) : q.is('sym_sig', null)
    const { data, error } = await q.select('id')
    if (error || !data?.length) return 0
    if (!old) return 0   // lần đầu: chỉ ghi mốc
    let n = 0
    for (const x of edits) {   // chỉ ghi khi ô vẫn đúng như lúc tính (không đè lên chỗ người khác vừa sửa)
      const { data: ok } = await supabase.from('entries').update({ [x.field]: x.to }).eq('id', x.e.id).eq(x.field, x.from).select('id')
      if (ok?.length) n++
    }
    return n
  } finally { busy = false }
}

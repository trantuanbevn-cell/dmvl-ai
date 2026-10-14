// Hoàn tác / làm lại: đọc lịch sử thay đổi (bảng undo_log do DB tự ghi) và gọi hàm undo_revert để quay lại từng bước.
import { supabase } from './supabase'

export type UndoRow = { id: number; at: string; user_id: string; user_name: string | null; project_id: string; tbl: string; row_id: string; code: string | null; op: 'INSERT' | 'UPDATE' | 'DELETE'; old_vals: Record<string, unknown> | null; new_vals: Record<string, unknown> | null; via_undo: boolean; reverted: boolean }
export type Batch = { ids: number[]; minId: number; maxId: number; user_id: string; user_name: string | null; at: string; via: boolean; reverted: boolean; label: string; n: number }

const TBL: Record<string, string> = { entries: 'mã vật liệu', rooms: 'phòng', occurrences: 'vị trí / hình khoanh', project_rules: 'quy định' }
const ACT: Record<string, string> = { INSERT: 'Thêm', UPDATE: 'Sửa', DELETE: 'Xoá' }
const FLD: Record<string, string> = { name_vn: 'Tên', name_en: 'Tên EN', part_vn: 'Bộ phận', material_vn: 'Vật liệu', desc_vn: 'Mô tả', desc_en: 'Mô tả EN', composition: 'Cấu tạo', brand: 'Hãng', product_code: 'Mã SP', origin: 'Xuất xứ', note_vn: 'Ghi chú', note_en: 'Ghi chú EN', status: 'Trạng thái', category: 'Hạng mục', group_code: 'Nhóm', code: 'Mã', finish_refs: 'Lớp hoàn thiện', finish_ok: 'Cảnh báo bỏ qua', bbox: 'Vị trí khoanh', room_id: 'Phòng', qty: 'Số lượng', section_key: 'Nhóm hiển thị', color_hex: 'Màu', product_url: 'Link', mat_view: 'Ảnh vật liệu' }

export async function loadUndo(projectId: string): Promise<UndoRow[]> {
  const { data } = await supabase.from('undo_log').select('*').eq('project_id', projectId).order('id', { ascending: false }).limit(800)
  return (data ?? []) as UndoRow[]
}

function labelOf(rows: UndoRow[]): string {
  const g = new Map<string, UndoRow[]>()
  for (const r of rows) g.set(r.op + '|' + r.tbl, [...(g.get(r.op + '|' + r.tbl) ?? []), r])
  return [...g.entries()].map(([k, rs]) => {
    const [op, tbl] = k.split('|'), codes = [...new Set(rs.map(r => r.code).filter(Boolean) as string[])]
    const flds = op === 'UPDATE' && rs.length <= 3 ? [...new Set(rs.flatMap(r => Object.keys(r.old_vals ?? {})))].map(f => FLD[f] ?? f).slice(0, 3) : []
    return `${ACT[op]} ${rs.length > 1 ? rs.length + ' ' : ''}${TBL[tbl] ?? tbl}${codes.length ? ' ' + codes.slice(0, 3).join(', ') + (codes.length > 3 ? '…' : '') : ''}${flds.length ? ' (' + flds.join(', ') + ')' : ''}`
  }).join(' · ')
}

/** Gộp các dòng liên tiếp (cùng người, cách nhau ≤ 4 giây) thành một “bước” */
export function toBatches(rows: UndoRow[]): Batch[] {
  const out: { rows: UndoRow[] }[] = []
  for (const r of rows) {   // rows: mới → cũ
    const cur = out[out.length - 1], last = cur?.rows[cur.rows.length - 1]
    if (cur && last && last.user_id === r.user_id && last.via_undo === r.via_undo && last.reverted === r.reverted && Math.abs(new Date(last.at).getTime() - new Date(r.at).getTime()) <= 4000) cur.rows.push(r)
    else out.push({ rows: [r] })
  }
  return out.map(({ rows: rs }) => ({ ids: rs.map(r => r.id), minId: Math.min(...rs.map(r => r.id)), maxId: Math.max(...rs.map(r => r.id)), user_id: rs[0].user_id, user_name: rs[0].user_name, at: rs[0].at, via: rs[0].via_undo, reverted: rs[0].reverted, label: labelOf(rs), n: rs.length }))
}

export type RevertResult = { done: number; skipped: number; failed: number }
export async function revert(ids: number[], redo = false): Promise<RevertResult> {
  const { data, error } = await supabase.rpc('undo_revert', { p_ids: ids, p_redo: redo })
  if (error) throw new Error(error.message)
  return data as RevertResult
}

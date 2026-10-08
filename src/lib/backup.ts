// Sao lưu / khôi phục dữ liệu dự án (lưu ngay trong Supabase qua các hàm create_backup / restore_backup).
import { supabase } from './supabase'
import type { Project } from './types'

export type BackupRow = { id: string; created_at: string; kind: 'manual' | 'auto'; label: string | null; counts: { rooms: number; pages: number; entries: number; occurrences: number } | null }

export async function makeBackup(projectId: string, label: string, kind: 'manual' | 'auto' = 'manual'): Promise<string> {
  const { data, error } = await supabase.rpc('create_backup', { p_project: projectId, p_label: label, p_kind: kind })
  if (error) throw new Error(error.message)
  return data as string
}
/** Sao lưu tự động trước thao tác có thể ghi đè dữ liệu. Nếu không sao lưu được thì DỪNG thao tác (an toàn hơn là mất dữ liệu). */
export async function autoBackup(project: Pick<Project, 'id'>, label: string) {
  const { count } = await supabase.from('entries').select('id', { count: 'exact', head: true }).eq('project_id', project.id)
  if (!count) return null    // dự án chưa có dữ liệu → không cần
  try { return await makeBackup(project.id, label, 'auto') } catch (e) { throw new Error('Không sao lưu được nên đã dừng để bảo vệ dữ liệu: ' + String((e as Error).message ?? e)) }
}
export async function listBackups(projectId: string): Promise<BackupRow[]> {
  const { data, error } = await supabase.from('backups').select('id,created_at,kind,label,counts').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as BackupRow[]
}
export async function downloadBackup(id: string, name: string) {
  const { data, error } = await supabase.from('backups').select('data,created_at').eq('id', id).single()
  if (error) throw new Error(error.message)
  const blob = new Blob([JSON.stringify(data.data)], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}-${String(data.created_at).slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
export async function restoreBackup(id: string) {
  const { error } = await supabase.rpc('restore_backup', { p_backup: id })
  if (error) throw new Error(/function .*restore_backup/i.test(error.message) ? 'Chưa cài hàm khôi phục trong Supabase (chạy file 0007_restore_backup.sql)' : error.message)
}
export async function deleteBackup(id: string) {
  const { error } = await supabase.rpc('delete_backup', { p_backup: id })
  if (error) throw new Error(/function .*delete_backup/i.test(error.message) ? 'Chưa cài hàm xoá sao lưu (chạy file 0007_restore_backup.sql)' : error.message)
}

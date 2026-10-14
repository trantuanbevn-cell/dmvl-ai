// Những điểm QC đã xác nhận "không phải lỗi": lưu CHUNG trong DB (qc_ignores) để mọi người, mọi máy đều không bị báo lại.
// Có bản nhớ trong máy (localStorage) làm dự phòng khi mất mạng; dữ liệu cũ trong máy được đẩy lên DB một lần.
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

const ZERO = '00000000-0000-0000-0000-000000000000'   // “toàn công ty” (từ điển)
export type IgnoreKind = 'word' | 'spell' | 'dup' | 'link'
const mem: Record<IgnoreKind, Set<string>> = { word: new Set(), spell: new Set(), dup: new Set(), link: new Set() }
const LS: Record<IgnoreKind, string> = { word: 'dmvl-dict', spell: 'dmvl-spell-skip', dup: 'dmvl-dup-skip', link: 'dmvl-link-skip' }
let version = 0
const subs = new Set<() => void>()
const bump = () => { version++; subs.forEach(f => f()) }
export const useIgnoreVersion = () => useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb) } }, () => version)

const lsRead = (k: IgnoreKind): string[] => { try { return JSON.parse(localStorage.getItem(LS[k]) ?? '[]') } catch { return [] } }
const lsWrite = (k: IgnoreKind) => { try { localStorage.setItem(LS[k], JSON.stringify([...mem[k]])) } catch { /* */ } }
for (const k of Object.keys(mem) as IgnoreKind[]) for (const x of lsRead(k)) mem[k].add(x)

/** Khoá cặp mã không phụ thuộc thứ tự */
export const pairKey = (a: string, b: string) => [a, b].sort().join('|')
export const isIgnored = (kind: IgnoreKind, key: string) => mem[kind].has(key)

export async function addIgnore(kind: IgnoreKind, key: string, projectId: string | null) {
  if (mem[kind].has(key)) return
  mem[kind].add(key); lsWrite(kind); bump()
  await supabase.from('qc_ignores').upsert({ project_id: kind === 'word' ? ZERO : projectId, kind, key }, { onConflict: 'project_id,kind,key', ignoreDuplicates: true })
}
export async function addIgnores(kind: IgnoreKind, keys: string[], projectId: string | null) {
  const fresh = [...new Set(keys)].filter(k => !mem[kind].has(k)); if (!fresh.length) return
  for (const k of fresh) mem[kind].add(k)
  lsWrite(kind); bump()
  await supabase.from('qc_ignores').upsert(fresh.map(key => ({ project_id: kind === 'word' ? ZERO : projectId, kind, key })), { onConflict: 'project_id,kind,key', ignoreDuplicates: true })
}

/** Tải các điểm đã xác nhận của dự án (và từ đúng của cả công ty); đẩy dữ liệu còn trong máy lên DB một lần */
export async function loadIgnores(projectId: string) {
  const { data } = await supabase.from('qc_ignores').select('kind,key').in('project_id', [ZERO, projectId]).limit(20000)
  const have = new Set((data ?? []).map(r => r.kind + '\u0001' + r.key))
  for (const r of data ?? []) if (r.kind in mem) mem[r.kind as IgnoreKind].add(r.key)
  // dữ liệu cũ chỉ có trong máy này → đẩy lên để máy khác/đồng nghiệp cũng được áp dụng
  const up: { project_id: string; kind: IgnoreKind; key: string }[] = []
  for (const k of Object.keys(mem) as IgnoreKind[]) for (const x of lsRead(k)) if (!have.has(k + '\u0001' + x)) up.push({ project_id: k === 'word' ? ZERO : projectId, kind: k, key: x })
  if (up.length) for (let i = 0; i < up.length; i += 500) await supabase.from('qc_ignores').upsert(up.slice(i, i + 500), { onConflict: 'project_id,kind,key', ignoreDuplicates: true })
  bump()
}

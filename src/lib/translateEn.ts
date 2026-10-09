// Tự điền các ô tiếng Anh còn TRỐNG từ tiếng Việt. Không bao giờ ghi đè ô tiếng Anh đã có.
//  1) Từ điển chuyên ngành (viEn.ts) – chạy trong trình duyệt, không AI, dùng cho cụm ngắn đơn giản.
//  2) Phần còn lại (cụm dài/phức tạp/từ lạ): AI dịch (chỉ quản trị viên) kèm bản nháp của từ điển, rồi qua bộ sửa chính tả tiếng Anh.
import { supabase, FUNCTIONS_URL } from './supabase'
import { autoBackup } from './backup'
import { fixText, loadEnglish } from './spell'
import { translateViText } from './viEn'
import type { ProjectData } from './useProject'

export type TrItem = { key: string; kind: 'entry' | 'room'; id: string; field: string; vi: string; draft: string; ok: boolean; label: string }
const EF: [string, string, string][] = [['name_vn', 'name_en', 'tên'], ['part_vn', 'part_en', 'bộ phận'], ['material_vn', 'material_en', 'vật liệu'], ['desc_vn', 'desc_en', 'thông số'], ['perf_vn', 'perf_en', 'tính chất'], ['note_vn', 'note_en', 'ghi chú']]
const blank = (v: unknown) => v == null || String(v).trim() === ''

/** Các ô tiếng Anh còn trống mà ô tiếng Việt đã có nội dung, kèm bản dịch từ điển */
export function planFill(d: ProjectData): TrItem[] {
  const out: TrItem[] = []
  const add = (kind: 'entry' | 'room', id: string, label: string, vf: string, ef: string, vi: unknown) => {
    const s = String(vi ?? '').trim(); if (!s) return
    const r = translateViText(s)
    out.push({ key: `${id}:${ef}`, kind, id, field: ef, vi: s, draft: r.en, ok: r.ok && !!r.en, label })
  }
  for (const e of d.entries) if (e.status !== 'rejected') for (const [vf, ef] of EF) if (!blank((e as any)[vf]) && blank((e as any)[ef])) add('entry', e.id, `${e.code} · ${e.name_vn}`, vf, ef, (e as any)[vf])
  for (const r of d.rooms) if (blank(r.name_en) && !blank(r.name_vn)) add('room', r.id, r.code, 'name_vn', 'name_en', r.name_vn)
  return out
}

/** Ghi bản dịch vào ô EN – chỉ khi ô đó vẫn đang trống trong cơ sở dữ liệu */
async function put(it: TrItem, en: string) {
  const table = it.kind === 'room' ? 'rooms' : 'entries'
  const { error } = await supabase.from(table).update({ [it.field]: en }).eq('id', it.id).or(`${it.field}.is.null,${it.field}.eq.`)
  if (error) throw new Error(error.message)
}
const polish = (en: string, field: string) => fixText(en, 'en', { cap: field !== 'desc_en' ? true : true }).text

/** Điền các ô đã dịch chắc bằng từ điển. Trả về số ô đã điền. */
export async function fillByDictionary(d: ProjectData, items: TrItem[]): Promise<number> {
  const todo = items.filter(i => i.ok); if (!todo.length) return 0
  await autoBackup(d.project ?? { id: d.entries[0]?.project_id }, 'Tự động trước khi dịch tiếng Anh', { minGapMs: 30 * 60_000 })
  await loadEnglish()
  let n = 0
  for (const it of todo) { await put(it, polish(it.draft, it.field)); n++ }
  return n
}

/** Dịch phần còn lại bằng AI (chỉ quản trị viên). */
export async function fillByAI(d: ProjectData, items: TrItem[], log: (s: string) => void = () => {}): Promise<number> {
  const todo = items.filter(i => !i.ok); if (!todo.length) return 0
  await autoBackup(d.project ?? { id: d.entries[0]?.project_id }, 'Tự động trước khi AI dịch tiếng Anh', { minGapMs: 30 * 60_000 })
  await loadEnglish()
  const ctx = d.project?.name ? `Dự án: ${d.project.name}` : undefined
  let n = 0
  for (let i = 0; i < todo.length; i += 25) {
    const part = todo.slice(i, i + 25)
    log(`AI đang dịch ${i + 1}–${i + part.length}/${todo.length}…`)
    const res = await callTranslate(ctx, part.map((p, k) => ({ id: String(k), kind: p.field.replace('_en', ''), vi: p.vi, draft: p.draft && p.draft !== p.vi ? p.draft : undefined })))
    for (const x of res) { const it = part[Number(x.id)]; if (it && x.en?.trim()) { await put(it, polish(x.en.trim(), it.field)); n++ } }
  }
  return n
}

async function callTranslate(context: string | undefined, items: { id: string; vi: string; kind?: string; draft?: string }[]): Promise<{ id: string; en: string }[]> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ context, items }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`AI dịch lỗi: ${j.error ?? res.status}`)
  return j.items ?? []
}

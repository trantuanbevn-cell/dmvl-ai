// Tự điền các ô tiếng Anh còn TRỐNG từ tiếng Việt. Không bao giờ ghi đè ô tiếng Anh đã có.
//  1) Từ điển chuyên ngành (viEn.ts) – chạy trong trình duyệt, không AI, dùng cho cụm ngắn đơn giản.
//  2) Phần còn lại (cụm dài/phức tạp/từ lạ): AI dịch (chỉ quản trị viên) kèm bản nháp của từ điển, rồi qua bộ sửa chính tả tiếng Anh.
import { supabase, FUNCTIONS_URL } from './supabase'
import { autoBackup } from './backup'
import { bulletOf, fixText, loadEnglish } from './spell'
import { translateViText } from './viEn'
import type { ProjectData } from './useProject'
import type { EnSrc } from './types'

export type TrItem = { key: string; kind: 'entry' | 'room'; id: string; field: string; vi: string; draft: string; ok: boolean; label: string; prevEn?: string; src?: EnSrc | null; /** ô EN do phần mềm dịch, chưa ai sửa tay, nay tiếng Việt đổi → dịch lại tự động được (không mất công sửa của ai) */ safe?: boolean }
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
const EF: [string, string, string][] = [['name_vn', 'name_en', 'tên'], ['part_vn', 'part_en', 'bộ phận'], ['material_vn', 'material_en', 'vật liệu'], ['desc_vn', 'desc_en', 'thông số'], ['perf_vn', 'perf_en', 'tính chất'], ['note_vn', 'note_en', 'ghi chú'], ['loc_note_vn', 'loc_note_en', 'ghi chú vị trí']]
/** Số từ tiếng Việt (có dấu) lẫn trong một ô tiếng Anh */
const viWords = (v: unknown) => (String(v ?? '').match(/[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ][\p{L}]*/giu) ?? []).length
const blank = (v: unknown) => v == null || String(v).trim() === ''

/** Các ô tiếng Anh cần dịch: (1) còn trống; (2) do phần mềm tự dịch trước đây, tiếng Việt đã đổi sau đó và tiếng Anh chưa bị ai sửa tay → dịch lại cho đồng bộ.
 *  Ô tiếng Anh người dùng tự gõ / sửa thì không bao giờ bị đụng tới. */
export type ChangeTimes = Map<string, Record<string, number>>
/** Lịch sử sửa (undo_log): thời điểm gần nhất mỗi ô của mỗi dòng bị sửa – để biết VN đã đổi SAU lần EN được ghi hay chưa, kể cả ô chưa có dấu vết dịch */
export async function loadChangeTimes(projectId: string): Promise<ChangeTimes> {
  const m: ChangeTimes = new Map()
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from('undo_log').select('row_id,at,new_vals').eq('project_id', projectId).in('tbl', ['entries', 'rooms']).eq('op', 'UPDATE').eq('reverted', false).not('new_vals', 'is', null).order('id').range(from, from + 999)
    if (error || !data) break
    for (const r of data as any[]) { const t = Date.parse(r.at); let o = m.get(r.row_id); if (!o) m.set(r.row_id, (o = {})); for (const k of Object.keys(r.new_vals ?? {})) if (!(o[k] > t)) o[k] = t }
    if (data.length < 1000) break
  }
  return m
}
export function planFill(d: ProjectData, force = false, times?: ChangeTimes): TrItem[] {
  const out: TrItem[] = []
  const add = (kind: 'entry' | 'room', row: any, label: string, ef: string, vi: unknown, prevEn?: string, forceAI = false, safe = false) => {
    const s = String(vi ?? '').trim(); if (!s) return
    const r = translateViText(s)
    out.push({ key: `${row.id}:${ef}:${norm(s)}`, kind, id: row.id, field: ef, vi: s, draft: r.en, ok: !forceAI && r.ok && !!r.en, label, prevEn, src: row.en_src ?? null, safe })
  }
  const check = (kind: 'entry' | 'room', row: any, label: string, vf: string, ef: string) => {
    if (blank(row[vf])) { if (viWords(row[ef]) >= 2) add(kind, row, label, ef, row[ef], row[ef], true); return }   // không có bản Việt: dịch chính ô EN đang lẫn tiếng Việt
    if (blank(row[ef])) return add(kind, row, label, ef, row[vf])
    // force: tiếng Việt là bản gốc – mọi ô EN không phải do bước dịch này tạo ra (AI phân tích sinh riêng, nhập từ thư viện, sửa tay…) đều dịch lại theo VN
    if (force) { const sc = (row.en_src as EnSrc | null)?.[ef]; if (!(sc && sc.en === row[ef] && norm(sc.vi) === norm(row[vf]))) return add(kind, row, label, ef, row[vf], row[ef], true) }
    const src = (row.en_src as EnSrc | null)?.[ef]
    if (src && src.en === row[ef] && norm(src.vi) !== norm(row[vf])) return add(kind, row, label, ef, row[vf], row[ef], false, true)
    // đối chiếu lịch sử sửa: tiếng Việt được sửa SAU lần tiếng Anh được ghi gần nhất → đã đổi, cần dịch lại
    const tt = times?.get(row.id), tv = tt?.[vf], te = tt?.[ef]
    if (tv && (!te || tv > te)) return add(kind, row, label, ef, row[vf], row[ef], true)
    // Ô tiếng Anh đang lẫn chữ tiếng Việt (chép nguyên từ bản Việt / trang hãng, chưa dịch) → dịch lại bằng AI
    if (viWords(row[ef]) >= 2) add(kind, row, label, ef, row[vf], row[ef], true)
  }
  for (const e of d.entries) if (e.status !== 'rejected') for (const [vf, ef] of EF) check('entry', e, `${e.code} · ${e.name_vn}`, vf, ef)
  for (const r of d.rooms) check('room', r, r.code, 'name_vn', 'name_en')
  return out
}

/** Ghi bản dịch vào ô EN – chỉ khi ô đó vẫn đang trống trong cơ sở dữ liệu */
async function put(it: TrItem, en: string) {
  const table = it.kind === 'room' ? 'rooms' : 'entries'
  const patch = { [it.field]: en, en_src: { ...(it.src ?? {}), [it.field]: { vi: it.vi, en } } }
  let q = supabase.from(table).update(patch).eq('id', it.id)
  // chỉ ghi khi ô tiếng Anh vẫn đúng như lúc kiểm (trống, hoặc đúng bản tự dịch cũ) – tránh đè lên bản người khác vừa sửa
  q = it.prevEn != null ? q.eq(it.field, it.prevEn) : q.or(`${it.field}.is.null,${it.field}.eq.`)
  const { error } = await q
  if (error) throw new Error(error.message)
}
const polish = (en: string, field: string, vi?: string) => fixText(en, 'en', { cap: true, bullet: bulletOf(field), like: vi }).text   // trình bày theo bản tiếng Việt – cùng luật với phần kiểm chính tả

/** Điền các ô đã dịch chắc bằng từ điển. Trả về số ô đã điền. */
export async function fillByDictionary(d: ProjectData, items: TrItem[]): Promise<number> {
  const todo = items.filter(i => i.ok); if (!todo.length) return 0
  await autoBackup(d.project ?? { id: d.entries[0]?.project_id }, 'Tự động trước khi dịch tiếng Anh', { minGapMs: 30 * 60_000 })
  await loadEnglish()
  let n = 0
  for (const it of todo) { await put(it, polish(it.draft, it.field, it.vi)); n++ }
  return n
}

/** Dịch phần còn lại bằng AI (chỉ quản trị viên). */
export async function fillByAI(d: ProjectData, items: TrItem[], log: (s: string) => void = () => {}): Promise<number> {
  const todo = items.filter(i => !i.ok); if (!todo.length) return 0
  await autoBackup(d.project ?? { id: d.entries[0]?.project_id }, 'Tự động trước khi AI dịch tiếng Anh', { minGapMs: 30 * 60_000 })
  await loadEnglish()
  const ctx = d.project?.name ? `Dự án: ${d.project.name}` : undefined
  let n = 0, lastErr = ''
  const B = 15
  for (let i = 0; i < todo.length; i += B) {
    const part = todo.slice(i, i + B)
    log(`AI đang dịch ${i + 1}–${i + part.length}/${todo.length}…`)
    let res: { id: string; en: string }[] = []
    for (let t = 0; t < 3; t++) {   // quá tải tạm thời → thử lại, lỗi một đợt không làm mất các đợt còn lại
      try { res = await callTranslate(ctx, part.map((p, k) => ({ id: String(k), kind: p.field.replace('_en', ''), vi: p.vi, draft: p.draft && p.draft !== p.vi ? p.draft : undefined }))); lastErr = ''; break }
      catch (e) { lastErr = String((e as Error).message ?? e); await new Promise(r => setTimeout(r, 4000 * (t + 1))) }
    }
    for (const x of res) { const it = part[Number(x.id)]; if (it && x.en?.trim()) { await put(it, polish(x.en.trim(), it.field, it.vi)); n++ } }
  }
  if (!n && lastErr) throw new Error(lastErr)
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

/** Đồng bộ toàn bộ tiếng Anh với tiếng Việt: dịch ô trống + dịch lại ô tự dịch cũ mà tiếng Việt đã đổi. Dùng khi chuyển EN/song ngữ và trước khi xuất file. */
export async function syncEnglish(d: ProjectData, log: (s: string) => void = () => {}, force = false, onlyBlank: boolean | 'safe' = false, times?: ChangeTimes): Promise<{ done: number; failed: number }> {
  // onlyBlank: chế độ tự động – ô EN trống + ô EN do phần mềm dịch mà tiếng Việt đã đổi sau đó (chưa ai sửa tay)
  const plan = planFill(d, force, times).filter(i => !onlyBlank || i.safe || (onlyBlank === true && i.prevEn == null))   // 'safe': chỉ ô đã dịch mà VN vừa đổi; if (!plan.length) return { done: 0, failed: 0 }
  const n1 = await fillByDictionary(d, plan)
  const left = plan.filter(i => !i.ok)
  const n2 = left.length ? await fillByAI(d, left, log) : 0
  return { done: n1 + n2, failed: left.length - n2 }
}

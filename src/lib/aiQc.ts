// QC cuối bằng AI (chỉ admin chạy): đối chiếu danh mục ↔ phân tích phối cảnh ↔ quy định vận hành, trả về gợi ý để mọi người xác nhận.
import { supabase, FUNCTIONS_URL } from './supabase'
import { rulesFor, EL_VN } from './opRules'
import { symbolMap } from './sections'
import type { ProjectData } from './useProject'
import type { Entry } from './types'

export type Finding = { id: string; project_id: string; entry_id: string | null; code: string | null; kind: string; field: string | null; current_text: string | null; suggestion: string | null; message: string; confidence: number | null; related: string[]; status: 'open' | 'accepted' | 'dismissed'; run_id: string | null; created_at: string }
export const KIND_LABEL: Record<string, string> = { typo: 'Chính tả', english: 'Tiếng Anh (ngữ pháp / văn phong)', mismatch: 'Việt ≠ Anh / tự mâu thuẫn', wrong: 'Thông tin sai', duplicate: 'Nghi trùng', rule: 'Vi phạm quy định vận hành', render: 'Lệch phân tích phối cảnh', missing: 'Thiếu thông tin' }
const FIELDS = ['name_vn', 'name_en', 'material_vn', 'material_en', 'desc_vn', 'desc_en', 'part_vn', 'part_en', 'perf_vn', 'perf_en', 'note_vn', 'note_en', 'brand', 'product_code', 'origin'] as const
const cut = (s: string | null | undefined, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t }

async function callQc(payload: unknown): Promise<{ issues?: any[] }> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${FUNCTIONS_URL}/qc`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ payload }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`AI soát lỗi: ${j.error ?? j.message ?? res.status}`)
  return j
}

export async function loadFindings(projectId: string): Promise<Finding[]> {
  const { data } = await supabase.from('qc_findings').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1000)
  return (data ?? []) as Finding[]
}

/** Chạy AI theo từng lô; kết quả được kiểm lại bằng phần mềm (mã có thật, đoạn trích có thật trong ô, độ tin cậy ≥ 0.85) rồi lưu */
export async function runAiQc(d: ProjectData, onProgress: (msg: string) => void): Promise<number> {
  const live = d.entries.filter(e => e.status !== 'rejected')
  /* AI nhìn thấy KÝ HIỆU trên bản vẽ (vd PNT-02, MTL-07) – cũng là ký hiệu được nhắc trong các ô – nên dùng ký hiệu làm mã */
  const sym = symbolMap(d.entries), S = (e: Entry) => sym.get(e.id) ?? e.code
  const byCode = new Map(live.map(e => [S(e), e]))
  const rooms = d.rooms.map(r => `${r.code}|${r.name_vn}|${r.name_en ?? ''}|${r.room_type}`)
  const rules = d.rules.map(r => `${r.id.slice(0, 6)}|${r.room_ids.map(id => d.rooms.find(x => x.id === id)?.code).filter(Boolean).join(',')}|${r.elements.map(e => EL_VN[e] ?? e).join(',')}|${cut(r.title_vn || r.title_en, 120)}: ${cut(r.body_vn || r.body_en, 500)}`)
  const index = live.map(e => `${S(e)}|${e.group_code}|${cut(e.name_vn, 60)}|${cut(e.name_en, 60)}|${cut(e.material_vn, 70)}`)
  const rowOf = (e: Entry) => {
    const occ = d.occ.filter(o => o.entry_id === e.id)
    const rm = [...new Set(occ.filter(o => o.room_id).map(o => d.rooms.find(r => r.id === o.room_id)?.code).filter(Boolean))]
    const notes = [...new Set(occ.map(o => cut(o.note, 160)).filter(Boolean))].slice(0, 3)
    const rl = rulesFor(d, e.id).map(h => h.rule.id.slice(0, 6))
    const o: Record<string, unknown> = { code: S(e), group: e.group_code, rooms: rm.join(','), source: e.source }
    for (const f of FIELDS) { const v = (e as any)[f]; if (v && String(v).trim()) o[f] = cut(v, 1500) }
    if (notes.length) o.render_note = notes.join(' / ')
    if (rl.length) o.rule_ids = rl.join(',')
    return o
  }
  const rows = live.map(rowOf)
  const CH = 20, runId = new Date().toISOString()
  const found: Omit<Finding, 'id' | 'created_at'>[] = []
  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i += CH) {
    onProgress(`AI đang soát ${Math.min(i + CH, rows.length)}/${rows.length} mã…`)
    let res
    try { res = await callQc({ project: d.project?.name ?? '', rules, rooms, index, entries: rows.slice(i, i + CH) }) } catch (e) { if (i === 0) throw e; onProgress('Một lô bị lỗi, bỏ qua: ' + String((e as Error).message ?? e)); continue }
    for (const it of (res.issues ?? []) as any[]) {
      const e = byCode.get(String(it.code ?? '').trim()); if (!e) continue
      if (!(Number(it.confidence) >= 0.85) || !it.message) continue
      const field = FIELDS.includes(it.field) ? it.field : (it.field ?? null)
      const cur = it.current ? String(it.current) : null
      // đoạn trích phải có thật trong ô → chống AI bịa
      if (cur && (FIELDS as readonly string[]).includes(field)) { const v = String((e as any)[field] ?? ''); if (!v.includes(cur)) continue }
      const sug = it.suggestion ? String(it.suggestion) : null
      if (sug && cur && sug.trim() === cur.trim()) continue
      const related = ((it.related ?? []) as string[]).filter(c => byCode.has(c) && c !== S(e))
      if (it.kind === 'duplicate' && !related.length) continue
      const key = [S(e), it.kind, field, cur ?? cut(it.message, 40)].join('|'); if (seen.has(key)) continue; seen.add(key)
      found.push({ project_id: e.project_id, entry_id: e.id, code: S(e), kind: String(it.kind), field, current_text: cur, suggestion: sug, message: String(it.message), confidence: Number(it.confidence), related, status: 'open', run_id: runId })
    }
  }
  // Giữ lại các gợi ý đã xử lý (để không báo lại); thay thế các gợi ý còn mở bằng lần chạy mới
  const pid = d.project!.id
  const old = await loadFindings(pid)
  const done = new Set(old.filter(f => f.status !== 'open').map(f => [f.code, f.kind, f.field, f.current_text ?? f.message.slice(0, 40)].join('|')))
  const fresh = found.filter(f => !done.has([f.code, f.kind, f.field, f.current_text ?? f.message.slice(0, 40)].join('|')))
  await supabase.from('qc_findings').delete().eq('project_id', pid).eq('status', 'open')
  if (fresh.length) { const { error } = await supabase.from('qc_findings').insert(fresh); if (error) throw new Error(error.message) }
  return fresh.length
}

export async function resolveFinding(id: string, status: 'accepted' | 'dismissed') {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('qc_findings').update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}

// Lớp hoàn thiện ↔ vật liệu nền: mục nền (trần thạch cao, vách, nhôm…) chỉ cần TRỎ tới mã sơn (PT…) trong danh mục,
// thông số hoàn thiện tự lấy từ mã đó. Phần mềm (không AI) soát chỗ gõ tay lệch / thiếu / mâu thuẫn và sửa bằng một nút.
import { supabase } from './supabase'
import { catLabel } from './codes'
import type { Entry, EnSrc } from './types'
import type { ProjectData } from './useProject'

/** Nhóm mã được coi là “lớp hoàn thiện” (mở rộng sau: giấy dán tường, bả matit… chỉ cần thêm vào đây) */
export const FINISH_GROUPS = ['PT']
export const isFinish = (e: Entry) => FINISH_GROUPS.includes(e.group_code)
const isGypsum = (e: Entry) => ['GWB', 'FGWB', 'MGWB'].includes(e.group_code) || (e.category === 'ceiling' && /thạch cao|gypsum/i.test(`${e.name_vn} ${e.composition ?? ''} ${e.material_vn ?? ''}`))
const isHatch = (e: Entry) => /nắp thăm|access\s*(hatch|panel)/i.test(`${e.name_vn} ${e.name_en ?? ''}`)

const DULUX = /\b(\d{2}[A-Z]{2})\s*(\d{2,3})\s*\/\s*(\d{3})\b/g
const BRANDNUM = /\b(jotun|nippon|mykolor|kova|toa|spec|maxilite)\s+(?:[a-zà-ỹ]+\s+){0,3}?(\d{3,5})\b/gi
/** Các mã màu sơn viết tay trong một đoạn chữ (đã chuẩn hoá để so sánh) */
export function colorCodes(text: string | null | undefined): string[] {
  const t = String(text ?? ''), out = new Set<string>()
  for (const m of t.matchAll(DULUX)) out.add(`${m[1]}${m[2]}/${m[3]}`.toUpperCase())
  for (const m of t.matchAll(BRANDNUM)) out.add(`${m[1].toLowerCase()}${m[2]}`)
  return [...out]
}
/** Ký hiệu vật liệu viết tay (vd PNT-01) */
const symTokens = (t: string | null | undefined) => [...new Set([...String(t ?? '').matchAll(/\b[A-Z]{2,5}-\d{2,3}\b/g)].map(m => m[0].toUpperCase()))]
const show = (k: string) => k.replace(/^(\d{2}[A-Z]{2})(?=\d)/, '$1 ')
const specText = (e: Entry) => [e.desc_vn, e.material_vn, e.composition].filter(Boolean).join('\n')
const paintCodesOf = (e: Entry) => colorCodes([e.desc_vn, e.desc_en, e.material_vn, e.name_vn, e.note_vn].filter(Boolean).join('\n'))

export type FinishFix = { refs: string[]; strip: string[]; generic?: boolean; label: string; bulk?: boolean }
export type FinishIssue = { kind: 'err' | 'miss'; text: string; fix?: FinishFix }

export type FinishCtx = { live: Entry[]; byId: Map<string, Entry>; paint: Entry[]; codeMap: Map<string, Entry>; symMap: Map<string, Entry>; roomCode: Map<string, string>; occOf: Map<string, ProjectData['occ']>; d: ProjectData; sym: (e: Entry) => string }
export function finishCtx(d: ProjectData, sym: (e: Entry) => string): FinishCtx {
  const live = d.entries.filter(e => e.status !== 'rejected')
  const paint = live.filter(isFinish).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
  const codeMap = new Map<string, Entry>()
  for (const p of paint) for (const c of paintCodesOf(p)) if (!codeMap.has(c)) codeMap.set(c, p)
  const symMap = new Map<string, Entry>()
  for (const p of paint) for (const k of [sym(p), p.product_code ?? '']) if (k.trim()) symMap.set(k.trim().toUpperCase(), p)
  const occOf = new Map<string, ProjectData['occ']>()
  for (const o of d.occ) occOf.set(o.entry_id, [...(occOf.get(o.entry_id) ?? []), o])
  return { live, byId: new Map(live.map(e => [e.id, e])), paint, codeMap, symMap, roomCode: new Map(d.rooms.map(r => [r.id, r.code])), occOf, d, sym }
}
export const refsOf = (e: Entry, c: Pick<FinishCtx, 'byId'>) => (e.finish_refs ?? []).map(id => c.byId.get(id)).filter((x): x is Entry => !!x && isFinish(x))

const WHITE = /trắng|white/i
/** Soát lớp hoàn thiện của một mục (mục sơn PT không phải kiểm) */
export function finishIssues(e: Entry, c: FinishCtx): FinishIssue[] {
  if (isFinish(e)) return []
  const out: FinishIssue[] = []
  const refs = refsOf(e, c), refIds = refs.map(r => r.id)
  const S = c.sym, gyp = isGypsum(e) && !isHatch(e)
  const txt = specText(e)
  const typedCodes = colorCodes(txt), typedSyms = symTokens(txt).filter(k => c.symMap.has(k))
  const typed = [...typedCodes, ...typedSyms]
  const ptOf = (k: string) => c.codeMap.get(k) ?? c.symMap.get(k)
  const refKeys = new Set([...refs.flatMap(paintCodesOf), ...refs.flatMap(r => [S(r).toUpperCase(), (r.product_code ?? '').toUpperCase()])])
  const unknown = typedCodes.filter(k => !c.codeMap.has(k))
  const mapped = typed.filter(k => ptOf(k))

  // 1. Mã sơn gõ tay không có trong nhóm sơn của dự án
  if (unknown.length) out.push({ kind: 'err', text: `Ghi mã sơn ${unknown.map(show).join(', ')} nhưng dự án không có mã sơn nào dùng màu này – thêm vào nhóm Sơn nước (PT) hoặc dùng mã PT có sẵn` })
  // 2. Đã gắn mã hoàn thiện nhưng thông số còn ghi một mã màu khác / còn gõ tay
  if (refs.length) {
    const diff = mapped.filter(k => !refKeys.has(k))
    if (diff.length && !unknown.length) out.push({ kind: 'err', text: `Thông số ghi ${diff.map(show).join(', ')} nhưng lớp hoàn thiện đã gắn là ${refs.map(S).join(', ')} – chỉ giữ một nguồn`, fix: { refs: [...new Set([...refIds, ...diff.map(k => ptOf(k)!.id)])], strip: diff, generic: gyp, label: `Gắn thêm ${[...new Set(diff.map(k => S(ptOf(k)!)))].join(', ')} & bỏ chữ gõ tay`, bulk: false } })
    else if (mapped.length && !diff.length) out.push({ kind: 'miss', text: `${mapped.map(show).join(', ')} đang gõ tay trong thông số, trong khi đã gắn ${refs.map(S).join(', ')} – bỏ chữ gõ tay cho gọn`, fix: { refs: refIds, strip: mapped, generic: gyp, label: 'Bỏ chữ gõ tay, dùng mã đã gắn', bulk: true } })
  } else if (mapped.length) {
    // 3. Gõ tay mã trùng với một mã PT sẵn có → gắn liên kết
    const pts = [...new Set(mapped.map(k => ptOf(k)!))]
    if (!unknown.length) out.push({ kind: 'miss', text: `Thông số đang gõ tay ${mapped.map(show).join(', ')} – gắn ${pts.map(S).join(', ')} vào ô “Lớp hoàn thiện” để tự đồng bộ, khỏi gõ lại`, fix: { refs: pts.map(p => p.id), strip: mapped, generic: gyp, label: `Gắn ${pts.map(S).join(', ')} & bỏ chữ gõ tay`, bulk: true } })
  }
  // 4. Nền thạch cao nhưng chưa gắn lớp hoàn thiện
  if (gyp && !refs.length && !typed.length) {
    const t = specText(e), says = /sơn/i.test(t)
    const cand = WHITE.test(t) ? c.paint.filter(p => WHITE.test(`${p.desc_vn ?? ''} ${p.desc_en ?? ''}`)) : []
    out.push({ kind: 'miss', text: says ? 'Ghi “sơn” chung chung nhưng chưa gắn mã sơn nào của dự án' + (cand.length ? ` – gợi ý ${cand.map(S).join(' / ')} (màu trắng)` : '') : 'Chưa có lớp hoàn thiện (mã sơn) cho nền thạch cao',
      fix: cand.length === 1 ? { refs: [cand[0].id], strip: [], generic: true, label: `Gắn ${S(cand[0])}`, bulk: true } : undefined })
  }
  // 5. Lệch theo phòng: cùng phòng + cùng hạng mục nhưng ảnh khoanh gán mã sơn khác
  const mine = c.occOf.get(e.id) ?? [], seen = new Set<string>()
  for (const o of mine) {
    if (!o.room_id) continue
    const cat = o.category ?? e.category; if (!cat) continue
    for (const p of c.paint) {
      if (refIds.includes(p.id)) continue
      if (!(c.occOf.get(p.id) ?? []).some(q => q.room_id === o.room_id && (q.category ?? p.category) === cat)) continue
      if (!refs.length && !gyp) continue   // chỉ đối chiếu mục nền thạch cao hoặc mục đã gắn mã
      const k = `${p.id}|${cat}`; if (seen.has(k)) continue; seen.add(k)
      const rooms = [...new Set(mine.filter(z => z.room_id && (z.category ?? e.category) === cat && (c.occOf.get(p.id) ?? []).some(q => q.room_id === z.room_id && (q.category ?? p.category) === cat)).map(z => c.roomCode.get(z.room_id!) ?? ''))].filter(Boolean)
      out.push({ kind: 'err', text: `Phòng ${rooms.join(', ')}: ${catLabel(cat).toLowerCase()} gán ${S(p)} trong ảnh khoanh, nhưng ${S(e)} ${refs.length ? `ghi ${refs.map(S).join(', ')}` : 'chưa gắn mã sơn nào'}`, fix: { refs: [...new Set([...refIds, p.id])], strip: [], label: `Gắn thêm ${S(p)} theo ảnh khoanh`, bulk: false } })
    }
  }
  return out
}

/** Dòng “Hoàn thiện” tự sinh từ các mã đã gắn (VN / EN) – dùng khi xuất file và xem trước */
export function finishLines(e: Entry, all: Entry[], sym: (x: Entry) => string): { vn: string; en: string }[] {
  const ids = e.finish_refs ?? []; if (!ids.length) return []
  const by = new Map(all.map(x => [x.id, x]))
  const water = isGypsum(e)
  return ids.map(id => by.get(id)).filter((p): p is Entry => !!p && p.status !== 'rejected').map(p => {
    const colour = (re: RegExp, s: string | null) => { const m = re.exec(s ?? ''); return m ? m[1].trim().replace(/[.;]+$/, '') : '' }
    const cv = colour(/(?:mã\s*(?:màu|sơn)?\s*tham\s*khảo|mã\s*màu)\s*:\s*([^\n]+)/i, p.desc_vn) || p.product_code || ''
    const ce = colour(/(?:reference\s+(?:colour|paint)\s+code|colour\s+code)\s*:\s*([^\n]+)/i, p.desc_en) || cv
    const s = sym(p)
    return { vn: `${water ? 'Hoàn thiện' : 'Màu sơn'}: ${p.name_vn} ${s}${cv ? ' – ' + cv : ''}`, en: `${water ? 'Finish' : 'Paint colour'}: ${p.name_en || p.name_vn} ${s}${ce ? ' – ' + ce : ''}` }
  })
}

/** Bỏ các câu có mã màu gõ tay (và câu “Sơn hoàn thiện màu …” chung chung) khỏi đoạn thông số */
function stripText(t: string | null, codes: string[], generic: boolean): string | null {
  if (!t) return t
  const lines = t.split('\n').map(line => {
    const dash = /^\s*-\s*/.test(line)
    const sents = line.trim().split(/(?<=\.)\s+/)
    const keep = sents.filter(s => {
      if (codes.length && [...colorCodes(s), ...symTokens(s)].some(k => codes.includes(k))) return false
      if (generic && (/^\W*sơn\s+hoàn\s+thiện\b[^.]*\.?$/i.test(s) || /^\W*(?:white|off-white)\s+(?:finish\s+paint|paint(?:ed)?\s+finish)\b[^.]*\.?$/i.test(s))) return false
      return true
    })
    if (keep.length === sents.length) return line
    const r = keep.join(' ').trim()
    return r ? (dash && !/^\s*-/.test(r) ? '- ' + r : r) : ''
  })
  return lines.filter((l, i) => l.trim() || !t.split('\n')[i].trim()).join('\n').replace(/\n{2,}/g, '\n').trim() || null
}

/** Áp dụng một cách sửa: gắn mã hoàn thiện + dọn chữ gõ tay (VN & EN, giữ nguyên dấu vết dịch để không bị dịch lại) */
export async function applyFinishFix(e: Entry, fix: FinishFix): Promise<void> {
  const patch: Record<string, unknown> = { finish_refs: fix.refs }
  if (fix.strip.length || fix.generic) {
    const ensrc: EnSrc = { ...(e.en_src ?? {}) }
    const nv = stripText(e.desc_vn, fix.strip, !!fix.generic), ne = stripText(e.desc_en, fix.strip, !!fix.generic)
    if (nv !== e.desc_vn) patch.desc_vn = nv
    if (ne !== e.desc_en) patch.desc_en = ne
    const mv = stripText(e.material_vn, fix.strip, false), me = stripText(e.material_en, fix.strip, false)
    if (mv !== e.material_vn) patch.material_vn = mv
    if (me !== e.material_en) patch.material_en = me
    if (ensrc.desc_en && (patch.desc_vn !== undefined || patch.desc_en !== undefined)) { ensrc.desc_en = { vi: String((patch.desc_vn !== undefined ? patch.desc_vn : e.desc_vn) ?? ''), en: String((patch.desc_en !== undefined ? patch.desc_en : e.desc_en) ?? '') }; patch.en_src = ensrc }
  }
  const { error } = await supabase.from('entries').update(patch).eq('id', e.id)
  if (error) throw new Error(error.message)
}

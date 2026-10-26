import { bulletOf } from '../lib/spell'
import OpRuleBadge from './OpRuleBadge'
import { syncLibrary } from '../lib/matLibrary'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import LinkCell from './LinkCell'
import { toast } from '../lib/toast'
import { moveRoom, undoMove } from '../lib/cropMove'
import QuickMergeDialog from './QuickMergeDialog'
import MergePicker from './MergePicker'
import { saveEntry, linkedWith } from '../lib/entryLink'
import { symOf, vlLines } from '../lib/sections'
import { kindOfGroup } from '../lib/suggestApply'
import { KIND_VN } from '../lib/construction'
import { CATEGORIES, CATEGORY_GROUPS } from '../lib/codes'
import { groupBySection, sectionOf, allSections, sectionTitle, bandTitle, legacyCodes, symbolOf, symbolMap, BANDS, bandKeys, type Lang } from '../lib/sections'
import { locationsOf } from '../lib/locations'
import type { ProjectData } from '../lib/useProject'
import type { Entry, Occurrence, Room } from '../lib/types'
import { missingPairs, locateMissingShots } from '../lib/locateShots'
import OccCrop from './OccCrop'
import AddShot from './AddShot'
import RoomShotFallback from './RoomShotFallback'
import GroupPicker from './GroupPicker'
import { changeGroup } from '../lib/entryGroup'
import { analyzeRoom } from '../lib/pipeline'
import MatImage from './MatImage'
import { StatusDot } from '../pages/tabs/MaterialView'
import { useAuth } from '../lib/auth'
import SuggestDialog from './SuggestDialog'
import { missingOf, missText } from '../lib/missing'
import { isFinish, refsOf, finishCtx, finishIssues, finishLines, applyFinishFix, dismissFinish } from '../lib/finishCheck'

type K = keyof Entry
/** Ô sửa trực tiếp: lưu khi rời ô */
function Ed({ e, k, area, ph, num, w, miss }: { e: Entry; k: K; area?: boolean; ph?: string; num?: boolean; w?: number; miss?: boolean }) {
  const { canEdit } = useAuth()
  const cur = String((e[k] as any) ?? '')
  const [v, setV] = useState<string>(cur)
  useEffect(() => setV(cur), [cur, k]) // chỉ nạp lại khi giá trị trong DB đổi (không ghi đè khi người khác sửa dòng khác)
  const save = async () => {
    if (String((e[k] as any) ?? '') === v) return
    const val = num ? (v === '' ? null : Number(v)) : v || null
    const error = await saveEntry(e, { [k]: val })
    if (error) alert(error.message)
  }
  const dl = String(k).endsWith('_vn') ? 'vn' : String(k).endsWith('_en') ? 'en' : ['product_code', 'color_hex', 'product_url'].includes(String(k)) || num ? 'none' : 'name'
  const common = { value: v, placeholder: ph, 'data-lang': dl, 'data-bullet': bulletOf(String(k)), readOnly: !canEdit, className: miss ? 'miss' : undefined, title: miss ? 'Thiếu thông tin – cần điền' : undefined, onChange: (x: any) => setV(x.target.value), onBlur: save, onClick: (x: any) => x.stopPropagation(), style: w ? { width: w } : undefined }
  const ref = useRef<HTMLTextAreaElement>(null)
  // ô chữ tự giãn cao theo nội dung (và theo độ rộng cột) để thấy ĐỦ chữ, kiểm tra được đúng như bản xuất
  const fit = () => { const t = ref.current; if (!t) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px' }
  useLayoutEffect(fit, [v])
  useEffect(() => { const t = ref.current; if (!t || typeof ResizeObserver === 'undefined') return; let w = t.clientWidth; const ro = new ResizeObserver(() => { if (t.clientWidth !== w) { w = t.clientWidth; fit() } }); ro.observe(t); return () => ro.disconnect() }, [])
  if (num) return <input {...common} type="number" />
  return <textarea {...common} ref={ref} rows={area ? 2 : 1} style={{ ...(common.style ?? {}), overflow: 'hidden', resize: 'none' }} onKeyDown={area ? undefined : (x: any) => { if (x.key === 'Enter') { x.preventDefault(); x.target.blur() } }} />
}
/** Ô mã vật liệu: một vật có thể có NHIỀU mã (mỗi mã một ô). Lưu trong cột product_code, mỗi mã một dòng. */
function CodeList({ e, miss, sym }: { e: Entry; miss?: boolean; sym: string }) {
  const { canEdit } = useAuth()
  const shown = () => { const a = vlLines(e.product_code, sym); return a.length ? a : [''] }
  const [rows, setRows] = useState<string[]>(shown)
  const sig = (e.product_code ?? '') + '|' + sym
  useEffect(() => setRows(shown()), [sig])   // ký hiệu bản vẽ đổi số → ô này tự đổi theo
  const save = async (list: string[]) => {
    const val = list.map(s => s.trim()).filter(Boolean).join('\n') || null
    if ((vlLines(e.product_code, sym).join('\n') || null) === val) return   // chưa sửa gì (chỉ bấm vào rồi thoát) → không ghi
    const error = await saveEntry(e, { product_code: val })
    if (error) alert(error.message)
  }
  return <div className="code-list" onClick={x => x.stopPropagation()}>
    {rows.map((v, i) => <div key={i} className="row gap sm-gap" style={{ flexWrap: 'nowrap' }}>
      <input value={v} placeholder={i === 0 ? 'Mã vật liệu' : 'Mã thêm'} data-lang="none" readOnly={!canEdit} className={miss && !v ? 'miss' : undefined} title={miss && !v ? 'Thiếu thông tin – cần điền' : undefined}
        onChange={x => setRows(r => r.map((y, j) => (j === i ? x.target.value : y)))} onBlur={() => save(rows)} />
      {canEdit && rows.length > 1 && <a className="loc-x" title="Bỏ mã này" onClick={() => { const n = rows.filter((_, j) => j !== i); setRows(n); save(n) }}>✕</a>}
    </div>)}
    {canEdit && rows[rows.length - 1].trim() !== '' && <button className="btn ghost sm" title="Thêm một mã vật liệu nữa cho hạng mục này (vd đồ rời gồm nhiều vật liệu)" onClick={() => setRows(r => [...r, ''])}>＋ mã</button>}
    {canEdit && rows.length === 1 && rows[0].trim() === '' && <button className="btn ghost sm" title="Thêm mã" onClick={() => setRows(['', ''])}>＋</button>}
  </div>
}
const pair = (k: 'name' | 'material' | 'desc' | 'note' | 'perf' | 'part', lang: Lang): K[] => (lang === 'vn' ? [`${k}_vn`] : lang === 'en' ? [`${k}_en`] : [`${k}_vn`, `${k}_en`]) as K[]
/** Song ngữ + cả hai bản đều ngắn (vd. Tường / Wall) → một dòng "VN / EN"; nội dung dài vẫn xuống dòng */
const shortBi = (e: Entry, base: 'name' | 'part', total: number, lang: Lang) => { const a = String((e as any)[`${base}_vn`] ?? ''), b = String((e as any)[`${base}_en`] ?? ''); return lang === 'both' && !/\n/.test(a + b) && (a + b).length <= total && (a + b).length > 0 }
const roomName = (r: Room, lang: Lang) => (lang === 'en' ? r.name_en || r.name_vn : lang === 'both' && r.name_en && r.name_en !== r.name_vn ? `${r.name_vn} / ${r.name_en}` : r.name_vn)
const flag = (k: K) => (String(k).endsWith('_en') ? 'EN' : String(k).endsWith('_vn') ? 'VN' : '')

// Cột giống bảng danh mục mẫu của công ty (tên và vị trí cột)
const HEAD: Record<Lang, string[]> = {
  vn: ['STT', 'KÍ HIỆU BẢN VẼ', 'KÍ HIỆU VL', 'Hạng mục', 'Vị trí', 'Hình ảnh phối cảnh', 'Thông số kỹ thuật', 'Xuất xứ/ Thương hiệu', 'Hình ảnh vật liệu', 'Ghi chú'],
  en: ['No.', 'DRAWING CODE', 'MATERIAL CODE', 'Item', 'Location', 'Render image', 'Specification', 'Origin / Brand', 'Material image', 'Remarks'],
  both: ['STT / No.', 'KÍ HIỆU BẢN VẼ / DRAWING CODE', 'KÍ HIỆU VL / MATERIAL CODE', 'Hạng mục / Item', 'Vị trí / Location', 'Hình ảnh phối cảnh / Render', 'Thông số kỹ thuật / Specification', 'Xuất xứ/ Thương hiệu / Origin / Brand', 'Hình ảnh vật liệu / Material image', 'Ghi chú / Remarks'],
}
const HW: (number | string)[] = ['3%', '6%', '7%', '7.5%', '12.5%', '8%', '18%', '10%', '9%', '8%']   // tổng = 100% (cột cuối 7.5%) → vừa khung, không phải kéo ngang
export default function RoomSections({ d, room, lang, filter, sel, onPick, onDetail, onRemove, onAdd, only, entryId, focusOcc }: {
  only?: string; entryId?: string; /** vùng khoanh vừa bấm trên ảnh phối cảnh: ảnh crop hiện ra phải đúng vùng này */ focusOcc?: string; d: ProjectData; room: Room | null; lang: Lang; filter: 'all' | 'pending' | 'inferred' | 'missing'; sel: string | null
  onPick: (o: Occurrence) => void; onDetail: (id: string) => void; onRemove: (o: Occurrence) => void
  onAdd: (p: { section_key?: string | null; copy?: string; group: string; category: string; name: string; part_vn?: string | null; parent_id?: string | null; hint?: string }) => void
}) {
  const { canEdit, isAdmin, can } = useAuth()
  // Độ rộng cột kéo được (px), nhớ theo từng chế độ ngôn ngữ; null = mặc định
  const [cw, setCwS] = useState<number[] | null>(() => { try { const j = JSON.parse(localStorage.getItem('dmvl.cw2.' + lang) || 'null'); return Array.isArray(j) && j.length === 11 ? j : null } catch { return null } })
  useEffect(() => { try { const j = JSON.parse(localStorage.getItem('dmvl.cw2.' + lang) || 'null'); setCwS(Array.isArray(j) && j.length === 11 ? j : null) } catch { setCwS(null) } }, [lang])
  const setCw = (v: number[] | null) => { setCwS(v); try { if (v) localStorage.setItem('dmvl.cw2.' + lang, JSON.stringify(v)); else localStorage.removeItem('dmvl.cw2.' + lang) } catch { /* bỏ qua */ } }
  const startResize = (ev: React.MouseEvent, i: number) => {
    ev.preventDefault(); ev.stopPropagation()
    const tr = (ev.currentTarget as HTMLElement).closest('tr'); if (!tr) return
    const base = Array.from(tr.children).map(c => Math.round((c as HTMLElement).getBoundingClientRect().width))
    if (base.length !== 11) return
    const x0 = ev.clientX, T = base.reduce((x, y) => x + y, 0)
    const calc = (cx: number) => { const dx = Math.max(40 - base[i], Math.min(base[i + 1] - 40, cx - x0)); const nx = base.slice(); nx[i] = base[i] + dx; nx[i + 1] = base[i + 1] - dx; return nx.map(w => (w / T) * 100) }
    const mv = (e: MouseEvent) => setCwS(calc(e.clientX))
    const up = (e: MouseEvent) => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); setCw(calc(e.clientX)) }
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up)
  }
  const [sugE, setSugE] = useState<Entry | null>(null)
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const legacy = useMemo(() => legacyCodes(d.entries), [d.entries])
  const symMap = useMemo(() => symbolMap(d.entries), [d.entries])
  // Gộp nhanh: bấm đúp ký hiệu bản vẽ → gõ/dán ký hiệu của vật liệu khác → Enter → hộp xác nhận
  const [symEdit, setSymEdit] = useState<{ id: string; v: string } | null>(null)
  const [qm, setQm] = useState<{ src: Entry; tgt: Entry } | null>(null)
  const [pickSrc, setPickSrc] = useState<Entry | null>(null)
  // Chép / dán nhanh thông số: chép nội dung mô tả, vật liệu, hãng, xuất xứ… của một mã rồi dán sang mã khác (không chép mã SP, link, ảnh, màu, SL)
  const SPEC_KEYS = ['name_vn', 'name_en', 'part_vn', 'part_en', 'material_vn', 'material_en', 'desc_vn', 'desc_en', 'perf_vn', 'perf_en', 'standards', 'brand', 'origin'] as const
  const [clip, setClip] = useState<{ id: string; sym: string; data: Record<string, unknown> } | null>(() => { try { return JSON.parse(sessionStorage.getItem('dmvl-spec-clip') ?? 'null') } catch { return null } })
  const copySpec = (e: Entry) => {
    const data: Record<string, unknown> = {}; for (const k of SPEC_KEYS) data[k] = e[k] ?? null
    const c = { id: e.id, sym: symMap.get(e.id) ?? e.code, data }; setClip(c); try { sessionStorage.setItem('dmvl-spec-clip', JSON.stringify(c)) } catch { /* bỏ qua */ }
    toast(`Đã chép thông số ${c.sym}. Bấm “Dán” ở dòng khác để áp dụng.`, 'ok')
  }
  const pasteSpec = async (e: Entry) => {
    if (!clip || clip.id === e.id) return
    const sym = symMap.get(e.id) ?? e.code
    if (!confirm(`Dán thông số của ${clip.sym} vào ${sym}?\nTên, vật liệu, mô tả, hãng, xuất xứ của ${sym} sẽ được thay bằng của ${clip.sym}. Mã sản phẩm, link, ảnh mẫu, màu, số lượng giữ nguyên.`)) return
    const old: Record<string, unknown> = {}; for (const k of SPEC_KEYS) old[k] = e[k] ?? null
    const err = await saveEntry(e, clip.data)
    if (err) { toast(err.message); return }
    await d.reload()
    toast(`Đã dán thông số ${clip.sym} vào ${sym}`, 'ok', { label: '↶ Hoàn tác', run: async () => { await saveEntry(e, old); toast('Đã hoàn tác', 'ok'); d.reload() } })
  }
  const startMerge = (src: Entry, text: string) => {
    setSymEdit(null)
    const k = text.trim().toUpperCase().replace(/\s+/g, ''); if (!k) return
    const tgt = d.entries.filter(x => x.id !== src.id && x.status !== 'rejected').find(x => (symMap.get(x.id) ?? '').toUpperCase() === k) ?? d.entries.filter(x => x.id !== src.id && x.status !== 'rejected').find(x => x.code.toUpperCase() === k)
    if (symMap.get(src.id)?.toUpperCase() === k) return
    if (!tgt) { toast(`Không có vật liệu nào mang ký hiệu “${text.trim()}”. Gõ đúng ký hiệu bản vẽ, vd WP-03.`); return }
    setQm({ src, tgt })
  }
  const fctx = useMemo(() => finishCtx(d, x => symMap.get(x.id) ?? x.code), [d.entries, d.occ, d.rooms, symMap]) // eslint-disable-line
  const occ = room ? d.occ.filter(o => o.room_id === room.id) : d.occ
  const ids = [...new Set(occ.map(o => o.entry_id))]
  let ents = d.entries.filter(e => (room ? ids.includes(e.id) : true) && e.status !== 'rejected')
  if (only) ents = ents.filter(e => sectionOf(e).key === only)
  if (entryId) ents = ents.filter(e => e.id === entryId)
  if (filter === 'pending') ents = ents.filter(e => e.status === 'pending' || e.status === 'review')
  if (filter === 'inferred') ents = ents.filter(e => e.source === 'inferred')
  if (filter === 'missing') ents = ents.filter(e => missingOf(e, lang).length)
  const secs = groupBySection(ents)
  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); if (status === 'approved') syncLibrary(e.project_id, [{ ...e, status }]); d.reload() }
  /** Xoá hạng mục: nếu mã còn dùng ở phòng khác thì chỉ bỏ khỏi phòng này, ngược lại xoá hẳn mã */
  const del = async (e: Entry) => {
    const others = room ? [...new Set(d.occ.filter(o => o.entry_id === e.id && o.room_id && o.room_id !== room.id).map(o => o.room_id!))] : []
    if (room && others.length) {
      if (!confirm(`${symOf(d.entries, e)} ${e.name_vn} còn dùng ở ${others.length} phòng khác → chỉ bỏ khỏi phòng ${room.code}. Tiếp tục?`)) return
      await supabase.from('occurrences').delete().eq('entry_id', e.id).eq('room_id', room.id)
    } else {
      if (!confirm(`Xoá hẳn ${symOf(d.entries, e)} ${e.name_vn}? Không hoàn tác được.`)) return
      await supabase.from('entries').update({ parent_id: null }).eq('parent_id', e.id)
      await supabase.from('occurrences').delete().eq('entry_id', e.id)
      const { error } = await supabase.from('entries').delete().eq('id', e.id)
      if (error) { alert(error.message); return }
    }
    d.reload()
  }
  const [shotFor, setShotFor] = useState<Entry | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const [entDrop, setEntDrop] = useState<{ id: string; after: boolean } | null>(null)
  /** Đổi thứ tự vật liệu trong nhóm mã (kéo thả hoặc ▲▼): các mã CT-01, CT-02… được gán lại theo thứ tự mới, nội dung giữ nguyên */
  const reorder = async (e: Entry, target: Entry, after: boolean) => {
    if (e.id === target.id) return
    if (e.group_code !== target.group_code) { toast('Chỉ đổi thứ tự được trong cùng nhóm mã (' + e.group_code + ').'); return }
    const num = (c: string) => parseInt(c.replace(/\D/g, '') || '0', 10)
    const list = d.entries.filter(x => x.group_code === e.group_code && x.id !== e.id).sort((a, b) => num(a.code) - num(b.code) || a.code.localeCompare(b.code))
    const at = list.findIndex(x => x.id === target.id); if (at < 0) return
    list.splice(at + (after ? 1 : 0), 0, e)
    const { error } = await supabase.rpc('reorder_entries', { p_ids: list.map(x => x.id) })
    if (error) { alert('Không đổi được thứ tự: ' + error.message); return }
    // Ký hiệu VL (mã vật liệu) đang ghi theo dãy số của nhóm (vd GWB-01, GWB-02…) → đổi theo ký hiệu bản vẽ MỚI, để hai cột luôn khớp nhau
    try {
      const codes = list.map(x => x.code).sort((a, b) => num(a) - num(b) || a.localeCompare(b)), newCode = new Map(list.map((x, i) => [x.id, codes[i]]))
      const before = symbolMap(d.entries), after = symbolMap(d.entries.map(x => (newCode.has(x.id) ? { ...x, code: newCode.get(x.id)! } : x)))
      const series = new Set(list.map(x => before.get(x.id)).filter(Boolean) as string[])   // các ký hiệu của chính dãy này
      const ups: Promise<unknown>[] = []
      for (const x of list) {
        const lines = (x.product_code ?? '').split('\n'), nw = after.get(x.id)
        if (!nw || !lines.some(l => series.has(l.trim()))) continue
        const next = lines.map(l => (series.has(l.trim()) ? nw : l)).filter((l, i, a) => a.indexOf(l) === i).join('\n')
        if (next !== (x.product_code ?? '')) ups.push(saveEntry(x, { product_code: next }) as Promise<unknown>)
      }
      await Promise.all(ups)
    } catch { /* không chặn việc đổi thứ tự */ }
    d.reload()
  }
  /** Kéo ảnh phối cảnh từ một vật liệu sang vật liệu khác (giữ Ctrl/Alt để sao chép thay vì chuyển) */
  /** Kéo cả một phòng (vị trí + mọi hình khoanh của mã trong phòng đó) sang vật liệu khác; các bảng khác đọc cùng dữ liệu nên tự đồng bộ */
  const moveRoomTo = async (srcId: string, roomId: string, target: Entry, copy: boolean) => {
    if (srcId === target.id) return
    const rm = d.rooms.find(r => r.id === roomId), src = d.entries.find(x => x.id === srcId)
    try {
      const rec = await moveRoom(d.occ, srcId, roomId, target, copy)
      toast(`${copy ? 'Đã sao chép' : 'Đã chuyển'} phòng ${rm?.code ?? ''} ${rm?.name_vn ?? ''} từ ${src?.code ?? ''} sang ${target.code}`, 'ok', { label: '↶ Hoàn tác', run: async () => { await undoMove(rec); toast('Đã hoàn tác', 'ok'); d.reload() } })
    } catch (er) { alert((er as Error).message) }
    d.reload()
  }
  const moveShot = async (occId: string, target: Entry, copy: boolean, onlyOne = false) => {
    const o = d.occ.find(x => x.id === occId)
    if (!o || o.entry_id === target.id) return
    if (o.room_id && !onlyOne) return moveRoomTo(o.entry_id, o.room_id, target, copy)   // mặc định kéo ảnh = kéo cả phòng đó (giữ Shift = chỉ riêng hình này)
    const cat = d.occ.find(x => x.entry_id === target.id)?.category ?? target.category ?? o.category ?? 'decor'
    if (copy) {
      const { error } = await supabase.from('occurrences').insert({ entry_id: target.id, room_id: o.room_id, page_id: o.page_id, bbox: o.bbox, view: o.view, qty: null, confidence: o.confidence, category: cat, origin: 'manual' })
      if (error) { alert(error.message); return }
    } else {
      const { error } = await supabase.from('occurrences').update({ entry_id: target.id, category: cat, origin: 'manual' }).eq('id', occId)
      if (error) { alert(error.message); return }
      // mã cũ không còn ảnh nào trong phòng này → vẫn giữ vị trí phòng (xoá bằng ✕ ở cột Vị trí nếu sai)
      const left = d.occ.some(x => x.id !== occId && x.entry_id === o.entry_id && x.room_id === o.room_id)
      if (!left && o.room_id) await supabase.from('occurrences').insert({ entry_id: o.entry_id, room_id: o.room_id, origin: 'manual', category: o.category })
    }
    toast(copy ? 'Đã sao chép ảnh sang ' + target.code : 'Đã chuyển ảnh sang ' + target.code, 'ok')
    d.reload()
  }
  const [shotRoom, setShotRoom] = useState<string | null>(null)
  const [noteTxt, setNoteTxt] = useState('')
  const [scanning, setScanning] = useState<string | null>(null)
  const [shotNote, setShotNote] = useState<Occurrence | null>(null)
  const delShot = async (o: Occurrence) => {
    if (!confirm('Xoá hình phối cảnh này khỏi vật liệu?')) return
    const sameRoom = d.occ.filter(x => x.entry_id === o.entry_id && x.room_id === o.room_id)
    // hình cuối cùng của phòng: giữ lại vị trí phòng, chỉ bỏ ảnh
    if (sameRoom.length <= 1) await supabase.from('occurrences').update({ page_id: null, bbox: null, view: null }).eq('id', o.id)
    else await supabase.from('occurrences').delete().eq('id', o.id)
    d.reload()
  }
  const addLoc = async (e: Entry, roomId: string) => {
    if (!roomId) return
    const cat = d.occ.find(o => o.entry_id === e.id)?.category ?? e.category ?? 'decor'
    const { error } = await supabase.from('occurrences').insert({ entry_id: e.id, room_id: roomId, category: cat, origin: 'manual' })
    if (error) { alert(error.message); return }
    await d.reload()
    const room = d.rooms.find(r => r.id === roomId)
    if (!room || !d.project) return
    const hasPages = d.pages.some(p => p.room_id === roomId && (p.kind === 'render' || p.kind === 'plan'))
    if (!hasPages) { toast(`Đã thêm ${room.code}. Phòng này chưa có trang phối cảnh nên chưa có ảnh – bấm “＋ ảnh” khi có.`); return }
    if (!isAdmin) { toast(`Đã thêm vị trí ${room.code}. Bấm “＋ ảnh” để khoanh hình tay (chỉ quản trị viên mới chạy được AI rà phòng).`); return }
    if (!confirm(`Đã thêm vị trí ${room.code} ${room.name_vn}.\n\nĐể AI rà lại phòng này, tìm vật liệu và tự khoanh mũi tên? (dùng lượt AI, mất vài chục giây; mã và thông tin đã sửa tay được giữ nguyên, có thể xuất hiện thêm mã mới ở trạng thái “Chờ duyệt”)\n\nBấm Huỷ = chỉ thêm vị trí, tự khoanh ảnh sau.`)) { setShotFor(e); return }
    setScanning(room.code)
    try {
      await analyzeRoom(d.project, room, () => {})
      // bỏ dòng vị trí thủ công (chưa có ảnh) nếu AI đã tìm được vật liệu này trong phòng
      const { data: oc } = await supabase.from('occurrences').select('*').eq('entry_id', e.id).eq('room_id', roomId)
      const rows = (oc ?? []) as Occurrence[]
      if (rows.some(o => o.bbox)) { const dead = rows.filter(o => !o.bbox && !o.page_id).map(o => o.id); if (dead.length) await supabase.from('occurrences').delete().in('id', dead); toast(`AI đã tìm thấy vật liệu trong ${room.code} và khoanh mũi tên.`, 'ok') }
      else { toast(`AI không thấy vật liệu này trong ${room.code}. Hãy khoanh tay bằng “＋ ảnh”.`); setShotRoom(roomId); setShotFor(e) }
    } catch (er) { toast('Rà phòng lỗi: ' + String(er)); setShotRoom(roomId); setShotFor(e) }
    setScanning(null); d.reload()
  }
  /** Rà lần lượt các phòng chưa có ảnh của vật liệu này bằng AI (mỗi phòng 1 lượt phân tích) */
  /** AI an toàn: chỉ bổ sung ảnh khoanh còn thiếu vào vị trí đã có – không tạo mới, không đổi/xoá gì (có sao lưu trước) */
  const scanMissing = async (e: Entry, roomIds: string[]) => {
    if (!d.project) return
    const n = missingPairs(d, { entryIds: [e.id], roomIds }).length
    if (!n) { toast('Không có phòng nào đủ điều kiện (cần có trang phối cảnh).'); return }
    if (!confirm(`AI sẽ nhìn phối cảnh của ${n} phòng để tìm ${e.name_vn} và bổ sung ảnh khoanh.\n• Chỉ thêm ảnh vào vị trí ĐÃ CÓ; không tạo mã/vị trí mới, không đổi hay xoá gì.\n• Không chắc thì bỏ qua.\n• Tự sao lưu trước khi chạy.`)) return
    setScanning(e.code)
    try {
      const rep = await locateMissingShots(d, { entryIds: [e.id], roomIds }, () => {})
      toast(`Đã bổ sung ${rep.updated.length}/${n} ảnh khoanh.${rep.updated.length < n ? ' Phần còn lại AI không thấy/không chắc – khoanh tay nếu cần.' : ''}`, rep.updated.length ? 'ok' : undefined)
    } catch (er) { toast(String((er as Error).message ?? er)) }
    setScanning(null)
  }
  /** Ghi chú cho hình: vd “Phối cảnh gốc: thảm – đã đổi sang sàn vinyl” (hình giữ nguyên, người xem hiểu ngữ cảnh) */
  const setNote = async (o: Occurrence, text: string | null) => {
    const { error } = await supabase.from('occurrences').update({ note: text || null, origin: 'manual' }).eq('id', o.id)
    if (error) alert(error.message); else d.reload()
  }
  /** Phòng thật = bỏ các dòng giả “Tất cả các khu vực…” */
  const realRooms = () => d.rooms.filter(r => !/^\s*tất cả/i.test(r.name_vn ?? ''))
  /** Gắn vật liệu vào MỌI phòng (vd sơn trắng): tạo vị trí cho từng phòng chưa có → đồng bộ với bảng tổng hợp, xuất file… */
  const addAllLoc = async (e: Entry) => {
    const have = new Set(d.occ.filter(o => o.entry_id === e.id).map(o => o.room_id))
    const todo = realRooms().filter(r => !have.has(r.id))
    if (!todo.length) return
    if (!confirm(`Gắn ${symOf(d.entries, e)} ${e.name_vn} vào ${todo.length} phòng còn lại (tất cả ${realRooms().length} phòng của dự án)?\nPhòng thêm sau này cần gắn lại bằng cách chọn “Tất cả các phòng” lần nữa.`)) return
    const cat = d.occ.find(o => o.entry_id === e.id)?.category ?? e.category ?? 'decor'
    const { error } = await supabase.from('occurrences').insert(todo.map(r => ({ entry_id: e.id, room_id: r.id, category: cat, origin: 'manual' })))
    if (error) { alert(error.message); return }
    toast(`Đã gắn vào ${todo.length} phòng.`, 'ok'); d.reload()
  }
  const delAllLoc = async (e: Entry) => {
    const ids = realRooms().map(r => r.id)
    if (!confirm(`Bỏ ${symOf(d.entries, e)} ${e.name_vn} khỏi tất cả ${ids.length} phòng? (hình phối cảnh của các phòng cũng bị bỏ)`)) return
    await supabase.from('occurrences').delete().eq('entry_id', e.id).in('room_id', ids); d.reload()
  }
  const delLoc = async (e: Entry, r: Room) => {
    if (!confirm(`Bỏ ${symOf(d.entries, e)} ${e.name_vn} khỏi phòng ${r.code} ${r.name_vn}? (hình phối cảnh của phòng này cũng bị bỏ)`)) return
    await supabase.from('occurrences').delete().eq('entry_id', e.id).eq('room_id', r.id); d.reload()
  }
  /** Đổi hạng mục = chuyển sang tab (nhóm vật liệu) khác: đổi nhóm mã + đánh lại mã → tự sang tab mới. Danh sách lấy từ chính các tab nên luôn khớp (kể cả tên đã đổi). */
  const SEC_CAT: Record<string, string> = { floor: 'floor', skirting: 'base', ceiling: 'ceiling', door: 'door', curtain: 'window', joinery: 'joinery', loose: 'loose', lighting: 'lighting', sanitary: 'sanitary', equipment: 'equipment', decor: 'decor', art: 'artwork', sign: 'signage', mep: 'mep' }
  const setSection = async (e: Entry, os: Occurrence[], key: string) => {
    const sec = allSections().find(x => x.key === key); if (!sec || sectionOf(e).key === key) return
    const cur = os[0]?.category ?? e.category ?? 'decor'
    const category = SEC_CAT[key] ?? (key === 'wood' && cur === 'floor' ? 'joinery' : cur)
    if (os.length && category !== cur) await supabase.from('occurrences').update({ category }).in('id', os.map(o => o.id))
    const patch: Record<string, unknown> = { category, section_key: sec.custom ? sec.key : null }
    if (!sec.groups.includes(e.group_code)) {
      const g = sec.groups[0]
      const max = d.entries.filter(x => x.group_code === g).reduce((m, x) => Math.max(m, parseInt(x.code.split('-').pop() ?? '0', 10) || 0), 0)
      patch.group_code = g; patch.code = `${g}-${String(max + 1).padStart(2, '0')}`
    }
    const { error } = await supabase.from('entries').update(patch).eq('id', e.id)
    if (error) alert(error.message)
    d.reload()
  }
  let lastBand = '', n = 0
  if (!secs.length) return <div className="muted small" style={{ padding: 12 }}>Chưa có hạng mục nào{filter !== 'all' ? ' khớp bộ lọc' : ''}.</div>
  return (
    <div className="sec-wrap">
      {qm && <QuickMergeDialog d={d} src={qm.src} tgt={qm.tgt} onClose={() => setQm(null)} />}
      {pickSrc && <MergePicker d={d} src={pickSrc} symMap={symMap} onClose={() => setPickSrc(null)} onPick={tgt => { setQm({ src: pickSrc, tgt }); setPickSrc(null) }} />}
      {sugE && <SuggestDialog d={d} entry={sugE} occId={focusOcc && d.occ.find(x => x.id === focusOcc)?.entry_id === sugE.id ? focusOcc : undefined} onClose={() => setSugE(null)} />}
      {secs.map(({ section, items }) => {
        const bandRow = section.band !== lastBand ? section.band : null; lastBand = section.band
        return (
          <div key={section.key}>
            {bandRow && <div className={'band band-' + bandRow}>{bandTitle(bandRow, lang)}</div>}
            <div className="sec-title">{sectionTitle(section, lang)} <span className="cnt">{items.length}</span>{(() => { const n = items.filter(e => missingOf(e, lang).length).length; return n ? <span className="cnt miss-cnt" title="Số dòng còn thiếu thông tin">⚠ {n} dòng thiếu</span> : <span className="cnt ok-cnt">✓ đủ thông tin</span> })()}
              {canEdit && <button className="btn sm add-sib" style={{ marginLeft: 'auto' }} title="Thêm vật liệu khác vào mục này (vd màu sơn thứ 2)" onClick={() => { const f = items[0]; onAdd({ section_key: f.section_key, group: f.group_code, category: f.category ?? 'decor', name: f.name_vn, part_vn: f.part_vn, parent_id: f.parent_id, hint: `Thêm vật liệu nhận diện thiếu trong mục “${sectionTitle(section, lang)}”.` }) }}>＋ Thêm vật liệu</button>}</div>
            <table className="sec-table">
              <thead><tr>{[...HEAD[lang], ''].map((t, i) => <th key={i} style={{ width: cw ? cw[i] + '%' : (i < 10 ? HW[i] : '10.5%') }}>{t}{i < 10 && <span className="col-rs" title="Kéo để đổi độ rộng cột (bấm đúp = về mặc định)" onMouseDown={ev => startResize(ev, i)} onDoubleClick={() => setCw(null)} onClick={ev => ev.stopPropagation()} />}</th>)}</tr></thead>
              <tbody>{items.map(e => {
                const os = occ.filter(o => o.entry_id === e.id)
                const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
                // Mỗi phòng trong “Vị trí” = 1 ảnh tương ứng (ảnh tốt nhất); ảnh có ghi chú (vd vật liệu cũ đã thay) luôn được giữ thêm
                const withImg = os.filter(o => o.bbox && (o.page_id || o.view?.img))
                const best1 = new Map<string, Occurrence>()
                for (const o of withImg) { const k = o.room_id ?? o.id; const c = best1.get(k); if (!c || (!!o.note && !c.note) || (!!o.note === !!c.note && (o.confidence ?? 0) > (c.confidence ?? 0))) best1.set(k, o) }
                const fo = focusOcc ? withImg.find(o => o.id === focusOcc) : undefined
                if (fo) best1.set(fo.room_id ?? fo.id, fo)
                const shots: Occurrence[] = [...locs.map(l => best1.get(l.room.id)).filter(Boolean) as Occurrence[], ...withImg.filter(o => !o.room_id)]
                for (const o of withImg) if (o.note && !shots.includes(o)) shots.push(o)
                if (fo) { const i = shots.indexOf(fo); if (i > 0) { shots.splice(i, 1); shots.unshift(fo) } }
                // Bảng ngoài chỉ để 3 ảnh đại diện (ảnh có ghi chú → độ tin cậy cao trước); đủ ảnh xem ở khung chi tiết khi bấm vào dòng
                const shown = [...shots].sort((a, b) => (b.note ? 1 : 0) - (a.note ? 1 : 0) || (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 3)
                const missRooms = locs.filter(l => !shots.some(o => o.room_id === l.room.id))
                const cat = os[0]?.category ?? e.category ?? 'decor'
                const ms = missingOf(e, lang), mk = new Set<string>(ms.map(m => String(m.key)))
                const M = (k: K) => mk.has(String(k))
                n++
                return (
                  <tr key={e.id} data-eid={e.id} data-code={e.code} onDragOver={ev => { if (canEdit && ev.dataTransfer.types.includes('text/dmvl-ent')) { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(), after = ev.clientY > r.top + r.height / 2; if (entDrop?.id !== e.id || entDrop.after !== after) setEntDrop({ id: e.id, after }); return } if (canEdit && (ev.dataTransfer.types.includes('text/dmvl-occ') || ev.dataTransfer.types.includes('text/dmvl-room'))) { ev.preventDefault(); ev.dataTransfer.dropEffect = ev.ctrlKey || ev.altKey ? 'copy' : 'move'; if (dropId !== e.id) setDropId(e.id) } }} onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) { setDropId(x => (x === e.id ? null : x)); setEntDrop(x => (x?.id === e.id ? null : x)) } }} onDrop={ev => { const eid = ev.dataTransfer.getData('text/dmvl-ent'); if (eid) { ev.preventDefault(); const dr = entDrop; setEntDrop(null); const src = d.entries.find(x => x.id === eid); if (src) reorder(src, e, !!dr?.after); return } const rr = ev.dataTransfer.getData('text/dmvl-room'); if (rr) { ev.preventDefault(); setDropId(null); const [sid, rid] = rr.split('|'); moveRoomTo(sid, rid, e, ev.ctrlKey || ev.altKey); return } const id = ev.dataTransfer.getData('text/dmvl-occ'); setDropId(null); if (id) { ev.preventDefault(); moveShot(id, e, ev.ctrlKey || ev.altKey, ev.shiftKey) } }} className={(dropId === e.id ? 'drop-ok ' : '') + (entDrop?.id === e.id ? (entDrop.after ? 'ent-after ' : 'ent-before ') : '') + (ms.length ? 'has-miss ' : '') + 'st-' + e.status + (e.id === sel ? ' sel' : '') + ' src-row-' + e.source} onClick={() => os[0] && onPick(os[0])}>
                    <td className="c-stt">{n}{canEdit && <div className="ent-mv"><span className="ent-grip" draggable title="Kéo lên/xuống để đổi thứ tự (ký hiệu CT-01, CT-02… tự đánh lại)" onClick={ev => ev.stopPropagation()} onDragStart={ev => { ev.dataTransfer.setData('text/dmvl-ent', e.id); ev.dataTransfer.effectAllowed = 'move'; const tr = ev.currentTarget.closest('tr'); if (tr) ev.dataTransfer.setDragImage(tr, 20, 20) }} onDragEnd={() => setEntDrop(null)}>⠿</span>
                      <a title="Lên một vị trí" onClick={ev => { ev.stopPropagation(); const p = items.slice(0, items.indexOf(e)).reverse().find(x => x.group_code === e.group_code); if (p) reorder(e, p, false) }}>▲</a><a title="Xuống một vị trí" onClick={ev => { ev.stopPropagation(); const q = items.slice(items.indexOf(e) + 1).find(x => x.group_code === e.group_code); if (q) reorder(e, q, true) }}>▼</a></div>}</td>
                    <td className="c-code">{symEdit?.id === e.id ? <input autoFocus className="sym-in" value={symEdit.v} placeholder="Gõ ký hiệu VL đích, vd WP-03" onClick={x => x.stopPropagation()} onChange={x => setSymEdit({ id: e.id, v: x.target.value })} onBlur={() => setSymEdit(null)} onKeyDown={x => { if (x.key === 'Enter') { x.preventDefault(); startMerge(e, symEdit.v) } if (x.key === 'Escape') setSymEdit(null) }} onPaste={x => { x.stopPropagation() }} /> : <b onDoubleClick={canEdit ? ev => { ev.stopPropagation(); setSymEdit({ id: e.id, v: '' }) } : undefined} data-tip="Bấm đúp để gộp nhanh vào vật liệu khác" style={canEdit ? { cursor: 'text' } : undefined} className={e.spec_stale && kindOfGroup(e.group_code) !== e.spec_stale ? 'miss-txt' : undefined} title={e.spec_stale && kindOfGroup(e.group_code) !== e.spec_stale ? (e.spec_stale === 'incomplete' ? 'Cấu tạo chưa tích đủ nên chưa phân loại được – hãy bổ sung' : 'Đã đổi sang ' + (KIND_VN[e.spec_stale] ?? e.spec_stale) + ' – ký hiệu bản vẽ cũ không còn đúng, hãy đổi nhóm mã') : canEdit ? 'Bấm đúp để gộp nhanh vật liệu này vào vật liệu khác' : undefined}>{symbolOf(e, lang, legacy, symMap)}</b>}{e.spec_stale && <div><span className="miss-badge" title="Vật liệu đã đổi loại: ký hiệu bản vẽ + thông số kỹ thuật cũ có thể sai. Sửa xong bấm để tắt cảnh báo.">{e.spec_stale === 'incomplete' ? '⚠ chưa đủ cấu tạo' : '⚠ đổi sang ' + (KIND_VN[e.spec_stale] ?? e.spec_stale)}{canEdit && <a style={{ marginLeft: 6, cursor: 'pointer', textDecoration: 'underline' }} onClick={async () => { await saveEntry(e, { spec_stale: null }); d.reload() }}>đã xem lại</a>}</span></div>}{canEdit && <div><GroupPicker compact value={e.group_code} onPick={async g => { const err = await changeGroup(e, g, d.entries); if (err) alert(err.message); else d.reload() }} /></div>}{ms.length > 0 && <div><span className="miss-badge" title={'Còn thiếu: ' + missText(ms) + (ms.every(m => String(m.key).endsWith('_en')) ? ' — tiếng Việt đã đủ, chỉ chưa có bản tiếng Anh (chuyển sang “Tiếng Việt” để ẩn cảnh báo này)' : '')}>{ms.every(m => String(m.key).endsWith('_en')) ? '⚠ chưa có tiếng Anh' : `⚠ thiếu ${new Set(ms.map(m => m.label)).size}`}</span></div>}{e.link_id && <div><span className="link-badge" title={'Liên kết đồng bộ với: ' + (linkedWith(e, d.entries).map(x => x.code).join(', ') || '—')}>🔗 {linkedWith(e, d.entries).map(x => x.code).join(', ')}</span></div>}<div><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></div></td>
                    <td className="c-vl"><CodeList e={e} miss={M('product_code')} sym={symbolOf(e, lang, legacy, symMap)} /></td>
                    <td><select value={sectionOf(e).key} disabled={!canEdit} onClick={x => x.stopPropagation()} onChange={x => setSection(e, os, x.target.value)}>{bandKeys().map(b => <optgroup key={b} label={bandTitle(b, lang)}>{allSections().filter(x => x.band === b).map(x => <option key={x.key} value={x.key}>{sectionTitle(x, lang)}</option>)}</optgroup>)}</select>
                      {shortBi(e, 'part', 24, lang) ? <div className="ed-line bi"><Ed e={e} k="part_vn" ph="Bộ phận áp dụng" /><span className="bi-sl">/</span><Ed e={e} k="part_en" ph="Part (EN)" /></div> : pair('part', lang).map(k => <div key={String(k)} className={'ed-line' + (String(k).endsWith('_en') ? ' en' : '')}>{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} ph="Bộ phận áp dụng" /></div>)}</td>
                    <td className={'c-loc' + (locs.length > 10 ? ' many' : '')}><div className="loc-flow">{(() => { const real = realRooms(); const all = real.length > 1 && real.every(r => locs.some(l => l.room.id === r.id)); return all ? <span className="loc-tag all" title={`Áp dụng cho ${real.length} phòng`}>★ Tất cả các phòng{canEdit && <a className="loc-x" title="Bỏ khỏi tất cả các phòng" onClick={ev => { ev.stopPropagation(); delAllLoc(e) }}>✕</a>}</span> : null })()}{locs.filter(() => { const real = realRooms(); return !(real.length > 1 && real.every(r => locs.some(l => l.room.id === r.id))) }).map(l => <span key={l.room.id} className={'loc-tag' + (l.room.id === room?.id ? ' here' : '') + (canEdit ? ' drag' : '')} draggable={canEdit} title={canEdit ? 'Kéo thả sang vật liệu khác để chuyển CẢ phòng này (vị trí + hình phối cảnh). Giữ Ctrl để sao chép.' : undefined} onDragStart={ev => { ev.dataTransfer.setData('text/dmvl-room', e.id + '|' + l.room.id); ev.dataTransfer.effectAllowed = 'copyMove' }} onDragEnd={() => setDropId(null)}>{roomName(l.room, lang)}{canEdit && <a className="loc-x" title="Bỏ vị trí này" onClick={ev => { ev.stopPropagation(); delLoc(e, l.room) }}>✕</a>}</span>)}
                      </div>{canEdit && locs.length > 0 && <select className="loc-add" value="" onClick={x => x.stopPropagation()} onChange={x => { const r = d.rooms.find(z => z.id === x.target.value); if (!r) return; const add = (cur: string | null | undefined, t: string, w: string) => (cur?.trim() ? cur.trim().replace(/\.$/, '') + '; ' : w + ' ') + t; saveEntry(e, { loc_note_vn: add(e.loc_note_vn, r.name_vn, 'Trừ:'), loc_note_en: add(e.loc_note_en, r.name_en || r.name_vn, 'Except:') }).then(er => er && alert(er.message)) }}><option value="">⊘ ghi chú: trừ phòng…</option>{d.rooms.map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select>}{canEdit && <select className="loc-add" value="" onClick={x => x.stopPropagation()} onChange={x => x.target.value === '__all' ? addAllLoc(e) : addLoc(e, x.target.value)}><option value="">＋ thêm phòng…</option>{realRooms().some(r => !locs.some(l => l.room.id === r.id)) && <option value="__all">★ Tất cả các phòng ({realRooms().length})</option>}{d.rooms.filter(r => !locs.some(l => l.room.id === r.id)).map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select>}{(canEdit || e.loc_note_vn || e.loc_note_en) && <div className="loc-note">{lang !== 'en' && <div className="ed-line"><Ed e={e} k="loc_note_vn" ph="Ghi chú vị trí (vd. trừ WC, chỉ khu lưu trú…)" /></div>}{lang !== 'vn' && <div className="ed-line en"><Ed e={e} k="loc_note_en" ph="Location note (EN)" /></div>}</div>}</td>
                    <td className="c-img">{shown.length ? shown.map(o => <span key={o.id} className="shot-wrap" draggable={canEdit} title={canEdit ? 'Kéo thả sang vật liệu khác để chuyển ảnh của phòng này (cả vị trí phòng). Giữ Ctrl = sao chép; giữ Shift = chỉ riêng hình này' : undefined} onDragStart={ev => { ev.dataTransfer.setData('text/dmvl-occ', o.id); ev.dataTransfer.effectAllowed = 'copyMove' }} onDragEnd={() => setDropId(null)}><OccCrop d={d} o={o} height={64} maxWidth={90} /><div className="shot-cap" title={o.note ?? ''} onClick={ev => { ev.stopPropagation(); if (canEdit) { setNoteTxt(o.note ?? ''); setShotNote(o) } }}>{o.room_id ? d.rooms.find(r => r.id === o.room_id)?.code : ''}{o.note ? ' · ' + o.note : canEdit ? ' ✎' : ''}</div>{canEdit && <a className="shot-x" title="Xoá hình này" onClick={ev => { ev.stopPropagation(); delShot(o) }}>✕</a>}</span>)
                      : null}
                    {(shots.length > shown.length || missRooms.length > 0) && <div className="small muted" style={{ cursor: 'pointer' }} title="Bấm vào dòng để xem đủ ảnh các phòng">＋ {shots.length > shown.length ? `${shots.length - shown.length} ảnh khác` : ''}{shots.length > shown.length && missRooms.length ? ' · ' : ''}{missRooms.length ? `${missRooms.length} phòng chưa khoanh` : ''} – bấm để xem đủ</div>}
                    {!shots.length && <div className="ic-none tiny" style={canEdit ? { cursor: 'pointer' } : undefined} title={canEdit ? 'Bấm để chọn ảnh phòng (theo tầng) và khoanh vật liệu' : undefined} onClick={canEdit ? ev => { ev.stopPropagation(); setShotRoom(null); setShotFor(e) } : undefined}><span>{e.source === 'inferred' ? 'Suy luận' : 'Chưa có ảnh'}{canEdit ? ' – bấm để chọn' : ''}</span></div>}
                    {isAdmin && locs.some(l => !shots.some(o => o.room_id === l.room.id) && d.pages.some(p => p.room_id === l.room.id && p.kind === 'render')) && <div><button className="btn ghost sm" title="AI chỉ bổ sung ảnh khoanh còn thiếu (an toàn: không tạo mới, không đổi dữ liệu)" onClick={ev => { ev.stopPropagation(); scanMissing(e, locs.filter(l => !shots.some(o => o.room_id === l.room.id)).map(l => l.room.id)) }}>🔍 AI khoanh {locs.filter(l => !shots.some(o => o.room_id === l.room.id)).length} phòng còn thiếu</button></div>}
                      {canEdit && <button className="btn ghost sm" title="Thêm hình phối cảnh" onClick={ev => { ev.stopPropagation(); setShotRoom(null); setShotFor(e) }}>＋ ảnh</button>}</td>
                    <td>{shortBi(e, 'name', 30, lang) && <div className="ed-line bi"><Ed e={e} k="name_vn" miss={M('name_vn' as any)} ph="Tên hạng mục" /><span className="bi-sl">/</span><Ed e={e} k="name_en" miss={M('name_en' as any)} ph="Item name (English)" /></div>}{[...(shortBi(e, 'name', 30, lang) ? [] : pair('name', lang)), ...pair('material', lang), ...pair('desc', lang)].map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} miss={M(k) || (!!e.spec_stale && String(k).startsWith('desc'))} area={!String(k).startsWith('name')} ph={String(k).endsWith('_en') ? (String(k).startsWith('name') ? 'Item name (English – not translated yet)' : String(k).startsWith('material') ? 'Material / colour / finish' : 'Specification') : String(k).startsWith('name') ? 'Tên hạng mục' : String(k).startsWith('material') ? 'Vật liệu / màu / bề mặt' : 'Thông số kỹ thuật'} /></div>)}
                      <div className="ed-line lab"><i>{lang === 'en' ? 'Composition' : 'Cấu tạo'}</i><Ed e={e} k="composition" miss={!!e.spec_stale} area ph={lang === 'en' ? 'Composition' : 'Cấu tạo (vật liệu thành phần)'} /></div>
                      {!isFinish(e) && (() => {
                        const fr = refsOf(e, fctx), fi = finishIssues(e, fctx), fl = finishLines(e, d.entries, x => symMap.get(x.id) ?? x.code)
                        if (!fr.length && !fi.length && !(canEdit && ['ceiling', 'wall', 'feature_wall', 'base', 'joinery', 'artwork'].includes(e.category ?? ''))) return null
                        return <div className="ed-line lab fin-box no-export" onClick={ev => ev.stopPropagation()}><i>🎨 {lang === 'en' ? 'Finish' : 'Lớp hoàn thiện'}</i>
                          <div>{fr.map(x => <span key={x.id} className="loc-tag">{symMap.get(x.id) ?? x.code}{canEdit && <a className="loc-x" title="Bỏ gắn" onClick={async () => { await saveEntry(e, { finish_refs: fr.filter(y => y.id !== x.id).map(y => y.id) }); d.reload() }}>✕</a>}</span>)}
                            {canEdit && <select className="loc-add" value="" onChange={async x => { if (!x.target.value) return; await saveEntry(e, { finish_refs: [...fr.map(y => y.id), x.target.value] }); d.reload() }}><option value="">＋ gắn mã sơn…</option>{fctx.paint.filter(y => !fr.some(z => z.id === y.id)).map(y => <option key={y.id} value={y.id}>{symMap.get(y.id) ?? y.code} – {String(y.desc_vn ?? y.name_vn).replace(/^[-\s]+/, '').slice(0, 60)}</option>)}</select>}</div>
                          {fl.map((l, k) => <div key={k} className="small muted">→ {lang === 'en' ? l.en : l.vn}</div>)}
                          {fi.map((i, k) => <div key={k} className="small"><span className={'chk-tag chk-' + i.kind}>{i.kind === 'err' ? 'Lỗi' : 'Nên sửa'}</span> {i.text}{canEdit && i.fix && <button className="btn sm primary" style={{ marginLeft: 6 }} onClick={async () => { try { await applyFinishFix(e, i.fix!); d.reload() } catch (err) { toast(String((err as Error).message ?? err)) } }}>{i.fix.label}</button>}{canEdit && <button className="btn ghost sm" style={{ marginLeft: 6 }} title="Cảnh báo này không đúng – bỏ và không báo lại" onClick={async () => { try { await dismissFinish(e, i.key); d.reload() } catch (err) { toast(String((err as Error).message ?? err)) } }}>✕ Không đúng</button>}</div>)}
                        </div>
                      })()}
                      </td>
                    <td className="c-brand"><div className="ed-pre"><b>{lang === 'en' ? 'Origin' : 'Xuất xứ'}:</b><Ed e={e} k="origin" ph="Xuất xứ" /></div><div className="ed-pre"><b>{lang === 'en' ? 'Brand' : 'Thương hiệu'}:</b><Ed e={e} k="brand" ph="Hãng / thương hiệu" /></div></td>
                    <td className="c-mat"><MatImage d={d} e={e} />
                      <LinkCell d={d} e={e} /></td>
                    <td>{pair('note', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area ph="Ghi chú" /></div>)}<OpRuleBadge d={d} entryId={e.id} /></td>
                    <td className="c-act"><div className="act-col"><StatusDot s={e.status} />
                      {canEdit && <button className={'btn sm' + (e.status === 'approved' ? ' ok-on' : '')} onClick={ev => quick(e, 'approved', ev)}><b>✓</b> Duyệt</button>}
                      {canEdit && can('suggest') && <button className="btn sm no-export" title="Vật Liệu Đề Xuất – tìm mẫu thư viện khớp với phối cảnh (chỉ hiện trong phần mềm, không xuất file)" onClick={ev => { ev.stopPropagation(); setSugE(e) }}><b>✨</b> Đề xuất</button>}
                      <button className="btn ghost sm" title="Chi tiết / chọn mã hãng từ thư viện" onClick={ev => { ev.stopPropagation(); onDetail(e.id) }}><b>⋯</b> Chi tiết</button>
                      {canEdit && <button className="btn ghost sm" title="Chép thông số (tên, vật liệu, mô tả, hãng, xuất xứ) của mã này" onClick={ev => { ev.stopPropagation(); copySpec(e) }}><b>⧉</b> Chép</button>}
                      {canEdit && clip && clip.id !== e.id && <button className="btn ghost sm" title={`Dán thông số đã chép từ ${clip.sym} vào mã này`} onClick={ev => { ev.stopPropagation(); void pasteSpec(e) }}><b>⎘</b> Dán từ {clip.sym}</button>}
                      {canEdit && <button className="btn ghost sm" title="Gộp nhanh: chuyển toàn bộ phòng + ảnh phối cảnh của mã này sang mã khác, thông số lấy theo mã đích" onClick={ev => { ev.stopPropagation(); setPickSrc(e) }}><b>⇢</b> Gộp vào…</button>}
                      {canEdit && <button className="btn ghost sm" title="Nhân đôi vật liệu này (vd màu thứ 2) – chép nội dung, chỉ sửa vài chỗ" onClick={ev => { ev.stopPropagation(); onAdd({ copy: e.id, section_key: e.section_key, group: e.group_code, category: cat, name: e.name_vn, part_vn: e.part_vn, parent_id: e.parent_id, hint: `Thêm vật liệu cùng loại với ${e.code} – ${e.name_vn}. Sửa tên/màu cho khác đi.` }) }}><b>＋</b> Nhân đôi</button>}
                      {canEdit && <button className="btn ghost sm" title="Xoá hạng mục này" onClick={ev => { ev.stopPropagation(); del(e) }}><b>🗑</b> Xoá</button>}</div></td>
                  </tr>)
              })}</tbody>
            </table>
          </div>)
      })}
    {shotFor && <AddShot d={d} entry={shotFor} roomId={shotRoom ?? room?.id} onClose={() => { setShotFor(null); setShotRoom(null) }} />}
    {scanning && <div className="modal-bg center"><div className="modal"><span className="spinner" /> AI đang tìm ảnh khoanh cho {scanning}…</div></div>}
    {shotNote && <div className="modal-bg center" onMouseDown={() => setShotNote(null)}><div className="modal" style={{ maxWidth: 520 }} onMouseDown={ev => ev.stopPropagation()}>
      <h3 style={{ margin: 0 }}>Ghi chú cho hình phối cảnh</h3>
      <p className="small muted">Dùng khi hình gốc đang khoanh vật liệu khác (vd thảm) nhưng danh mục đã đổi sang vật liệu mới (vd sàn vinyl): hình vẫn giữ để người xem biết vị trí, chú thích sẽ hiện dưới hình và trong file xuất.</p>
      <div className="row gap" style={{ flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setNoteTxt('Vị trí vật liệu cũ trên phối cảnh – đã đổi sang vật liệu này')}>Vật liệu cũ, đã đổi sang vật liệu này</button>
        <button className="btn sm" onClick={() => setNoteTxt('Hình minh hoạ vị trí – vật liệu thực tế theo thông số bên cạnh')}>Hình minh hoạ vị trí</button>
      </div>
      <input style={{ width: '100%' }} autoFocus value={noteTxt} placeholder="vd: Phối cảnh gốc dùng thảm – đã đổi sang sàn vinyl" onChange={ev => setNoteTxt(ev.target.value)} />
      <div className="row gap" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setNote(shotNote, null).then(() => setShotNote(null))}>Xoá ghi chú</button><button className="btn primary" onClick={() => setNote(shotNote, noteTxt.trim()).then(() => setShotNote(null))}>Lưu</button></div>
    </div></div>}
    </div>
  )
}
export { BANDS }

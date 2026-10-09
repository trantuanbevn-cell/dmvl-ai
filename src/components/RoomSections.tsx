import OpRuleBadge from './OpRuleBadge'
import { syncLibrary } from '../lib/matLibrary'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import LinkCell from './LinkCell'
import { toast } from '../lib/toast'
import { saveEntry, linkedWith } from '../lib/entryLink'
import { CATEGORIES, CATEGORY_GROUPS } from '../lib/codes'
import { groupBySection, sectionOf, allSections, sectionTitle, bandTitle, legacyCodes, symbolOf, symbolMap, BANDS, bandKeys, type Lang } from '../lib/sections'
import { locationsOf } from '../lib/locations'
import type { ProjectData } from '../lib/useProject'
import type { Entry, Occurrence, Room } from '../lib/types'
import OccCrop from './OccCrop'
import AddShot from './AddShot'
import RoomShotFallback from './RoomShotFallback'
import { analyzeRoom } from '../lib/pipeline'
import MatImage from './MatImage'
import { StatusDot } from '../pages/tabs/MaterialView'
import { useAuth } from '../lib/auth'
import { missingOf, missText } from '../lib/missing'

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
  const common = { value: v, placeholder: ph, 'data-lang': dl, readOnly: !canEdit, className: miss ? 'miss' : undefined, title: miss ? 'Thiếu thông tin – cần điền' : undefined, onChange: (x: any) => setV(x.target.value), onBlur: save, onClick: (x: any) => x.stopPropagation(), style: w ? { width: w } : undefined }
  return area ? <textarea {...common} rows={Math.min(8, Math.max(2, Math.ceil(v.length / 38)))} /> : <input {...common} type={num ? 'number' : 'text'} />
}
const pair = (k: 'name' | 'material' | 'desc' | 'note' | 'perf' | 'part', lang: Lang): K[] => (lang === 'vn' ? [`${k}_vn`] : lang === 'en' ? [`${k}_en`] : [`${k}_vn`, `${k}_en`]) as K[]
const roomName = (r: Room, lang: Lang) => (lang === 'en' ? r.name_en || r.name_vn : lang === 'both' && r.name_en && r.name_en !== r.name_vn ? `${r.name_vn} / ${r.name_en}` : r.name_vn)
const flag = (k: K) => (String(k).endsWith('_en') ? 'EN' : String(k).endsWith('_vn') ? 'VN' : '')

// Cột giống bảng danh mục mẫu của công ty (tên và vị trí cột)
const HEAD: Record<Lang, string[]> = {
  vn: ['STT', 'KÍ HIỆU BẢN VẼ', 'KÍ HIỆU VL', 'Hạng mục', 'Vị trí', 'Hình ảnh phối cảnh', 'Thông số kỹ thuật', 'Xuất xứ/ Thương hiệu', 'Hình ảnh vật liệu', 'Ghi chú'],
  en: ['No.', 'DRAWING CODE', 'MATERIAL CODE', 'Item', 'Location', 'Render image', 'Specification', 'Origin / Brand', 'Material image', 'Remarks'],
  both: ['STT / No.', 'KÍ HIỆU BẢN VẼ / DRAWING CODE', 'KÍ HIỆU VL / MATERIAL CODE', 'Hạng mục / Item', 'Vị trí / Location', 'Hình ảnh phối cảnh / Render', 'Thông số kỹ thuật / Specification', 'Xuất xứ/ Thương hiệu / Origin / Brand', 'Hình ảnh vật liệu / Material image', 'Ghi chú / Remarks'],
}
const HW: (number | string)[] = [38, 84, 112, 116, '11%', 104, '24%', '12%', 112, '13%']
export default function RoomSections({ d, room, lang, filter, sel, onPick, onDetail, onRemove, onAdd, only }: {
  only?: string; d: ProjectData; room: Room | null; lang: Lang; filter: 'all' | 'pending' | 'inferred' | 'missing'; sel: string | null
  onPick: (o: Occurrence) => void; onDetail: (id: string) => void; onRemove: (o: Occurrence) => void
  onAdd: (p: { section_key?: string | null; copy?: string; group: string; category: string; name: string; part_vn?: string | null; parent_id?: string | null; hint?: string }) => void
}) {
  const { canEdit } = useAuth()
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const legacy = useMemo(() => legacyCodes(d.entries), [d.entries])
  const symMap = useMemo(() => symbolMap(d.entries), [d.entries])
  const occ = room ? d.occ.filter(o => o.room_id === room.id) : d.occ
  const ids = [...new Set(occ.map(o => o.entry_id))]
  let ents = d.entries.filter(e => (room ? ids.includes(e.id) : true) && e.status !== 'rejected')
  if (only) ents = ents.filter(e => sectionOf(e).key === only)
  if (filter === 'pending') ents = ents.filter(e => e.status === 'pending' || e.status === 'review')
  if (filter === 'inferred') ents = ents.filter(e => e.source === 'inferred')
  if (filter === 'missing') ents = ents.filter(e => missingOf(e, lang).length)
  const secs = groupBySection(ents)
  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); if (status === 'approved') syncLibrary(e.project_id, [{ ...e, status }]); d.reload() }
  /** Xoá hạng mục: nếu mã còn dùng ở phòng khác thì chỉ bỏ khỏi phòng này, ngược lại xoá hẳn mã */
  const del = async (e: Entry) => {
    const others = room ? [...new Set(d.occ.filter(o => o.entry_id === e.id && o.room_id && o.room_id !== room.id).map(o => o.room_id!))] : []
    if (room && others.length) {
      if (!confirm(`${e.code} ${e.name_vn} còn dùng ở ${others.length} phòng khác → chỉ bỏ khỏi phòng ${room.code}. Tiếp tục?`)) return
      await supabase.from('occurrences').delete().eq('entry_id', e.id).eq('room_id', room.id)
    } else {
      if (!confirm(`Xoá hẳn ${e.code} ${e.name_vn}? Không hoàn tác được.`)) return
      await supabase.from('entries').update({ parent_id: null }).eq('parent_id', e.id)
      await supabase.from('occurrences').delete().eq('entry_id', e.id)
      const { error } = await supabase.from('entries').delete().eq('id', e.id)
      if (error) { alert(error.message); return }
    }
    d.reload()
  }
  const [shotFor, setShotFor] = useState<Entry | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  /** Kéo ảnh phối cảnh từ một vật liệu sang vật liệu khác (giữ Ctrl/Alt để sao chép thay vì chuyển) */
  const moveShot = async (occId: string, target: Entry, copy: boolean) => {
    const o = d.occ.find(x => x.id === occId)
    if (!o || o.entry_id === target.id) return
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
  const scanMissing = async (e: Entry, roomIds: string[]) => {
    if (!d.project) return
    const rooms = roomIds.map(id => d.rooms.find(r => r.id === id)).filter((r): r is Room => !!r && d.pages.some(p => p.room_id === r.id && p.kind === 'render'))
    if (!rooms.length) return
    if (!confirm(`AI sẽ rà lần lượt ${rooms.length} phòng (${rooms.map(r => r.code).join(', ')}) để tìm ${e.name_vn} và khoanh mũi tên. Mỗi phòng mất vài chục giây và dùng lượt AI; thông tin đã sửa tay giữ nguyên, có thể xuất hiện thêm mã mới ở trạng thái “Chờ duyệt”. Tiếp tục?`)) return
    let found = 0
    for (const [i, room] of rooms.entries()) {
      setScanning(`${room.code} (${i + 1}/${rooms.length})`)
      try {
        await analyzeRoom(d.project, room, () => {})
        const { data: oc } = await supabase.from('occurrences').select('*').eq('entry_id', e.id).eq('room_id', room.id)
        const rows = (oc ?? []) as Occurrence[]
        if (rows.some(o => o.bbox)) { found++; const dead = rows.filter(o => !o.bbox && !o.page_id).map(o => o.id); if (dead.length) await supabase.from('occurrences').delete().in('id', dead) }
      } catch (er) { toast(`${room.code}: ${String(er)}`) }
    }
    setScanning(null); await d.reload()
    toast(`Xong: khoanh được ${found}/${rooms.length} phòng.${found < rooms.length ? ' Phòng còn lại AI không thấy vật liệu – bấm vào ảnh phòng để khoanh tay.' : ''}`, found ? 'ok' : undefined)
  }
  /** Ghi chú cho hình: vd “Phối cảnh gốc: thảm – đã đổi sang sàn vinyl” (hình giữ nguyên, người xem hiểu ngữ cảnh) */
  const setNote = async (o: Occurrence, text: string | null) => {
    const { error } = await supabase.from('occurrences').update({ note: text || null, origin: 'manual' }).eq('id', o.id)
    if (error) alert(error.message); else d.reload()
  }
  const delLoc = async (e: Entry, r: Room) => {
    if (!confirm(`Bỏ ${e.code} ${e.name_vn} khỏi phòng ${r.code} ${r.name_vn}? (hình phối cảnh của phòng này cũng bị bỏ)`)) return
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
      {secs.map(({ section, items }) => {
        const bandRow = section.band !== lastBand ? section.band : null; lastBand = section.band
        return (
          <div key={section.key}>
            {bandRow && <div className={'band band-' + bandRow}>{bandTitle(bandRow, lang)}</div>}
            <div className="sec-title">{sectionTitle(section, lang)} <span className="cnt">{items.length}</span>{(() => { const n = items.filter(e => missingOf(e, lang).length).length; return n ? <span className="cnt miss-cnt" title="Số dòng còn thiếu thông tin">⚠ {n} dòng thiếu</span> : <span className="cnt ok-cnt">✓ đủ thông tin</span> })()}
              {canEdit && <button className="btn sm add-sib" style={{ marginLeft: 'auto' }} title="Thêm vật liệu khác vào mục này (vd màu sơn thứ 2)" onClick={() => { const f = items[0]; onAdd({ section_key: f.section_key, group: f.group_code, category: f.category ?? 'decor', name: f.name_vn, part_vn: f.part_vn, parent_id: f.parent_id, hint: `Thêm vật liệu nhận diện thiếu trong mục “${sectionTitle(section, lang)}”.` }) }}>＋ Thêm vật liệu</button>}</div>
            <table className="sec-table">
              <thead><tr>{HEAD[lang].map((t, i) => <th key={i} style={{ width: HW[i] }}>{t}</th>)}<th style={{ width: 112 }} /></tr></thead>
              <tbody>{items.map(e => {
                const os = occ.filter(o => o.entry_id === e.id)
                const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
                // Mỗi phòng trong “Vị trí” = 1 ảnh tương ứng (ảnh tốt nhất); ảnh có ghi chú (vd vật liệu cũ đã thay) luôn được giữ thêm
                const withImg = os.filter(o => o.bbox && (o.page_id || o.view?.img))
                const best1 = new Map<string, Occurrence>()
                for (const o of withImg) { const k = o.room_id ?? o.id; const c = best1.get(k); if (!c || (!!o.note && !c.note) || (!!o.note === !!c.note && (o.confidence ?? 0) > (c.confidence ?? 0))) best1.set(k, o) }
                const shots: Occurrence[] = [...locs.map(l => best1.get(l.room.id)).filter(Boolean) as Occurrence[], ...withImg.filter(o => !o.room_id)]
                for (const o of withImg) if (o.note && !shots.includes(o)) shots.push(o)
                // Bảng ngoài chỉ để 3 ảnh đại diện (ảnh có ghi chú → độ tin cậy cao trước); đủ ảnh xem ở khung chi tiết khi bấm vào dòng
                const shown = [...shots].sort((a, b) => (b.note ? 1 : 0) - (a.note ? 1 : 0) || (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 3)
                const missRooms = locs.filter(l => !shots.some(o => o.room_id === l.room.id))
                const cat = os[0]?.category ?? e.category ?? 'decor'
                const ms = missingOf(e, lang), mk = new Set<string>(ms.map(m => String(m.key)))
                const M = (k: K) => mk.has(String(k))
                n++
                return (
                  <tr key={e.id} onDragOver={ev => { if (canEdit && ev.dataTransfer.types.includes('text/dmvl-occ')) { ev.preventDefault(); ev.dataTransfer.dropEffect = ev.ctrlKey || ev.altKey ? 'copy' : 'move'; if (dropId !== e.id) setDropId(e.id) } }} onDragLeave={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setDropId(x => (x === e.id ? null : x)) }} onDrop={ev => { const id = ev.dataTransfer.getData('text/dmvl-occ'); setDropId(null); if (id) { ev.preventDefault(); moveShot(id, e, ev.ctrlKey || ev.altKey) } }} className={(dropId === e.id ? 'drop-ok ' : '') + (ms.length ? 'has-miss ' : '') + 'st-' + e.status + (e.id === sel ? ' sel' : '') + ' src-row-' + e.source} onClick={() => os[0] && onPick(os[0])}>
                    <td className="c-stt">{n}</td>
                    <td className="c-code"><b>{symbolOf(e, lang, legacy, symMap)}</b>{ms.length > 0 && <div><span className="miss-badge" title={'Còn thiếu: ' + missText(ms)}>⚠ thiếu {new Set(ms.map(m => m.label)).size}</span></div>}{e.link_id && <div><span className="link-badge" title={'Liên kết đồng bộ với: ' + (linkedWith(e, d.entries).map(x => x.code).join(', ') || '—')}>🔗 {linkedWith(e, d.entries).map(x => x.code).join(', ')}</span></div>}<div><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></div></td>
                    <td className="c-vl"><Ed e={e} k="product_code" ph="Mã vật liệu" miss={M('product_code')} /></td>
                    <td><select value={sectionOf(e).key} disabled={!canEdit} onClick={x => x.stopPropagation()} onChange={x => setSection(e, os, x.target.value)}>{bandKeys().map(b => <optgroup key={b} label={bandTitle(b, lang)}>{allSections().filter(x => x.band === b).map(x => <option key={x.key} value={x.key}>{sectionTitle(x, lang)}</option>)}</optgroup>)}</select>
                      {pair('part', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} ph="Bộ phận áp dụng" /></div>)}</td>
                    <td className="c-loc">{locs.map(l => <span key={l.room.id} className={'loc-tag' + (l.room.id === room?.id ? ' here' : '')}>{roomName(l.room, lang)}{canEdit && <a className="loc-x" title="Bỏ vị trí này" onClick={ev => { ev.stopPropagation(); delLoc(e, l.room) }}>✕</a>}</span>)}
                      {canEdit && <select className="loc-add" value="" onClick={x => x.stopPropagation()} onChange={x => addLoc(e, x.target.value)}><option value="">＋ thêm phòng…</option>{d.rooms.filter(r => !locs.some(l => l.room.id === r.id)).map(r => <option key={r.id} value={r.id}>{r.code} {r.name_vn}</option>)}</select>}</td>
                    <td className="c-img">{shown.length ? shown.map(o => <span key={o.id} className="shot-wrap" draggable={canEdit} title={canEdit ? 'Kéo thả sang vật liệu khác để chuyển ảnh (giữ Ctrl để sao chép)' : undefined} onDragStart={ev => { ev.dataTransfer.setData('text/dmvl-occ', o.id); ev.dataTransfer.effectAllowed = 'copyMove' }} onDragEnd={() => setDropId(null)}><OccCrop d={d} o={o} height={64} maxWidth={90} /><div className="shot-cap" title={o.note ?? ''} onClick={ev => { ev.stopPropagation(); if (canEdit) { setNoteTxt(o.note ?? ''); setShotNote(o) } }}>{o.room_id ? d.rooms.find(r => r.id === o.room_id)?.code : ''}{o.note ? ' · ' + o.note : canEdit ? ' ✎' : ''}</div>{canEdit && <a className="shot-x" title="Xoá hình này" onClick={ev => { ev.stopPropagation(); delShot(o) }}>✕</a>}</span>)
                      : null}
                    {(shots.length > shown.length || missRooms.length > 0) && <div className="small muted" style={{ cursor: 'pointer' }} title="Bấm vào dòng để xem đủ ảnh các phòng">＋ {shots.length > shown.length ? `${shots.length - shown.length} ảnh khác` : ''}{shots.length > shown.length && missRooms.length ? ' · ' : ''}{missRooms.length ? `${missRooms.length} phòng chưa khoanh` : ''} – bấm để xem đủ</div>}
                    {!locs.length && !shots.length && <div className="ic-none tiny"><span>{e.source === 'inferred' ? 'Suy luận' : 'Chưa có ảnh'}</span></div>}
                    {canEdit && locs.some(l => !shots.some(o => o.room_id === l.room.id) && d.pages.some(p => p.room_id === l.room.id && p.kind === 'render')) && <div><button className="btn ghost sm" title="AI rà từng phòng chưa khoanh để tìm vật liệu và vẽ mũi tên" onClick={ev => { ev.stopPropagation(); scanMissing(e, locs.filter(l => !shots.some(o => o.room_id === l.room.id)).map(l => l.room.id)) }}>🔍 AI khoanh {locs.filter(l => !shots.some(o => o.room_id === l.room.id)).length} phòng còn thiếu</button></div>}
                      {canEdit && <button className="btn ghost sm" title="Thêm hình phối cảnh" onClick={ev => { ev.stopPropagation(); setShotRoom(null); setShotFor(e) }}>＋ ảnh</button>}</td>
                    <td>{[...pair('name', lang), ...pair('material', lang), ...pair('desc', lang)].map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} miss={M(k)} area={!String(k).startsWith('name')} ph={String(k).startsWith('name') ? 'Tên hạng mục' : String(k).startsWith('material') ? 'Vật liệu / màu / bề mặt' : 'Thông số kỹ thuật'} /></div>)}
                      <div className="ed-line lab"><i>{lang === 'en' ? 'Composition' : 'Cấu tạo'}</i><Ed e={e} k="composition" area ph={lang === 'en' ? 'Composition' : 'Cấu tạo (vật liệu thành phần)'} /></div>
                      </td>
                    <td className="c-brand"><div className="ed-pre"><b>{lang === 'en' ? 'Origin' : 'Xuất xứ'}:</b><Ed e={e} k="origin" ph="Xuất xứ" /></div><div className="ed-pre"><b>{lang === 'en' ? 'Brand' : 'Thương hiệu'}:</b><Ed e={e} k="brand" ph="Hãng / thương hiệu" /></div></td>
                    <td className="c-mat"><MatImage d={d} e={e} />
                      <LinkCell d={d} e={e} /></td>
                    <td>{pair('note', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area ph="Ghi chú" /></div>)}<OpRuleBadge d={d} entryId={e.id} /></td>
                    <td className="c-act"><StatusDot s={e.status} />
                      {canEdit && <button className={'btn sm' + (e.status === 'approved' ? ' ok-on' : '')} onClick={ev => quick(e, 'approved', ev)}>✓</button>}
                      <button className="btn ghost sm" title="Chi tiết / chọn mã hãng từ thư viện" onClick={ev => { ev.stopPropagation(); onDetail(e.id) }}>⋯</button>
                      {canEdit && <button className="btn ghost sm" title="Nhân đôi vật liệu này (vd màu thứ 2) – chép nội dung, chỉ sửa vài chỗ" onClick={ev => { ev.stopPropagation(); onAdd({ copy: e.id, section_key: e.section_key, group: e.group_code, category: cat, name: e.name_vn, part_vn: e.part_vn, parent_id: e.parent_id, hint: `Thêm vật liệu cùng loại với ${e.code} – ${e.name_vn}. Sửa tên/màu cho khác đi.` }) }}>＋</button>}
                      {canEdit && <button className="btn ghost sm" title="Xoá hạng mục này" onClick={ev => { ev.stopPropagation(); del(e) }}>🗑</button>}</td>
                  </tr>)
              })}</tbody>
            </table>
          </div>)
      })}
    {shotFor && <AddShot d={d} entry={shotFor} roomId={shotRoom ?? room?.id} onClose={() => { setShotFor(null); setShotRoom(null) }} />}
    {scanning && <div className="modal-bg center"><div className="modal"><span className="spinner" /> AI đang rà phòng {scanning} để tìm vật liệu và khoanh mũi tên…</div></div>}
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

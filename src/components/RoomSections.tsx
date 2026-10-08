import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/codes'
import { groupBySection, sectionTitle, bandTitle, legacyCodes, symbolOf, BANDS, type Lang } from '../lib/sections'
import { locationsOf } from '../lib/locations'
import type { ProjectData } from '../lib/useProject'
import type { Entry, Occurrence, Room } from '../lib/types'
import Crop from './Crop'
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
    const { error } = await supabase.from('entries').update({ [k]: val }).eq('id', e.id)
    if (error) alert(error.message)
  }
  const common = { value: v, placeholder: ph, readOnly: !canEdit, className: miss ? 'miss' : undefined, title: miss ? 'Thiếu thông tin – cần điền' : undefined, onChange: (x: any) => setV(x.target.value), onBlur: save, onClick: (x: any) => x.stopPropagation(), style: w ? { width: w } : undefined }
  return area ? <textarea {...common} rows={Math.min(8, Math.max(2, Math.ceil(v.length / 38)))} /> : <input {...common} type={num ? 'number' : 'text'} />
}
const pair = (k: 'name' | 'material' | 'desc' | 'note', lang: Lang): K[] => (lang === 'vn' ? [`${k}_vn`] : lang === 'en' ? [`${k}_en`] : [`${k}_vn`, `${k}_en`]) as K[]
const flag = (k: K) => (String(k).endsWith('_en') ? 'EN' : String(k).endsWith('_vn') ? 'VN' : '')

// Cột giống bảng danh mục mẫu của công ty (tên và vị trí cột)
const HEAD: Record<Lang, string[]> = {
  vn: ['STT', 'KÍ HIỆU BẢN VẼ', 'KÍ HIỆU VL', 'Hạng mục', 'Vị trí', 'Hình ảnh phối cảnh', 'Thông số kỹ thuật', 'Xuất xứ/ Thương hiệu', 'Hình ảnh vật liệu', 'Ghi chú'],
  en: ['No.', 'DRAWING CODE', 'MATERIAL CODE', 'Item', 'Location', 'Render image', 'Specification', 'Origin / Brand', 'Material image', 'Remarks'],
  both: ['STT / No.', 'KÍ HIỆU BẢN VẼ / DRAWING CODE', 'KÍ HIỆU VL / MATERIAL CODE', 'Hạng mục / Item', 'Vị trí / Location', 'Hình ảnh phối cảnh / Render', 'Thông số kỹ thuật / Specification', 'Xuất xứ/ Thương hiệu / Origin / Brand', 'Hình ảnh vật liệu / Material image', 'Ghi chú / Remarks'],
}
const HW: (number | string)[] = [38, 84, 112, 116, '11%', 104, '24%', '12%', 112, '13%']
export default function RoomSections({ d, room, lang, filter, sel, onPick, onDetail, onRemove, onAdd }: {
  d: ProjectData; room: Room; lang: Lang; filter: 'all' | 'pending' | 'inferred' | 'missing'; sel: string | null
  onPick: (o: Occurrence) => void; onDetail: (id: string) => void; onRemove: (o: Occurrence) => void
  onAdd: (p: { group: string; category: string; name: string; part_vn?: string | null; parent_id?: string | null; hint?: string }) => void
}) {
  const { canEdit } = useAuth()
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const legacy = useMemo(() => legacyCodes(d.entries), [d.entries])
  const occ = d.occ.filter(o => o.room_id === room.id)
  const ids = [...new Set(occ.map(o => o.entry_id))]
  let ents = d.entries.filter(e => ids.includes(e.id) && e.status !== 'rejected')
  if (filter === 'pending') ents = ents.filter(e => e.status === 'pending' || e.status === 'review')
  if (filter === 'inferred') ents = ents.filter(e => e.source === 'inferred')
  if (filter === 'missing') ents = ents.filter(e => missingOf(e, lang).length)
  const secs = groupBySection(ents)
  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); d.reload() }
  const setCat = async (os: Occurrence[], category: string) => { await supabase.from('occurrences').update({ category }).in('id', os.map(o => o.id)); d.reload() }
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
              {canEdit && <button className="btn sm add-sib" style={{ marginLeft: 'auto' }} title="Thêm vật liệu khác vào mục này (vd màu sơn thứ 2)" onClick={() => { const f = items[0]; onAdd({ group: f.group_code, category: f.category ?? 'decor', name: f.name_vn, part_vn: f.part_vn, parent_id: f.parent_id, hint: `Thêm vật liệu nhận diện thiếu trong mục “${sectionTitle(section, lang)}”.` }) }}>＋ Thêm vật liệu</button>}</div>
            <table className="sec-table">
              <thead><tr>{HEAD[lang].map((t, i) => <th key={i} style={{ width: HW[i] }}>{t}</th>)}<th style={{ width: 112 }} /></tr></thead>
              <tbody>{items.map(e => {
                const os = occ.filter(o => o.entry_id === e.id)
                const shots = os.filter(o => o.bbox && o.page_id).slice(0, 2)
                const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
                const cat = os[0]?.category ?? e.category ?? 'decor'
                const ms = missingOf(e, lang), mk = new Set<string>(ms.map(m => String(m.key)))
                const M = (k: K) => mk.has(String(k))
                n++
                return (
                  <tr key={e.id} className={(ms.length ? 'has-miss ' : '') + 'st-' + e.status + (e.id === sel ? ' sel' : '') + ' src-row-' + e.source} onClick={() => os[0] && onPick(os[0])}>
                    <td className="c-stt">{n}</td>
                    <td className="c-code"><b>{symbolOf(e, lang, legacy)}</b>{ms.length > 0 && <div><span className="miss-badge" title={'Còn thiếu: ' + missText(ms)}>⚠ thiếu {new Set(ms.map(m => m.label)).size}</span></div>}<div><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></div></td>
                    <td className="c-vl"><Ed e={e} k="product_code" ph="Mã vật liệu" miss={M('product_code')} /></td>
                    <td><select value={cat} disabled={!canEdit} onClick={x => x.stopPropagation()} onChange={x => setCat(os, x.target.value)}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{lang === 'en' ? c.en : c.vn}</option>)}</select>
                      {e.part_vn && <div className="small muted">{lang === 'en' ? e.part_en || e.part_vn : e.part_vn}</div>}
                      <div className="c-qty"><Ed e={e} k="qty" num w={54} miss={M('qty')} ph="SL" /><Ed e={e} k="unit" ph="đvt" w={54} miss={M('unit')} />{e.qty_flag !== 'ok' && <span className="warn-text" title={e.qty_note ?? ''}>⚠ cần kiểm</span>}</div></td>
                    <td className="c-loc">{locs.map(l => <span key={l.room.id} className={'loc-tag' + (l.room.id === room.id ? ' here' : '')}>{l.room.code} {lang === 'en' ? l.room.name_en || l.room.name_vn : l.room.name_vn}</span>)}</td>
                    <td className="c-img">{shots.length ? shots.map(o => { const pg = pageById.get(o.page_id!); return <Crop key={o.id} url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={64} maxWidth={90} /> })
                      : <div className="ic-none tiny"><span>{e.source === 'inferred' ? 'Suy luận' : 'Chưa có ảnh'}</span></div>}</td>
                    <td>{[...pair('name', lang), ...pair('material', lang), ...pair('desc', lang)].map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} miss={M(k)} area={!String(k).startsWith('name')} ph={String(k).startsWith('name') ? 'Tên hạng mục' : String(k).startsWith('material') ? 'Vật liệu / màu / bề mặt' : 'Thông số kỹ thuật'} /></div>)}</td>
                    <td className="c-brand"><Ed e={e} k="brand" ph="Hãng / thương hiệu" miss={M('brand')} /><Ed e={e} k="origin" ph="Xuất xứ" miss={M('origin')} /></td>
                    <td className="c-mat">{e.product_image_url ? <img className="mat-img" src={e.product_image_url} alt="" /> : e.color_hex ? <div className="mat-sw" style={{ background: e.color_hex }} title={e.color_hex}><span>{e.color_hex}</span></div> : <div className="ic-none tiny"><span>Chưa có mẫu</span></div>}
                      <Ed e={e} k="product_image_url" ph="Link ảnh mẫu" /></td>
                    <td><Ed e={e} k="product_url" ph="Link sản phẩm" />{pair('note', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area ph="Ghi chú" /></div>)}</td>
                    <td className="c-act"><StatusDot s={e.status} />
                      {canEdit && <button className={'btn sm' + (e.status === 'approved' ? ' ok-on' : '')} onClick={ev => quick(e, 'approved', ev)}>✓</button>}
                      {canEdit && <button className="btn ghost sm" title="Loại bỏ mã" onClick={ev => quick(e, 'rejected', ev)}>✕</button>}
                      <button className="btn ghost sm" title="Chi tiết / chọn mã hãng từ thư viện" onClick={ev => { ev.stopPropagation(); onDetail(e.id) }}>⋯</button>
                      {canEdit && <button className="btn ghost sm" title="Thêm 1 vật liệu nữa cùng hạng mục này (vd màu thứ 2)" onClick={ev => { ev.stopPropagation(); onAdd({ group: e.group_code, category: cat, name: e.name_vn, part_vn: e.part_vn, parent_id: e.parent_id, hint: `Thêm vật liệu cùng loại với ${e.code} – ${e.name_vn}. Sửa tên/màu cho khác đi.` }) }}>＋</button>}
                      {canEdit && <button className="btn ghost sm" title="Bỏ khỏi phòng này" onClick={ev => { ev.stopPropagation(); os[0] && onRemove(os[0]) }}>🗑</button>}</td>
                  </tr>)
              })}</tbody>
            </table>
          </div>)
      })}
    </div>
  )
}
export { BANDS }

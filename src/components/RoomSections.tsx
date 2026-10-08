import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/codes'
import { groupBySection, sectionTitle, bandTitle, legacyCodes, symbolOf, BANDS, type Lang } from '../lib/sections'
import { locationsOf } from '../lib/locations'
import type { ProjectData } from '../lib/useProject'
import type { Entry, Occurrence, Room } from '../lib/types'
import Crop from './Crop'
import { StatusDot } from '../pages/tabs/MaterialView'

type K = keyof Entry
/** Ô sửa trực tiếp: lưu khi rời ô */
function Ed({ e, k, area, ph, num, w }: { e: Entry; k: K; area?: boolean; ph?: string; num?: boolean; w?: number }) {
  const [v, setV] = useState<string>(String((e[k] as any) ?? ''))
  useEffect(() => setV(String((e[k] as any) ?? '')), [e, k])
  const save = async () => {
    if (String((e[k] as any) ?? '') === v) return
    const val = num ? (v === '' ? null : Number(v)) : v || null
    const { error } = await supabase.from('entries').update({ [k]: val }).eq('id', e.id)
    if (error) alert(error.message)
  }
  const common = { value: v, placeholder: ph, onChange: (x: any) => setV(x.target.value), onBlur: save, onClick: (x: any) => x.stopPropagation(), style: w ? { width: w } : undefined }
  return area ? <textarea {...common} rows={Math.min(8, Math.max(2, Math.ceil(v.length / 38)))} /> : <input {...common} type={num ? 'number' : 'text'} />
}
const pair = (k: 'name' | 'material' | 'desc' | 'note', lang: Lang): K[] => (lang === 'vn' ? [`${k}_vn`] : lang === 'en' ? [`${k}_en`] : [`${k}_vn`, `${k}_en`]) as K[]
const flag = (k: K) => (String(k).endsWith('_en') ? 'EN' : String(k).endsWith('_vn') ? 'VN' : '')

export default function RoomSections({ d, room, lang, filter, sel, onPick, onDetail, onRemove }: {
  d: ProjectData; room: Room; lang: Lang; filter: 'all' | 'pending' | 'inferred'; sel: string | null
  onPick: (o: Occurrence) => void; onDetail: (id: string) => void; onRemove: (o: Occurrence) => void
}) {
  const pageById = useMemo(() => new Map(d.pages.map(p => [p.id, p])), [d.pages])
  const legacy = useMemo(() => legacyCodes(d.entries), [d.entries])
  const occ = d.occ.filter(o => o.room_id === room.id)
  const ids = [...new Set(occ.map(o => o.entry_id))]
  let ents = d.entries.filter(e => ids.includes(e.id) && e.status !== 'rejected')
  if (filter === 'pending') ents = ents.filter(e => e.status === 'pending' || e.status === 'review')
  if (filter === 'inferred') ents = ents.filter(e => e.source === 'inferred')
  const secs = groupBySection(ents)
  const quick = async (e: Entry, status: Entry['status'], ev: React.MouseEvent) => { ev.stopPropagation(); await supabase.from('entries').update({ status }).eq('id', e.id); d.reload() }
  const setCat = async (os: Occurrence[], category: string) => { await supabase.from('occurrences').update({ category }).in('id', os.map(o => o.id)); d.reload() }
  let lastBand = ''
  if (!secs.length) return <div className="muted small" style={{ padding: 12 }}>Chưa có hạng mục nào{filter !== 'all' ? ' khớp bộ lọc' : ''}.</div>
  return (
    <div className="sec-wrap">
      {secs.map(({ section, items }) => {
        const bandRow = section.band !== lastBand ? section.band : null; lastBand = section.band
        return (
          <div key={section.key}>
            {bandRow && <div className={'band band-' + bandRow}>{bandTitle(bandRow, lang)}</div>}
            <div className="sec-title">{sectionTitle(section, lang)} <span className="cnt">{items.length}</span></div>
            <table className="sec-table">
              <thead><tr><th style={{ width: 96 }}>Hình ảnh</th><th style={{ width: 86 }}>Ký hiệu</th><th style={{ width: '19%' }}>Hạng mục / vật liệu</th><th style={{ width: 92 }}>Mục</th><th style={{ width: '12%' }}>Vị trí</th><th style={{ width: 82 }}>Thống kê</th><th>Thông số kỹ thuật</th><th style={{ width: '14%' }}>Xuất xứ / Thương hiệu</th><th style={{ width: '10%' }}>Ghi chú</th><th style={{ width: 112 }} /></tr></thead>
              <tbody>{items.map(e => {
                const os = occ.filter(o => o.entry_id === e.id)
                const shots = os.filter(o => o.bbox && o.page_id).slice(0, 2)
                const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
                const cat = os[0]?.category ?? e.category ?? 'decor'
                return (
                  <tr key={e.id} className={'st-' + e.status + (e.id === sel ? ' sel' : '') + ' src-row-' + e.source} onClick={() => os[0] && onPick(os[0])}>
                    <td className="c-img">{shots.length ? shots.map(o => { const pg = pageById.get(o.page_id!); return <Crop key={o.id} url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={64} maxWidth={90} /> })
                      : <div className="ic-none tiny" style={e.color_hex ? { background: e.color_hex } : undefined}><span>{e.source === 'inferred' ? 'Suy luận' : 'Chưa có ảnh'}</span></div>}
                      {e.color_hex && shots.length > 0 && <span className="swatch-s" style={{ background: e.color_hex }} title={e.color_hex} />}</td>
                    <td className="c-code"><b>{symbolOf(e, lang, legacy)}</b><div><span className={'src src-' + e.source}>{e.source === 'image' ? 'Ảnh' : e.source === 'inferred' ? 'Suy luận' : 'Tay'}</span></div></td>
                    <td>{[...pair('name', lang), ...pair('material', lang)].map((k, i) => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area={String(k).startsWith('material')} ph={String(k).startsWith('name') ? 'Tên hạng mục' : 'Vật liệu'} /></div>)}</td>
                    <td><select value={cat} onClick={x => x.stopPropagation()} onChange={x => setCat(os, x.target.value)}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{lang === 'en' ? c.en : c.vn}</option>)}</select>
                      {e.part_vn && <div className="small muted">{lang === 'en' ? e.part_en || e.part_vn : e.part_vn}</div>}</td>
                    <td className="c-loc">{locs.map(l => <span key={l.room.id} className={'loc-tag' + (l.room.id === room.id ? ' here' : '')}>{l.room.code} {lang === 'en' ? l.room.name_en || l.room.name_vn : l.room.name_vn}</span>)}</td>
                    <td className="c-qty"><Ed e={e} k="qty" num w={60} /><Ed e={e} k="unit" ph="đvt" w={60} />{e.qty_flag !== 'ok' && <span className="warn-text" title={e.qty_note ?? ''}>⚠ cần kiểm</span>}</td>
                    <td>{pair('desc', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area ph="Thông số kỹ thuật" /></div>)}</td>
                    <td className="c-brand"><Ed e={e} k="brand" ph="Hãng / thương hiệu" /><Ed e={e} k="product_code" ph="Mã sản phẩm" /><Ed e={e} k="origin" ph="Xuất xứ" /></td>
                    <td>{pair('note', lang).map(k => <div key={String(k)} className="ed-line">{lang === 'both' && <i>{flag(k)}</i>}<Ed e={e} k={k} area ph="Ghi chú" /></div>)}</td>
                    <td className="c-act"><StatusDot s={e.status} />
                      <button className={'btn sm' + (e.status === 'approved' ? ' ok-on' : '')} onClick={ev => quick(e, 'approved', ev)}>✓</button>
                      <button className="btn ghost sm" title="Loại bỏ mã" onClick={ev => quick(e, 'rejected', ev)}>✕</button>
                      <button className="btn ghost sm" title="Chi tiết / chọn mã hãng từ thư viện" onClick={ev => { ev.stopPropagation(); onDetail(e.id) }}>⋯</button>
                      <button className="btn ghost sm" title="Bỏ khỏi phòng này" onClick={ev => { ev.stopPropagation(); os[0] && onRemove(os[0]) }}>🗑</button></td>
                  </tr>)
              })}</tbody>
            </table>
          </div>)
      })}
    </div>
  )
}
export { BANDS }

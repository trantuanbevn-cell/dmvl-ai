import OpRuleBadge from './OpRuleBadge'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import ProductReadDialog from './ProductReadDialog'
import { saveEntry, linkedWith, linkEntries, unlinkEntry, SYNC_LABEL } from '../lib/entryLink'
import { CATEGORIES } from '../lib/codes'
import { allGroups } from '../lib/sections'
import { writeSpecs, applyProduct } from '../lib/pipeline'
import { librarySuggestions, saveToLibrary, searchLinks, LibProduct } from '../lib/library'
import type { Entry } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import RoomShotFallback from './RoomShotFallback'
import { locationsOf } from '../lib/locations'
import OccCrop from './OccCrop'
import { useAuth } from '../lib/auth'
import { fixCategory, type Issue } from '../lib/checks'

type F = keyof Entry
function Field({ e, k, label, area, onSaved, type = 'text', bad }: { e: Entry; k: F; label: string; area?: boolean; onSaved: () => void; type?: string; bad?: boolean }) {
  const [v, setV] = useState<string>((e[k] as any) ?? '')
  useEffect(() => setV((e[k] as any) ?? ''), [String(e[k] ?? ''), k])
  const save = async () => {
    const old = (e[k] as any) ?? ''
    if (String(old) === v) return
    const val = type === 'number' ? (v === '' ? null : Number(v)) : v || null
    const error = await saveEntry(e, { [k]: val })
    if (error) alert(error.message); else onSaved()
  }
  const dl = String(k).endsWith('_vn') ? 'vn' : String(k).endsWith('_en') ? 'en' : ['product_code', 'color_hex', 'product_url', 'product_image_url'].includes(String(k)) || type === 'number' ? 'none' : 'name'
  return (
    <label className={'fld' + (bad ? ' bad' : '')} data-flag={bad ? '1' : undefined}>{label}
      {area ? <textarea data-lang={dl} value={v} onChange={x => setV(x.target.value)} onBlur={save} rows={3} />
        : <input data-lang={dl} type={type} value={v} onChange={x => setV(x.target.value)} onBlur={save} />}
    </label>
  )
}

export default function EntryPanel({ d, entry, onClose, issues }: { d: ProjectData; entry: Entry; onClose: () => void; issues?: Issue[] }) {
  const { canEdit } = useAuth()
  const [busy, setBusy] = useState('')
  const flagKeys = new Set((issues ?? []).flatMap(i => i.keys))
  const B = (k: string) => flagKeys.has(k)
  const [lang, setLang] = useState<'vn' | 'en'>(() => ([...flagKeys].some(k => k.endsWith('_en')) && ![...flagKeys].some(k => k.endsWith('_vn')) ? 'en' : 'vn'))
  const root = useRef<HTMLElement>(null)
  // mở từ danh sách lỗi: cuộn thẳng tới ô sai đầu tiên (đã tô đỏ)
  useEffect(() => { if (!flagKeys.size) return; const t = setTimeout(() => root.current?.querySelector('[data-flag="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150); return () => clearTimeout(t) }, [entry.id]) // eslint-disable-line
  const [readLink, setReadLink] = useState(false)
  const saved = () => d.reload()
  const set = async (patch: Partial<Entry>) => { await saveEntry(entry, patch); d.reload() }
  const occ = d.occ.filter(o => o.entry_id === entry.id)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const roomById = new Map(d.rooms.map(r => [r.id, r]))
  const children = d.entries.filter(x => x.parent_id === entry.id)
  const parent = d.entries.find(x => x.id === entry.parent_id)

  const [lib, setLib] = useState<(LibProduct & { dE: number | null })[]>([])
  useEffect(() => { librarySuggestions(entry).then(setLib) }, [entry.id, entry.color_hex, entry.group_code])
  const choose = async (c: LibProduct) => { await applyProduct(entry, c); if (entry.link_id) { const { data } = await supabase.from('entries').select('product_code,color_hex,brand,product_name,origin,product_url,product_image_url').eq('id', entry.id).single(); if (data) await supabase.from('entries').update(data).eq('link_id', entry.link_id) } d.reload() }
  const save = async () => { try { await saveToLibrary(entry); setLib(await librarySuggestions(entry)); alert('Đã lưu vào thư viện công ty – lần sau sẽ được gợi ý tự động.') } catch (e) { alert(String(e)) } }
  const rewrite = async () => { setBusy('enrich'); try { await writeSpecs(d.project!, { ids: [entry.id] }); await d.reload() } catch (e) { alert(String(e)) } setBusy('') }
  const del = async () => { if (confirm(`Xoá mã ${entry.code}?`)) { await supabase.from('entries').delete().eq('id', entry.id); onClose(); d.reload() } }
  const renameCode = async (code: string) => {
    if (!code || code === entry.code) return
    if (d.entries.some(x => x.code === code)) return alert('Mã đã tồn tại')
    await set({ code })
  }

  return (
    <aside className="panel" ref={root}>
      <div className="row between panel-head">
        <div className="row gap sm-gap">
          <input className="code-in big" defaultValue={entry.code} onBlur={e => renameCode(e.target.value.trim())} />
          <span className={'src src-' + entry.source}>{entry.source === 'image' ? 'Ảnh' : entry.source === 'inferred' ? 'Suy luận' : 'Thêm tay'}</span>
        </div>
        <button className="btn ghost sm" onClick={onClose}>✕</button>
      </div>
      {!!issues?.length && <div className="issue-banner"><b>Cần sửa ({issues.length}) – các ô tô đỏ bên dưới:</b>
        {issues.map((i, k) => <div key={k} className={'small ib-' + i.kind}>• {i.text}{i.fix === 'category' && canEdit && <button className="btn sm primary" style={{ marginLeft: 8 }} onClick={async () => { await fixCategory(entry); d.reload() }}>Tự sửa</button>}</div>)}</div>}
      <OpRuleBadge d={d} entryId={entry.id} />

      <fieldset className="plain" disabled={!canEdit}>
      <div className="status-row">
        {(['approved', 'pending', 'review', 'rejected'] as const).map(s => (
          <button key={s} className={'btn sm st-btn ' + s + (entry.status === s ? ' on' : '')} onClick={() => set({ status: s })}>
            {{ approved: '✓ Xác nhận', pending: 'Chờ duyệt', review: 'TVTK xem lại', rejected: '✕ Loại bỏ' }[s]}
          </button>))}
      </div>

      <div className={'crops-row' + (B('shot') ? ' flag-box' : '')} data-flag={B('shot') ? '1' : undefined}>
        {occ.filter((o, i) => o.bbox || !occ.some(x => x.room_id === o.room_id && x.bbox) && occ.findIndex(x => x.room_id === o.room_id && !x.bbox) === i).map(o => {
          const pg = o.page_id ? pageById.get(o.page_id) : undefined
          return (
            <div key={o.id} className="occ">
              {o.bbox ? <OccCrop d={d} o={o} height={120} maxWidth={210} /> : o.room_id ? <RoomShotFallback d={d} roomId={o.room_id} height={120} width={210} /> : <OccCrop d={d} o={o} height={120} maxWidth={210} />}
              <div className="small muted">{o.room_id ? roomById.get(o.room_id)?.code : ''}{pg ? ` · tr.${pg.page_no}` : ''}{o.note ? ` · ${o.note}` : ''}</div>
            </div>)
        })}
      </div>

      <div className={'loc-box link-box' + (B('link') ? ' flag-box' : '')} data-flag={B('link') ? '1' : undefined}><b>🔗 Liên kết đồng bộ:</b>{' '}
        {linkedWith(entry, d.entries).map(x => <span key={x.id} className="loc-tag">{x.code} {x.name_vn}{canEdit && <a className="loc-x" title="Bỏ liên kết" onClick={async () => { await unlinkEntry(x, d.entries); d.reload() }}>✕</a>}</span>)}
        {!entry.link_id && <span className="muted small">chưa liên kết – </span>}
        <span className="muted small">sửa {Object.values(SYNC_LABEL).join(', ').toLowerCase()} ở mã này thì các mã liên kết đổi theo.</span>
        {canEdit && <select className="loc-add" value="" onChange={async x => { const o = d.entries.find(y => y.id === x.target.value); if (!o) return; try { await linkEntries(entry, o, d.entries); d.reload() } catch (err) { alert(String((err as Error).message ?? err)) } }}><option value="">＋ liên kết với mã khác…</option>{d.entries.filter(y => y.id !== entry.id && y.status !== 'rejected' && !(entry.link_id && y.link_id === entry.link_id)).map(y => <option key={y.id} value={y.id}>{y.code} – {y.name_vn}</option>)}</select>}
      </div>
      <div className={'loc-box' + (B('loc') ? ' flag-box' : '')} data-flag={B('loc') ? '1' : undefined}><b>Vị trí:</b>{' '}
        {locationsOf(entry.id, d.occ, d.rooms, d.pages).map(l => <span key={l.room.id} className="loc-tag">{l.room.code} {l.room.name_vn}{l.pages.length ? ` · tr.${l.pages.join(',')}` : ''}</span>)}
        {!occ.some(o => o.room_id) && <span className="muted">chưa gán phòng</span>}
      </div>

      <div className="grid2">
        <label className={'fld' + (B('group') ? ' bad' : '')} data-flag={B('group') ? '1' : undefined}>Nhóm<select value={entry.group_code} onChange={e => set({ group_code: e.target.value })}>{allGroups().map(g => <option key={g.code} value={g.code}>{g.code} – {g.vn}</option>)}</select></label>
        <label className={'fld' + (B('category') ? ' bad' : '')} data-flag={B('category') ? '1' : undefined}>Bề mặt / mục<select value={entry.category ?? ''} onChange={e => set({ category: e.target.value })}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select></label>
      </div>

      </fieldset>
      <div className="lang-switch"><button className={lang === 'vn' ? 'on' : ''} onClick={() => setLang('vn')}>Tiếng Việt</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
      <fieldset className="plain" disabled={!canEdit}>
      {lang === 'vn' ? <>
        <Field bad={B('name_vn') || ('name_vn'.startsWith('qty') && B('qty'))} e={entry} k="name_vn" label="Tên hạng mục / vật liệu" onSaved={saved} />
        <Field bad={B('part_vn') || ('part_vn'.startsWith('qty') && B('qty'))} e={entry} k="part_vn" label="Bộ phận áp dụng" onSaved={saved} />
        <Field bad={B('material_vn') || ('material_vn'.startsWith('qty') && B('qty'))} e={entry} k="material_vn" label="Vật liệu AI nhận diện" area onSaved={saved} />
        <Field bad={B('desc_vn') || ('desc_vn'.startsWith('qty') && B('qty'))} e={entry} k="desc_vn" label="Mô tả & thông số kỹ thuật" area onSaved={saved} />
        <Field bad={B('perf_vn') || ('perf_vn'.startsWith('qty') && B('qty'))} e={entry} k="perf_vn" label="Tính chất yêu cầu theo không gian (chỉ để kiểm tra, không xuất file)" area onSaved={saved} />
        <Field bad={B('note_vn') || ('note_vn'.startsWith('qty') && B('qty'))} e={entry} k="note_vn" label="Ghi chú TVTK" area onSaved={saved} />
      </> : <>
        <Field bad={B('name_en') || ('name_en'.startsWith('qty') && B('qty'))} e={entry} k="name_en" label="Item / material" onSaved={saved} />
        <Field bad={B('part_en') || ('part_en'.startsWith('qty') && B('qty'))} e={entry} k="part_en" label="Application" onSaved={saved} />
        <Field bad={B('material_en') || ('material_en'.startsWith('qty') && B('qty'))} e={entry} k="material_en" label="Detected material" area onSaved={saved} />
        <Field bad={B('desc_en') || ('desc_en'.startsWith('qty') && B('qty'))} e={entry} k="desc_en" label="Description & specification" area onSaved={saved} />
        <Field bad={B('perf_en') || ('perf_en'.startsWith('qty') && B('qty'))} e={entry} k="perf_en" label="Performance requirements (check only, not exported)" area onSaved={saved} />
        <Field bad={B('note_en') || ('note_en'.startsWith('qty') && B('qty'))} e={entry} k="note_en" label="Designer remarks" area onSaved={saved} />
      </>}
      <Field bad={B('standards') || ('standards'.startsWith('qty') && B('qty'))} e={entry} k="standards" label="Tiêu chuẩn tham chiếu (chỉ để kiểm tra, không xuất file)" onSaved={saved} />
      <Field bad={B('composition') || ('composition'.startsWith('qty') && B('qty'))} e={entry} k="composition" label="Cấu tạo (vật liệu thành phần theo mã)" onSaved={saved} />
      {(children.length > 0 || parent) && <div className="small muted">
        {parent && <>Thuộc: <b>{parent.code}</b> {parent.name_vn}. </>}
        {children.length > 0 && <>Thành phần: {children.map(c => c.code).join(', ')}</>}
      </div>}
      <button className="btn sm" disabled={!!busy} onClick={rewrite}>{busy === 'enrich' ? 'Đang viết…' : '↻ Viết lại thông số theo mẫu'}</button>

      <h4>Mã thực tế</h4>
      <div className="grid2">
        <Field bad={B('brand') || ('brand'.startsWith('qty') && B('qty'))} e={entry} k="brand" label="Hãng / thương hiệu" onSaved={saved} />
        <Field bad={B('product_code') || ('product_code'.startsWith('qty') && B('qty'))} e={entry} k="product_code" label="Mã sản phẩm" onSaved={saved} />
        <Field bad={B('product_name') || ('product_name'.startsWith('qty') && B('qty'))} e={entry} k="product_name" label="Tên sản phẩm (ghi chú nội bộ, không in)" onSaved={saved} />
        <Field bad={B('origin') || ('origin'.startsWith('qty') && B('qty'))} e={entry} k="origin" label="Xuất xứ" onSaved={saved} />
      </div>
      <Field bad={B('product_url') || ('product_url'.startsWith('qty') && B('qty'))} e={entry} k="product_url" label="Link hãng" onSaved={saved} />
      <Field bad={B('product_image_url') || ('product_image_url'.startsWith('qty') && B('qty'))} e={entry} k="product_image_url" label="Link ảnh map (ảnh mẫu hãng)" onSaved={saved} />
      {entry.product_url && <div className="row gap sm-gap"><a className="small" href={entry.product_url} target="_blank" rel="noreferrer">Mở trang hãng ↗</a>{canEdit && <button className="btn sm" onClick={() => setReadLink(true)}>↻ Đọc thông số từ link</button>}</div>}
      {readLink && <ProductReadDialog d={d} entry={entry} onClose={() => setReadLink(false)} />}
      <div className="row gap sm-gap">
        <button className="btn sm" onClick={save} disabled={!entry.brand || !entry.product_code}>💾 Lưu mã này vào thư viện</button>
      </div>
      <div className="small muted">Tìm nhanh trên web hãng (mở tab mới, miễn phí):</div>
      <div className="row gap sm-gap">{searchLinks(entry).map(l => <a key={l.label} className="btn ghost sm" href={l.url} target="_blank" rel="noreferrer">🔎 {l.label}</a>)}</div>
      {lib.length > 0 && <div className="cands">
        <div className="small muted">Gợi ý từ thư viện công ty (xếp theo độ gần màu & từ khóa):</div>
        {lib.map(c => (
          <div key={c.id} className={'cand' + (entry.product_code === c.product_code && entry.brand === c.brand ? ' chosen' : '')}>
            {c.color_hex ? <span className="swatch sm" style={{ background: c.color_hex, height: 40 }} /> : <span />}
            <div><b>{c.brand} · {c.product_code}</b> {c.product_name}{c.dE != null && <span className="small muted"> · ΔE {c.dE.toFixed(0)}</span>}<br />{c.url && <a className="small" href={c.url} target="_blank" rel="noreferrer">{c.url}</a>}</div>
            <button className="btn sm" onClick={() => choose(c)}>Chọn</button>
          </div>))}
      </div>}

      <h4>Số lượng</h4>
      <div className="grid3">
        <Field bad={B('qty') || ('qty'.startsWith('qty') && B('qty'))} e={entry} k="qty" label="SL" type="number" onSaved={saved} />
        <Field bad={B('unit') || ('unit'.startsWith('qty') && B('qty'))} e={entry} k="unit" label="ĐVT" onSaved={saved} />
        <label className={'fld' + (B('qty') ? ' bad' : '')}>Cờ<select value={entry.qty_flag ?? 'warn'} onChange={e => set({ qty_flag: e.target.value })}><option value="ok">✓ Đã kiểm</option><option value="warn">⚠ Cần nhập/kiểm</option></select></label>
      </div>
      <Field bad={B('qty_note') || ('qty_note'.startsWith('qty') && B('qty'))} e={entry} k="qty_note" label="Ghi chú số lượng" onSaved={saved} />
      <button className="btn ghost sm danger" onClick={del}>Xoá mã này</button>
      </fieldset>
    </aside>
  )
}

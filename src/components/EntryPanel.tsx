import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GROUPS, CATEGORIES } from '../lib/codes'
import { suggestProducts, chooseCandidate, enrichEntries } from '../lib/pipeline'
import type { Entry, Candidate } from '../lib/types'
import type { ProjectData } from '../lib/useProject'
import Crop from './Crop'

type F = keyof Entry
function Field({ e, k, label, area, onSaved, type = 'text' }: { e: Entry; k: F; label: string; area?: boolean; onSaved: () => void; type?: string }) {
  const [v, setV] = useState<string>((e[k] as any) ?? '')
  useEffect(() => setV((e[k] as any) ?? ''), [e, k])
  const save = async () => {
    const old = (e[k] as any) ?? ''
    if (String(old) === v) return
    const val = type === 'number' ? (v === '' ? null : Number(v)) : v || null
    const { error } = await supabase.from('entries').update({ [k]: val }).eq('id', e.id)
    if (error) alert(error.message); else onSaved()
  }
  return (
    <label className="fld">{label}
      {area ? <textarea value={v} onChange={x => setV(x.target.value)} onBlur={save} rows={3} />
        : <input type={type} value={v} onChange={x => setV(x.target.value)} onBlur={save} />}
    </label>
  )
}

export default function EntryPanel({ d, entry, onClose }: { d: ProjectData; entry: Entry; onClose: () => void }) {
  const [busy, setBusy] = useState('')
  const [lang, setLang] = useState<'vn' | 'en'>('vn')
  const saved = () => d.reload()
  const set = async (patch: Partial<Entry>) => { await supabase.from('entries').update(patch).eq('id', entry.id); d.reload() }
  const occ = d.occ.filter(o => o.entry_id === entry.id)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const roomById = new Map(d.rooms.map(r => [r.id, r]))
  const children = d.entries.filter(x => x.parent_id === entry.id)
  const parent = d.entries.find(x => x.id === entry.parent_id)

  const find = async () => {
    setBusy('search')
    try { await suggestProducts(entry); await d.reload() } catch (e) { alert(String(e)) }
    setBusy('')
  }
  const choose = async (c: Candidate) => { await chooseCandidate(entry, c); d.reload() }
  const rewrite = async () => { setBusy('enrich'); try { await enrichEntries(d.project!, () => {}, [entry.id]); await d.reload() } catch (e) { alert(String(e)) } setBusy('') }
  const del = async () => { if (confirm(`Xoá mã ${entry.code}?`)) { await supabase.from('entries').delete().eq('id', entry.id); onClose(); d.reload() } }
  const renameCode = async (code: string) => {
    if (!code || code === entry.code) return
    if (d.entries.some(x => x.code === code)) return alert('Mã đã tồn tại')
    await set({ code })
  }

  return (
    <aside className="panel">
      <div className="row between panel-head">
        <div className="row gap sm-gap">
          <input className="code-in big" defaultValue={entry.code} onBlur={e => renameCode(e.target.value.trim())} />
          <span className={'src src-' + entry.source}>{entry.source === 'image' ? 'Ảnh' : entry.source === 'inferred' ? 'Suy luận' : 'Thêm tay'}</span>
        </div>
        <button className="btn ghost sm" onClick={onClose}>✕</button>
      </div>

      <div className="status-row">
        {(['approved', 'pending', 'review', 'rejected'] as const).map(s => (
          <button key={s} className={'btn sm st-btn ' + s + (entry.status === s ? ' on' : '')} onClick={() => set({ status: s })}>
            {{ approved: '✓ Xác nhận', pending: 'Chờ duyệt', review: 'TVTK xem lại', rejected: '✕ Loại bỏ' }[s]}
          </button>))}
      </div>

      <div className="crops-row">
        {occ.map(o => {
          const pg = o.page_id ? pageById.get(o.page_id) : undefined
          return (
            <div key={o.id} className="occ">
              <Crop url={pg ? d.urls[pg.image_path] : undefined} bbox={o.bbox} pageW={pg?.width} pageH={pg?.height} height={86} />
              <div className="small muted">{o.room_id ? roomById.get(o.room_id)?.code : ''}{pg ? ` · tr.${pg.page_no}` : ''}{o.note ? ` · ${o.note}` : ''}</div>
            </div>)
        })}
        <div className="swatch" style={{ background: entry.color_hex ?? '#ddd' }} title="Màu trích từ ảnh"><span>{entry.color_hex}</span></div>
      </div>

      <div className="grid2">
        <label className="fld">Nhóm<select value={entry.group_code} onChange={e => set({ group_code: e.target.value })}>{GROUPS.map(g => <option key={g.code} value={g.code}>{g.code} – {g.vn}</option>)}</select></label>
        <label className="fld">Bề mặt / mục<select value={entry.category ?? ''} onChange={e => set({ category: e.target.value })}>{CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.vn}</option>)}</select></label>
      </div>

      <div className="lang-switch"><button className={lang === 'vn' ? 'on' : ''} onClick={() => setLang('vn')}>Tiếng Việt</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button></div>
      {lang === 'vn' ? <>
        <Field e={entry} k="name_vn" label="Tên hạng mục / vật liệu" onSaved={saved} />
        <Field e={entry} k="part_vn" label="Bộ phận áp dụng" onSaved={saved} />
        <Field e={entry} k="material_vn" label="Vật liệu AI nhận diện" area onSaved={saved} />
        <Field e={entry} k="desc_vn" label="Mô tả & thông số kỹ thuật" area onSaved={saved} />
        <Field e={entry} k="perf_vn" label="Tính chất yêu cầu theo không gian" area onSaved={saved} />
        <Field e={entry} k="note_vn" label="Ghi chú TVTK" area onSaved={saved} />
      </> : <>
        <Field e={entry} k="name_en" label="Item / material" onSaved={saved} />
        <Field e={entry} k="part_en" label="Application" onSaved={saved} />
        <Field e={entry} k="material_en" label="Detected material" area onSaved={saved} />
        <Field e={entry} k="desc_en" label="Description & specification" area onSaved={saved} />
        <Field e={entry} k="perf_en" label="Performance requirements" area onSaved={saved} />
        <Field e={entry} k="note_en" label="Designer remarks" area onSaved={saved} />
      </>}
      <Field e={entry} k="standards" label="Tiêu chuẩn tham chiếu" onSaved={saved} />
      <Field e={entry} k="composition" label="Cấu tạo (vật liệu thành phần theo mã)" onSaved={saved} />
      {(children.length > 0 || parent) && <div className="small muted">
        {parent && <>Thuộc: <b>{parent.code}</b> {parent.name_vn}. </>}
        {children.length > 0 && <>Thành phần: {children.map(c => c.code).join(', ')}</>}
      </div>}
      <button className="btn sm" disabled={!!busy} onClick={rewrite}>{busy === 'enrich' ? 'AI đang viết…' : '↻ AI viết lại thông số'}</button>

      <h4>Mã thực tế</h4>
      <div className="grid2">
        <Field e={entry} k="brand" label="Hãng" onSaved={saved} />
        <Field e={entry} k="product_code" label="Mã sản phẩm" onSaved={saved} />
        <Field e={entry} k="product_name" label="Tên sản phẩm" onSaved={saved} />
        <Field e={entry} k="origin" label="Xuất xứ" onSaved={saved} />
      </div>
      <Field e={entry} k="product_url" label="Link hãng" onSaved={saved} />
      <Field e={entry} k="product_image_url" label="Link ảnh map (ảnh mẫu hãng)" onSaved={saved} />
      {entry.product_url && <a className="small" href={entry.product_url} target="_blank" rel="noreferrer">Mở trang hãng ↗</a>}
      <button className="btn primary sm" disabled={!!busy} onClick={find}>{busy === 'search' ? 'AI đang tìm trên web hãng…' : '🔎 AI tìm 3 mã thực tế gần nhất'}</button>
      {entry.candidates?.length > 0 && <div className="cands">
        {entry.candidates.map((c, i) => (
          <div key={i} className={'cand' + (entry.product_code === c.product_code && entry.brand === c.brand ? ' chosen' : '')}>
            {c.image_url && <img src={c.image_url} alt="" referrerPolicy="no-referrer" onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <div>
              <b>{c.brand} · {c.product_code}</b> {c.product_name}<br />
              <span className="small">{c.reason_vn}</span><br />
              <a className="small" href={c.url} target="_blank" rel="noreferrer">{c.url}</a>
            </div>
            <button className="btn sm" onClick={() => choose(c)}>Chọn</button>
          </div>))}
        <p className="small muted">Đề xuất do AI tìm trên web – hãy mở link kiểm tra trước khi chọn. Mã đã chọn được lưu vào thư viện để gợi ý cho dự án sau.</p>
      </div>}

      <h4>Số lượng</h4>
      <div className="grid3">
        <Field e={entry} k="qty" label="SL" type="number" onSaved={saved} />
        <Field e={entry} k="unit" label="ĐVT" onSaved={saved} />
        <label className="fld">Cờ<select value={entry.qty_flag ?? 'warn'} onChange={e => set({ qty_flag: e.target.value })}><option value="ok">✓ Đã kiểm</option><option value="warn">⚠ Cần nhập/kiểm</option></select></label>
      </div>
      <Field e={entry} k="qty_note" label="Ghi chú số lượng" onSaved={saved} />
      <button className="btn ghost sm danger" onClick={del}>Xoá mã này</button>
    </aside>
  )
}

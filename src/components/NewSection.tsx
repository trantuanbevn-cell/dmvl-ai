import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { bandKeys, bandTitle, customGroups, newPrefixError } from '../lib/sections'
import { library, searchLib, groupOfItem, LIB_CATS, type LibItem } from '../lib/prefixLibrary'
import type { ProjectData } from '../lib/useProject'
import { toast } from '../lib/toast'

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
const DEF_GROUP: Record<string, string> = { A: 'PT', B: 'MT', C: 'FF', D: 'DC' }
const defGroup = (b: string) => DEF_GROUP[b] ?? 'FF'

/** Chọn tiền tố ký hiệu từ THƯ VIỆN (tìm theo mã / tên Việt / tên Anh), hoặc tự tạo mới. onChange nhận mã nhóm ('' nếu đang gõ dở/không hợp lệ); onPick báo mục thư viện vừa chọn (để điền sẵn tên). */
export function PrefixPick({ value, onChange, onPick, ownKey }: { value: string; onChange: (code: string) => void; onPick?: (it: LibItem) => void; ownKey?: string }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [mk, setMk] = useState(false), [txt, setTxt] = useState('')
  const lib = library(), libCodes = new Set(lib.map(x => x.prefix))
  const own = customGroups().filter(g => !libCodes.has(g.code))
  const cur = lib.find(x => groupOfItem(x) === value) ?? (own.find(g => g.code === value) ? { prefix: value, en: '', vn: own.find(g => g.code === value)!.vn, cat: 'Tự tạo' } as LibItem : null)
  const err = mk && txt ? (libCodes.has(txt) ? `“${txt}” đã có trong thư viện – hãy chọn trong danh sách` : newPrefixError(txt, ownKey)) : ''
  const items = searchLib(q)
  const cats = [...LIB_CATS, ''].filter(c => c === '' ? false : items.some(x => x.cat === c))
  return <div className="pfx-pick">
    <button type="button" className="pfx-cur" onClick={() => setOpen(!open)}>{mk ? '＋ Tạo tiền tố mới' : cur ? <><b>{cur.prefix}</b> – {cur.vn}{cur.en ? <span className="muted"> · {cur.en}</span> : null}</> : value ? value : 'Chọn từ thư viện…'} <span style={{ marginLeft: 'auto' }}>{open ? '▴' : '▾'}</span></button>
    {open && <div className="pfx-panel">
      <input autoFocus data-lang="none" placeholder="Tìm: mã, tên Việt hoặc English (vd: epoxy, đá, EPX…)" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%' }} />
      <div className="pfx-list">
        {cats.map(c => <div key={c}><div className="pfx-cat">{c}</div>{items.filter(x => x.cat === c).map(x => (
          <div key={x.prefix} className={'pfx-row' + (groupOfItem(x) === value ? ' on' : '')} onClick={() => { setMk(false); onChange(groupOfItem(x)); onPick?.(x); setOpen(false) }}>
            <b>{x.prefix}</b><span>{x.vn}<span className="muted small"> · {x.en}</span></span></div>))}</div>)}
        {own.filter(g => !q || (g.code + g.vn).toLowerCase().includes(q.toLowerCase())).map(g => <div key={g.code} className={'pfx-row' + (g.code === value ? ' on' : '')} onClick={() => { setMk(false); onChange(g.code); setOpen(false) }}><b>{g.code}</b><span>{g.vn}<span className="muted small"> · tự tạo</span></span></div>)}
        {!items.length && <div className="muted small" style={{ padding: 8 }}>Không thấy trong thư viện – dùng “Tạo tiền tố mới”.</div>}
      </div>
      <div className="pfx-row add" onClick={() => { setMk(true); setTxt(q.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)); onChange(''); setOpen(false) }}>＋ Tạo tiền tố mới (nếu chưa có trong thư viện)…</div>
    </div>}
    {mk && <div className="row gap" style={{ marginTop: 6, alignItems: 'center' }}>
      <input autoFocus placeholder="vd: EPX" maxLength={5} value={txt} style={{ width: 110, textTransform: 'uppercase' }} data-lang="none"
        onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); setTxt(v); onChange(v && !libCodes.has(v) && !newPrefixError(v, ownKey) ? v : '') }} />
      <span className="small" style={{ color: err ? '#b3261e' : '#777' }}>{err || 'Mã vật liệu trong nhóm sẽ là ' + (txt || 'XXX') + '-01, ' + (txt || 'XXX') + '-02…'}</span>
    </div>}
  </div>
}

/** Tạo thêm một nhóm vật liệu (hạng mục) mới cho dự án: có tên VN/EN, nằm trong một nhóm lớn A–D, và dùng một tiền tố ký hiệu có sẵn */
export default function NewSection({ d, onClose, onDone }: { d: ProjectData; onClose: () => void; onDone: (key: string) => void }) {
  const [vn, setVn] = useState(''), [en, setEn] = useState(''), [band, setBand] = useState(bandKeys().includes('B') ? 'B' : bandKeys()[0]), [group, setGroup] = useState(defGroup(bandKeys().includes('B') ? 'B' : bandKeys()[0])), [busy, setBusy] = useState(false)
  const save = async () => {
    if (!d.project || !vn.trim()) return
    setBusy(true)
    const key = `c_${slug(vn) || 'nhom'}_${Math.random().toString(36).slice(2, 6)}`
    const list = [...(d.project.custom_sections ?? []), { key, vn: vn.trim().toUpperCase(), en: (en.trim() || vn.trim()).toUpperCase(), band, group }]
    const { error } = await supabase.from('projects').update({ custom_sections: list }).eq('id', d.project.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    toast(`Đã tạo nhóm “${vn.trim()}”`, 'ok'); await d.reload(); onDone(key)
  }
  return (
    <div className="modal-bg center" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onMouseDown={e => e.stopPropagation()}>
        <div className="row between"><h3 style={{ margin: 0 }}>＋ Tạo nhóm vật liệu mới</h3><button className="btn ghost sm" onClick={onClose}>✕</button></div>
        <p className="small muted">Nhóm mới xuất hiện cùng hàng với các nhóm khác, có trong bảng, file Excel và bản in của dự án này. Sau khi tạo, vào cột “Hạng mục” của một vật liệu để chuyển nó sang nhóm mới, hoặc bấm “＋ Thêm vật liệu” trong nhóm.</p>
        <div className="stack">
          <label className="fld">Tên nhóm (tiếng Việt)<input data-lang="name" autoFocus value={vn} onChange={e => setVn(e.target.value)} placeholder="vd: BIỂN HIỆU – LOGO" /></label>
          <label className="fld">Tên nhóm (English)<input data-lang="name" value={en} onChange={e => setEn(e.target.value)} placeholder="vd: SIGNAGE & LOGO (để trống = lấy tên Việt)" /></label>
          <label className="fld">Nằm trong nhóm lớn
            <select value={band} onChange={e => { setBand(e.target.value); setGroup(defGroup(e.target.value)) }}>{bandKeys().map(b => <option key={b} value={b}>{bandTitle(b, 'vn')}</option>)}</select></label>
          <div className="fld">Tiền tố ký hiệu của các mã trong nhóm
            <PrefixPick value={group} onChange={setGroup} onPick={it => { if (!vn.trim()) setVn(it.vn.toUpperCase()); if (!en.trim()) setEn(it.en.toUpperCase()) }} /></div>
        </div>
        <div className="row gap" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={!vn.trim() || !group || busy} onClick={save}>{busy ? 'Đang tạo…' : 'Tạo nhóm'}</button>
        </div>
      </div>
    </div>)
}

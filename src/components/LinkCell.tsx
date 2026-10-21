import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { saveEntry } from '../lib/entryLink'
import { isUrl, normalizeUrl, urlsOf, joinUrls, readProductPage, planFill, applyFill } from '../lib/productRead'
import { toast } from '../lib/toast'
import type { Entry } from '../lib/types'
import ProductReadDialog from './ProductReadDialog'
import type { ProjectData } from '../lib/useProject'

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

/** Ô "Link sản phẩm": có link thì hiện dạng liên kết (bấm = mở tab mới); dán link mới thì tự đọc thông số kỹ thuật điền vào các ô còn trống */
export default function LinkCell({ d, e }: { d: ProjectData; e: Entry }) {
  const { canEdit } = useAuth()
  const [edit, setEdit] = useState<number | null>(null)   // -1 = đang thêm link mới, i = đang sửa link thứ i
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [dlg, setDlg] = useState(false)
  const urls = urlsOf(e.product_url)

  const commit = async () => {
    const at = edit; setEdit(null)
    if (at == null) return
    const nu = normalizeUrl(v)
    const next = [...urls]
    if (at === -1) { if (nu) next.push(nu) } else if (nu) next[at] = nu; else next.splice(at, 1)
    const j = joinUrls(next)
    if (j === joinUrls(urls)) return
    const err = await saveEntry(e, { product_url: j || null })
    if (err) { alert(err.message); return }
    const first = urlsOf(j)[0]
    if (first && isUrl(first) && first !== urls[0]) await autoRead({ ...e, product_url: j }, first); else d.reload()
  }
  const remove = async (i: number) => {
    const next = urls.filter((_, k) => k !== i)
    const err = await saveEntry(e, { product_url: joinUrls(next) || null })
    if (err) alert(err.message); else d.reload()
  }
  const autoRead = async (ent: Entry, u: string) => {
    setBusy(true)
    try {
      const ex = await readProductPage(u)
      const ch = planFill(ent, ex, false)
      const er = await applyFill(ent, ch)
      if (er) toast(er.message)
      else toast(ch.length ? `Đã đọc link ${host(u)}: điền ${ch.length} ô (${ch.map(c => c.label).join(', ')})` : `Đã đọc link ${host(u)} – các ô đã có thông tin nên không ghi đè`, 'ok')
    } catch (er) { toast('Lưu link rồi, nhưng chưa đọc được thông số: ' + String((er as Error).message ?? er)) }
    setBusy(false); d.reload()
  }
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation()
  const input = (ph: string) => (
    <input className="link-in" autoFocus placeholder={ph} value={v}
      onClick={stop} onChange={x => setV(x.target.value)} onBlur={commit}
      onKeyDown={x => { if (x.key === 'Enter') (x.target as HTMLInputElement).blur(); if (x.key === 'Escape') { setV(''); setEdit(null) } }}
      onPaste={x => { const t = x.clipboardData.getData('text'); if (isUrl(t)) { x.preventDefault(); setV(t); setTimeout(() => (x.target as HTMLInputElement).blur(), 0) } }} />
  )

  if (!urls.length && edit == null) return (
    <input className="link-in" readOnly={!canEdit} placeholder="Dán link sản phẩm (tự đọc thông số)" value="" onClick={stop}
      onFocus={() => { if (canEdit) { setV(''); setEdit(-1) } }} onChange={() => {}} />
  )
  if (!urls.length) return input('Dán link sản phẩm (tự đọc thông số)')
  return (
    <div onClick={stop}>
      {urls.map((url, i) => edit === i ? <div key={i} className="link-cell">{input('Sửa link (để trống = xoá)')}</div> : (
        <div className="link-cell" key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer" title={url} className={'link-a' + (isUrl(url) ? '' : ' bad')}>🔗 {host(url)}</a>
          {i === 0 && busy ? <span className="small muted">đang đọc…</span> : canEdit && <>
            {i === 0 && <button className="link-b" title="Đọc lại thông số kỹ thuật từ link chính (link đầu)" onClick={() => setDlg(true)}>↻</button>}
            <button className="link-b" title="Sửa link" onClick={() => { setV(url); setEdit(i) }}>✎</button>
            {urls.length > 1 && <button className="link-b" title="Xoá link này" onClick={() => remove(i)}>✕</button>}</>}
        </div>))}
      {canEdit && edit === -1 && <div className="link-cell">{input('Dán link sản phẩm khác')}</div>}
      {canEdit && edit !== -1 && <div className="link-cell"><button className="link-b" title="Thêm link sản phẩm khác (nhiều nhà cung cấp/mẫu tương đương)" onClick={() => { setV(''); setEdit(-1) }}>＋ link</button></div>}
      {dlg && <ProductReadDialog d={d} entry={e} onClose={() => setDlg(false)} />}
    </div>
  )
}

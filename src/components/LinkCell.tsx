import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { saveEntry } from '../lib/entryLink'
import { isUrl, normalizeUrl, readProductPage, planFill, applyFill } from '../lib/productRead'
import { toast } from '../lib/toast'
import type { Entry } from '../lib/types'
import ProductReadDialog from './ProductReadDialog'
import type { ProjectData } from '../lib/useProject'

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

/** Ô "Link sản phẩm": có link thì hiện dạng liên kết (bấm = mở tab mới); dán link mới thì tự đọc thông số kỹ thuật điền vào các ô còn trống */
export default function LinkCell({ d, e }: { d: ProjectData; e: Entry }) {
  const { canEdit } = useAuth()
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [dlg, setDlg] = useState(false)
  const url = e.product_url ?? ''

  const commit = async () => {
    const nu = normalizeUrl(v); setEdit(false)
    if (nu === url) return
    const err = await saveEntry(e, { product_url: nu || null })
    if (err) { alert(err.message); return }
    if (nu && isUrl(nu)) await autoRead({ ...e, product_url: nu }, nu); else d.reload()
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

  if (edit || !url) return (
    <input className="link-in" autoFocus={edit} readOnly={!canEdit} placeholder="Dán link sản phẩm (tự đọc thông số)" value={edit ? v : ''}
      onClick={stop} onFocus={() => { if (!edit && canEdit) { setV(url); setEdit(true) } }} onChange={x => setV(x.target.value)} onBlur={commit}
      onKeyDown={x => { if (x.key === 'Enter') (x.target as HTMLInputElement).blur(); if (x.key === 'Escape') { setV(url); setEdit(false) } }}
      onPaste={x => { const t = x.clipboardData.getData('text'); if (isUrl(t)) { x.preventDefault(); setV(t); setTimeout(() => (x.target as HTMLInputElement).blur(), 0) } }} />
  )
  return (
    <div className="link-cell" onClick={stop}>
      <a href={url} target="_blank" rel="noopener noreferrer" title={url} className={'link-a' + (isUrl(url) ? '' : ' bad')}>🔗 {host(url)}</a>
      {busy ? <span className="small muted">đang đọc…</span> : canEdit && <>
        <button className="link-b" title="Đọc lại thông số kỹ thuật từ link" onClick={() => setDlg(true)}>↻</button>
        <button className="link-b" title="Sửa link" onClick={() => { setV(url); setEdit(true) }}>✎</button></>}
      {dlg && <ProductReadDialog d={d} entry={e} onClose={() => setDlg(false)} />}
    </div>
  )
}

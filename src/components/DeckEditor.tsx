import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PW, PH } from '../lib/sheetLayout'
import { PAPER, PAGE_TYPES, styleOf, newPage, type Deck, type DeckPage, type PageType } from '../lib/deck'
import { signedUrls } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import { jpegPdf } from '../lib/miniPdf'
import { toast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import DeckPageSvg from './DeckPageSvg'
import type { ProjectData } from '../lib/useProject'

const toData = async (url: string) => { const b = await (await fetch(url)).blob(); return await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b) }) }
const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }

export default function DeckEditor({ d, deck, update }: { d: ProjectData; deck: Deck; update: (fn: (x: Deck) => Deck) => void }) {
  const { canEdit } = useAuth()
  const theme = styleOf(deck.style).theme
  const [sel, setSel] = useState(deck.pages[0]?.id ?? '')
  const page = deck.pages.find(p => p.id === sel) ?? deck.pages[0]
  const [urls, setUrls] = useState<Record<string, string>>(d.urls)
  const [busy, setBusy] = useState(false), [menu, setMenu] = useState(-1)
  const file = useRef<HTMLInputElement>(null), slot = useRef('')
  const proj = d.project!
  useEffect(() => {
    const need = deck.pages.flatMap(p => Object.values(p.img ?? {})).filter(x => x && !urls[x])
    if (need.length) signedUrls(need).then(u => setUrls(c => ({ ...c, ...u }))).catch(() => {})
  }, [deck]) // eslint-disable-line
  const upd = (id: string, patch: Partial<DeckPage>) => update(x => ({ ...x, pages: x.pages.map(p => (p.id === id ? { ...p, ...patch } : p)) }))
  const onFile = async (f?: File) => {
    if (!f || !page) return
    setBusy(true)
    try {
      // Nén về cạnh dài ≤ 3500 px (đủ nét A2 ≈ 150 dpi, A3 ≈ 215 dpi), JPEG – ảnh gốc quá nặng tự được giảm
      const path = await uploadImage(f, `${proj.id}/deck/${page.id}-${slot.current}-${Date.now()}.jpg`, 3500)
      upd(page.id, { img: { ...page.img, [slot.current]: path } })
    } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  const move = (i: number, dir: number) => update(x => { const a = [...x.pages], j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, pages: a } })
  const add = (t: PageType, at = deck.pages.length) => { const p = newPage(t); update(x => { const a = [...x.pages]; a.splice(at, 0, p); return { ...x, pages: a } }); setSel(p.id); setMenu(-1) }
  const del = (id: string) => { if (!confirm('Xoá trang này?')) return; update(x => ({ ...x, pages: x.pages.filter(p => p.id !== id) })); setSel('') }
  const dup = (p: DeckPage) => { const c = { ...p, id: Math.random().toString(36).slice(2, 9), img: { ...p.img } }; update(x => { const i = x.pages.findIndex(q => q.id === p.id); const a = [...x.pages]; a.splice(i + 1, 0, c); return { ...x, pages: a } }); setSel(c.id) }

  const raster = async (p: DeckPage, no: number, scale: number) => {
    // ảnh nhúng dạng data URL để SVG → canvas không bị chặn
    const map: Record<string, string> = {}
    for (const path of Object.values(p.img ?? {})) if (path && urls[path]) map[path] = await toData(urls[path])
    const svg = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}><DeckPageSvg page={p} theme={theme} project={proj.name} no={no} url={q => map[q]} /></svg>).replace(/<g class="ui-only">.*?<\/g>/g, '')
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const im = new Image(); await new Promise<void>((ok, no2) => { im.onload = () => ok(); im.onerror = () => no2(new Error('Không dựng được trang')); im.src = u })
    const c = document.createElement('canvas'); c.width = PW * scale; c.height = PH * scale
    const g = c.getContext('2d')!; g.fillStyle = theme.bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u)
    return c
  }
  const fname = (proj.name || 'concept').replace(/[^\p{L}\d]+/gu, '_')
  const exportAll = async (kind: 'pdf' | 'png') => {
    setBusy(true)
    try {
      const sz = PAPER[deck.size]
      if (kind === 'png') { const i = Math.max(0, deck.pages.findIndex(p => p.id === page?.id)); const c = await raster(deck.pages[i], i + 1, sz.scale); c.toBlob(b => b && save(b, `${fname}_trang${i + 1}.png`), 'image/png') }
      else {
        const out = []
        for (let i = 0; i < deck.pages.length; i++) { const c = await raster(deck.pages[i], i + 1, sz.scale); const b: Blob = await new Promise(ok => c.toBlob(x => ok(x!), 'image/jpeg', 0.92)); out.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height, pt: sz.pt }) }
        save(jpegPdf(out), `${fname}_${deck.size}.pdf`)
      }
    } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  const url = (p: string) => urls[p]
  return (
    <div className="card concept">
      <div className="row between wrap"><h3 style={{ margin: 0 }}>Bộ trang concept <span className="muted small">– style: {styleOf(deck.style).name}</span></h3>
        <div className="row gap wrap">
          <label className="small">Khổ in <select value={deck.size} onChange={e => update(x => ({ ...x, size: e.target.value as Deck['size'] }))}>{(Object.keys(PAPER) as (keyof typeof PAPER)[]).map(k => <option key={k} value={k}>{PAPER[k].label}</option>)}</select></label>
          <button className="btn sm primary" disabled={busy} onClick={() => exportAll('pdf')}>⬇ PDF cả bộ</button>
          <button className="btn sm" disabled={busy || !page} onClick={() => exportAll('png')}>⬇ PNG trang này</button>
        </div></div>
      <div className="small muted">Trang “Mặt bằng tổng” từng tầng nằm ở phần bên dưới (xuất riêng). Ảnh tải lên tự nén về cạnh dài ≤ 3500 px – đủ nét in A3, vẫn nhẹ.</div>
      <div className="deck-main">
        <div className="deck-scroll">
          {canEdit && <AddBar at={0} menu={menu} setMenu={setMenu} add={add} />}
          {deck.pages.map((p, i) => <div key={p.id}>
            <div className={'deck-pg' + (page?.id === p.id ? ' on' : '')} onClick={() => setSel(p.id)}>
              <div className="deck-pg-h"><span>{i + 1}. {PAGE_TYPES[p.type].label}</span>
                {canEdit && <span className="row gap sm-gap" onClick={e => e.stopPropagation()}>
                  <button className="btn ghost sm" title="Đưa lên" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn ghost sm" title="Đưa xuống" disabled={i === deck.pages.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn ghost sm" title="Nhân đôi" onClick={() => dup(p)}>⧉</button>
                  <button className="btn ghost sm danger" title="Xoá trang" onClick={() => del(p.id)}>🗑</button></span>}</div>
              <svg className="deck-page" viewBox={`0 0 ${PW} ${PH}`}><DeckPageSvg page={p} theme={theme} project={proj.name} no={i + 1} url={url} onSlot={canEdit ? k => { setSel(p.id); slot.current = k; file.current?.click() } : undefined} /></svg>
            </div>
            {canEdit && <AddBar at={i + 1} menu={menu} setMenu={setMenu} add={add} />}
          </div>)}
        </div>
        {page && <div className="stack deck-form">
          <b>Trang {deck.pages.indexOf(page) + 1}: {PAGE_TYPES[page.type].label}</b> <span className="muted small">{PAGE_TYPES[page.type].hint}</span>
          {(page.type === 'zone' || page.type === 'render') && <label className="small">Tên công trình (đầu trang)<input value={page.brand ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { brand: e.target.value })} /></label>}
          {(page.type === 'zone' || page.type === 'render') && <label className="small">Dòng tiêu đề góc phải<input value={page.head ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { head: e.target.value })} /></label>}
          <label className="small">{page.type === 'render' ? 'Tên không gian (EN)' : 'Tiêu đề'}<input value={page.title ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { title: e.target.value })} /></label>
          {(page.type === 'cover' || page.type === 'render') && <label className="small">{page.type === 'render' ? 'Tên tiếng Việt' : 'Dòng phụ'}<input value={page.subtitle ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { subtitle: e.target.value })} /></label>}
          {page.type === 'render' && <label className="small">Diện tích<input value={page.area ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { area: e.target.value })} /></label>}
          {page.type !== 'zone' && <label className="small">{{ cover: 'Địa chỉ (dải cam)', render: 'Mô tả (cột xám)', closing: 'Nội dung', zone: '' }[page.type]}<textarea rows={page.type === 'render' ? 6 : 3} value={page.body ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { body: e.target.value })} /></label>}
          {page.type === 'zone' && <label className="small">Ghi chú diện tích – mỗi dòng: <i>TÊN (tên VN)|S=…M²</i><textarea rows={10} value={page.notes ?? ''} disabled={!canEdit} onChange={e => upd(page.id, { notes: e.target.value })} /></label>}
          {PAGE_TYPES[page.type].slots.map(s => <div key={s.key} className="row gap small"><span>{s.label}:</span>
            <button className="btn sm" disabled={!canEdit || busy} onClick={() => { slot.current = s.key; file.current?.click() }}>{page.img?.[s.key] ? 'Đổi ảnh' : 'Tải ảnh'}</button>
            {page.img?.[s.key] && canEdit && <button className="btn ghost sm danger" onClick={() => { const { [s.key]: _x, ...rest } = page.img!; void _x; upd(page.id, { img: rest }) }}>Bỏ ảnh</button>}</div>)}
          <div className="small muted">Bấm thẳng vào ô ảnh trên trang để tải ảnh.</div>
          {busy && <div className="small muted"><span className="spinner" /> Đang xử lý…</div>}
        </div>}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function AddBar({ at, menu, setMenu, add }: { at: number; menu: number; setMenu: (n: number) => void; add: (t: PageType, at: number) => void }) {
  return <div className="deck-addbar">
    {menu === at ? <div className="row gap wrap">{(Object.keys(PAGE_TYPES) as PageType[]).map(t => <button key={t} className="btn sm" onClick={() => add(t, at)}>{PAGE_TYPES[t].label}</button>)}<button className="btn ghost sm" onClick={() => setMenu(-1)}>✕</button></div>
      : <button className="btn ghost sm" onClick={() => setMenu(at)}>＋ Thêm trang</button>}
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PW, PH } from '../lib/sheetLayout'
import { PAPER, PAGE_TYPES, styleOf, newPage, normDeck, elHeight, fontStack, uid, type Deck, type DeckPage, type El, type PageType } from '../lib/deck'
import { signedUrls } from '../lib/supabase'
import { uploadImage } from '../lib/imageUpload'
import { jpegPdf } from '../lib/miniPdf'
import { toast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import DeckPageSvg from './DeckPageSvg'
import type { ProjectData } from '../lib/useProject'

const toData = async (url: string) => { const b = await (await fetch(url)).blob(); return await new Promise<string>(ok => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b) }) }
const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }
const svgPt = (svg: SVGSVGElement, ev: { clientX: number; clientY: number }) => { const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svg.getScreenCTM()!.inverse()); return { x: p.x, y: p.y } }
type Sel = { pid: string; ids: string[] }
type Drag = { mode: 'move' | 'resize' | 'rotate' | 'marquee'; pid: string; svg: SVGSVGElement; p0: { x: number; y: number }; orig: El[]; h?: string; moved: boolean; shift: boolean }
const HANDLES: Record<string, [number, number]> = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] }
const rotPt = (x: number, y: number, deg: number) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return { x: x * c - y * s, y: x * s + y * c } }

function Color({ value, onChange, palette, none }: { value?: string; onChange: (v: string) => void; palette: string[]; none?: boolean }) {
  return <div className="deck-colors">
    {palette.map(c => <button key={c} type="button" className={'deck-sw' + (value === c ? ' on' : '')} style={{ background: c }} title={c} onClick={() => onChange(c)} />)}
    {none && <button type="button" className={'deck-sw none' + (!value || value === 'none' ? ' on' : '')} title="Không màu" onClick={() => onChange('none')}>⌀</button>}
    <input type="color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000'} onChange={e => onChange(e.target.value)} title="Chọn màu khác" />
  </div>
}
function Num({ label, value, onChange, step = 1, min, w = 64 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; w?: number }) {
  return <label className="small deck-num">{label}<input type="number" step={step} min={min} style={{ width: w }} value={Math.round(value * 100) / 100} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }} /></label>
}

export default function DeckEditor({ d, deck: rawDeck, update }: { d: ProjectData; deck: Deck; update: (fn: (x: Deck) => Deck) => void }) {
  const { canEdit } = useAuth()
  const deck = normDeck(rawDeck)
  const theme = styleOf(deck.style).theme
  const [sel, setSel] = useState<Sel>({ pid: '', ids: [] })
  const [editing, setEditing] = useState<{ pid: string; id: string } | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>(d.urls)
  const [busy, setBusy] = useState(false), [menu, setMenu] = useState(-1)
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] })
  const [marq, setMarq] = useState<{ pid: string; x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [colW, setColW] = useState(900)
  const file = useRef<HTMLInputElement>(null), fileFor = useRef<{ pid: string; id?: string } | null>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null), clip = useRef<El[]>([])
  const past = useRef<Deck[]>([]), future = useRef<Deck[]>([]), lastPush = useRef(0)
  const proj = d.project!
  const st = useRef({ deck, sel, editing, canEdit }); st.current = { deck, sel, editing, canEdit }
  const pageOf = (pid: string) => deck.pages.find(p => p.id === pid)
  const selPage = pageOf(sel.pid)
  const selEls = (selPage?.els ?? []).filter(e => sel.ids.includes(e.id))
  const one = selEls.length === 1 ? selEls[0] : null

  useEffect(() => {
    const need = deck.pages.flatMap(p => (p.els ?? []).map(e => e.src ?? '')).filter(x => x && !urls[x])
    if (need.length) signedUrls(need).then(u => setUrls(c => ({ ...c, ...u }))).catch(() => {})
  }, [rawDeck]) // eslint-disable-line
  useEffect(() => { const el = colRef.current; if (!el) return; const ro = new ResizeObserver(() => setColW(Math.max(300, el.clientWidth - 28))); ro.observe(el); return () => ro.disconnect() }, [])
  const k = PW / colW

  // ---- lịch sử hoàn tác ----
  const pushHist = (merge = false) => { const now = Date.now(); if (merge && now - lastPush.current < 700) return; lastPush.current = now; past.current.push(st.current.deck); if (past.current.length > 80) past.current.shift(); future.current = [] }
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(st.current.deck); update(() => p); setEditing(null) }
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(st.current.deck); update(() => n) }
  const setEls = (pid: string, fn: (els: El[]) => El[]) => update(x => { const b = normDeck(x); return { ...b, pages: b.pages.map(p => (p.id === pid ? { ...p, els: fn(p.els ?? []) } : p)) } })
  const patch = (ids: string[], v: Partial<El> | ((e: El) => Partial<El>), merge = true) => { if (!sel.pid) return; pushHist(merge); setEls(sel.pid, els => els.map(e => (ids.includes(e.id) ? { ...e, ...(typeof v === 'function' ? v(e) : v) } : e))) }
  const upPage = (pid: string, v: Partial<DeckPage>) => { pushHist(true); update(x => { const b = normDeck(x); return { ...b, pages: b.pages.map(p => (p.id === pid ? { ...p, ...v } : p)) } }) }

  // ---- thêm / xoá / sắp xếp trang ----
  const move = (i: number, dir: number) => { pushHist(); update(x => { const b = normDeck(x), a = [...b.pages], j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...b, pages: a } }) }
  const addPage = (t: PageType, at = deck.pages.length) => { pushHist(); const p = newPage(t, theme); update(x => { const b = normDeck(x), a = [...b.pages]; a.splice(at, 0, p); return { ...b, pages: a } }); setSel({ pid: p.id, ids: [] }); setMenu(-1) }
  const delPage = (id: string) => { if (!confirm('Xoá trang này?')) return; pushHist(); update(x => { const b = normDeck(x); return { ...b, pages: b.pages.filter(p => p.id !== id) } }); setSel({ pid: '', ids: [] }) }
  const dupPage = (p: DeckPage) => { pushHist(); const c = { ...p, id: uid(), els: (p.els ?? []).map(e => ({ ...e, id: uid() })) }; update(x => { const b = normDeck(x), i = b.pages.findIndex(q => q.id === p.id), a = [...b.pages]; a.splice(i + 1, 0, c); return { ...b, pages: a } }); setSel({ pid: c.id, ids: [] }) }

  // ---- thêm phần tử ----
  const addEl = (e: El) => { if (!sel.pid && !deck.pages[0]) return; const pid = sel.pid || deck.pages[0].id; pushHist(); setEls(pid, els => [...els, e]); setSel({ pid, ids: [e.id] }); return e }
  const addText = () => { const e = addEl({ id: uid(), k: 'text', x: 660, y: 480, w: 600, h: 0, t: 'Nhấn đúp để sửa chữ', size: 48, c: theme.ink, f: 'sans', lh: 1.3, al: 'start' }); if (e) setEditing({ pid: sel.pid || deck.pages[0].id, id: e.id }) }
  const addRect = () => addEl({ id: uid(), k: 'rect', x: 760, y: 440, w: 400, h: 200, fill: theme.orange })
  const addFrame = () => addEl({ id: uid(), k: 'image', x: 560, y: 240, w: 800, h: 600, label: 'Ảnh', fit: 'cover', fill: theme.slot })
  const delSel = () => { if (!sel.pid || !sel.ids.length) return; pushHist(); setEls(sel.pid, els => els.filter(e => !sel.ids.includes(e.id))); setSel({ pid: sel.pid, ids: [] }) }
  const dupSel = () => { if (!selEls.length) return; pushHist(); const cp = selEls.map(e => ({ ...e, id: uid(), x: e.x + 24, y: e.y + 24 })); setEls(sel.pid, els => [...els, ...cp]); setSel({ pid: sel.pid, ids: cp.map(e => e.id) }) }
  const order = (how: 'front' | 'back' | 'up' | 'down') => { if (!sel.pid) return; pushHist(); setEls(sel.pid, els => { const ids = sel.ids, chosen = els.filter(e => ids.includes(e.id)), rest = els.filter(e => !ids.includes(e.id))
    if (how === 'front') return [...rest, ...chosen]; if (how === 'back') return [...chosen, ...rest]
    const a = [...els]; const idx = a.map((e, i) => (ids.includes(e.id) ? i : -1)).filter(i => i >= 0); if (how === 'up') idx.reverse()
    for (const i of idx) { const j = how === 'up' ? i + 1 : i - 1; if (j < 0 || j >= a.length || ids.includes(a[j].id)) continue;[a[i], a[j]] = [a[j], a[i]] } return a }) }
  const align = (kind: 'l' | 'c' | 'r' | 't' | 'm' | 'b') => {
    if (!selEls.length) return
    const bx = selEls.map(e => ({ e, h: elHeight(e, theme) }))
    const R = selEls.length > 1 ? { x0: Math.min(...bx.map(b => b.e.x)), x1: Math.max(...bx.map(b => b.e.x + b.e.w)), y0: Math.min(...bx.map(b => b.e.y)), y1: Math.max(...bx.map(b => b.e.y + b.h)) } : { x0: 0, x1: PW, y0: 0, y1: PH }
    pushHist(); setEls(sel.pid, els => els.map(e => { const b = bx.find(q => q.e.id === e.id); if (!b) return e
      if (kind === 'l') return { ...e, x: R.x0 }; if (kind === 'r') return { ...e, x: R.x1 - e.w }; if (kind === 'c') return { ...e, x: (R.x0 + R.x1) / 2 - e.w / 2 }
      if (kind === 't') return { ...e, y: R.y0 }; if (kind === 'b') return { ...e, y: R.y1 - b.h }; return { ...e, y: (R.y0 + R.y1) / 2 - b.h / 2 } })) }

  // ---- ảnh ----
  const onFile = async (f?: File) => {
    const tg = fileFor.current; if (!f || !tg) return
    setBusy(true)
    try {
      let dims = { w: 800, h: 600 }
      try { const bm = await createImageBitmap(f); dims = { w: bm.width, h: bm.height }; bm.close() } catch { /* giữ mặc định */ }
      // Nén về cạnh dài ≤ 3500 px (đủ nét in), JPEG – ảnh gốc quá nặng tự được giảm
      const path = await uploadImage(f, `${proj.id}/deck/${tg.pid}-${Date.now()}.jpg`, 3500)
      pushHist()
      if (tg.id) setEls(tg.pid, els => els.map(e => (e.id === tg.id ? { ...e, src: path } : e)))
      else { const r = Math.min(1, 1100 / dims.w, 800 / dims.h), w = dims.w * r, h = dims.h * r, e: El = { id: uid(), k: 'image', x: (PW - w) / 2, y: (PH - h) / 2, w, h, fit: 'cover', src: path }; setEls(tg.pid, els => [...els, e]); setSel({ pid: tg.pid, ids: [e.id] }) }
    } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  const pickImage = (pid: string, id?: string) => { fileFor.current = { pid, id }; file.current?.click() }
  const onDrop = (pid: string, ev: React.DragEvent<HTMLDivElement>) => {
    const f = ev.dataTransfer.files?.[0]; if (!f || !f.type.startsWith('image/')) return
    ev.preventDefault()
    const svg = ev.currentTarget.querySelector('svg')!, p = svgPt(svg as SVGSVGElement, ev), pg = pageOf(pid)
    const hit = [...(pg?.els ?? [])].reverse().find(e => e.k === 'image' && p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h)
    fileFor.current = { pid, id: hit?.id }; onFile(f)
  }

  // ---- thao tác chuột trên trang ----
  const snapMove = (pid: string, orig: El[], dx: number, dy: number) => {
    const pg = pageOf(pid)!, others = (pg.els ?? []).filter(e => !orig.some(o => o.id === e.id))
    const bb = orig.map(o => ({ x: o.x, y: o.y, w: o.w, h: elHeight(o, theme) }))
    const x0 = Math.min(...bb.map(b => b.x)), x1 = Math.max(...bb.map(b => b.x + b.w)), y0 = Math.min(...bb.map(b => b.y)), y1 = Math.max(...bb.map(b => b.y + b.h))
    const tx = [0, PW / 2, PW], ty = [0, PH / 2, PH]
    for (const o of others) { const h = elHeight(o, theme); tx.push(o.x, o.x + o.w / 2, o.x + o.w); ty.push(o.y, o.y + h / 2, o.y + h) }
    const thr = 7 * k
    const best = (refs: number[], ts: number[]) => { let bd = thr + 1, bs = 0, line = NaN; for (const r of refs) for (const t of ts) { const dd = t - r; if (Math.abs(dd) < bd) { bd = Math.abs(dd); bs = dd; line = t } } return bd <= thr ? { s: bs, line } : null }
    const sx = best([x0 + dx, (x0 + x1) / 2 + dx, x1 + dx], tx), sy = best([y0 + dy, (y0 + y1) / 2 + dy, y1 + dy], ty)
    return { dx: dx + (sx?.s ?? 0), dy: dy + (sy?.s ?? 0), v: sx ? [sx.line] : [], h: sy ? [sy.line] : [] }
  }
  const onDown = (pid: string, ev: React.PointerEvent<SVGSVGElement>) => {
    if (!canEdit || editing || ev.button !== 0) return
    const svg = ev.currentTarget, tg = ev.target as Element, p = svgPt(svg, ev)
    const hnd = tg.closest('[data-h]')?.getAttribute('data-h'), idEl = tg.closest('[data-id]')?.getAttribute('data-id')
    const pg = pageOf(pid)!, els = pg.els ?? []
    svg.setPointerCapture(ev.pointerId)
    if (hnd && sel.pid === pid && one) { drag.current = { mode: hnd === 'rot' ? 'rotate' : 'resize', pid, svg, p0: p, orig: [{ ...one }], h: hnd, moved: false, shift: ev.shiftKey }; return }
    if (idEl) {
      let ids = sel.pid === pid && sel.ids.includes(idEl) ? sel.ids : ev.shiftKey && sel.pid === pid ? [...sel.ids, idEl] : [idEl]
      if (ev.shiftKey && sel.pid === pid && sel.ids.includes(idEl) && sel.ids.length > 1) ids = sel.ids.filter(x => x !== idEl)
      setSel({ pid, ids })
      const orig = els.filter(e => ids.includes(e.id) && !e.lock).map(e => ({ ...e }))
      drag.current = { mode: 'move', pid, svg, p0: p, orig, moved: false, shift: ev.shiftKey }
      return
    }
    if (!ev.shiftKey) setSel({ pid, ids: [] })
    drag.current = { mode: 'marquee', pid, svg, p0: p, orig: [], moved: false, shift: ev.shiftKey }
    setMarq({ pid, x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMove = (pid: string, ev: React.PointerEvent<SVGSVGElement>) => {
    const dg = drag.current; if (!dg || dg.pid !== pid) return
    const p = svgPt(dg.svg, ev), dx0 = p.x - dg.p0.x, dy0 = p.y - dg.p0.y
    if (!dg.moved) { if (Math.hypot(dx0, dy0) < 3 * k) return; dg.moved = true; if (dg.mode !== 'marquee') pushHist() }
    if (dg.mode === 'marquee') { setMarq({ pid, x0: dg.p0.x, y0: dg.p0.y, x1: p.x, y1: p.y }); return }
    if (dg.mode === 'move') {
      const r = snapMove(pid, dg.orig, dx0, dy0); setGuides({ v: r.v, h: r.h })
      setEls(pid, els => els.map(e => { const o = dg.orig.find(q => q.id === e.id); return o ? { ...e, x: o.x + r.dx, y: o.y + r.dy } : e }))
    } else if (dg.mode === 'rotate') {
      const o = dg.orig[0], c = { x: o.x + o.w / 2, y: o.y + elHeight(o, theme) / 2 }
      let a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90; a = ((a % 360) + 360) % 360
      for (const t of [0, 45, 90, 135, 180, 225, 270, 315, 360]) if (Math.abs(a - t) < 4 || ev.shiftKey) { if (!ev.shiftKey) a = t % 360; break }
      if (ev.shiftKey) a = Math.round(a / 15) * 15 % 360
      setEls(pid, els => els.map(e => (e.id === o.id ? { ...e, r: Math.round(a * 10) / 10 } : e)))
    } else if (dg.mode === 'resize') {
      const o = dg.orig[0], [sx, sy] = HANDLES[dg.h!], dl = rotPt(dx0, dy0, -(o.r ?? 0)), h0 = elHeight(o, theme)
      let w = o.w + sx * dl.x, h = o.h + sy * dl.y, size = o.size
      if (o.k === 'text') { if (sy !== 0) { const s = Math.max(0.1, (o.w + sx * dl.x) / o.w); w = Math.max(30, o.w * s); size = Math.max(6, Math.round((o.size ?? 24) * s * 10) / 10) } else w = Math.max(30, w); h = o.h }
      else { if (sx !== 0 && sy !== 0 && (o.k === 'image' || ev.shiftKey)) { const s = Math.max(w / o.w, h / o.h); w = o.w * s; h = o.h * s } w = Math.max(16, w); h = Math.max(16, h) }
      const hh = o.k === 'text' ? h0 : o.h, nh = o.k === 'text' ? h0 * (size ?? 1) / (o.size ?? 1) : h
      const sh = rotPt(sx * (w - o.w) / 2, sy * (nh - hh) / 2, o.r ?? 0), cx = o.x + o.w / 2 + sh.x, cy = o.y + hh / 2 + sh.y
      setEls(pid, els => els.map(e => (e.id === o.id ? { ...e, w, h: o.k === 'text' ? e.h : h, size, x: cx - w / 2, y: cy - nh / 2 } : e)))
    }
  }
  const onUp = (pid: string, ev: React.PointerEvent<SVGSVGElement>) => {
    const dg = drag.current; drag.current = null; setGuides({ v: [], h: [] })
    try { ev.currentTarget.releasePointerCapture(ev.pointerId) } catch { /* đã nhả */ }
    if (!dg || dg.pid !== pid) return
    if (dg.mode === 'marquee') {
      const m = marq; setMarq(null); if (!m || !dg.moved) return
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1)
      const hit = (pageOf(pid)?.els ?? []).filter(e => e.x < x1 && e.x + e.w > x0 && e.y < y1 && e.y + elHeight(e, theme) > y0).map(e => e.id)
      setSel({ pid, ids: dg.shift && sel.pid === pid ? [...new Set([...sel.ids, ...hit])] : hit })
    }
  }
  const onDbl = (pid: string, ev: React.MouseEvent<SVGSVGElement>) => {
    if (!canEdit) return
    const id = (document.elementFromPoint(ev.clientX, ev.clientY) ?? (ev.target as Element)).closest('[data-id]')?.getAttribute('data-id'); if (!id) return
    const e = pageOf(pid)?.els?.find(q => q.id === id); if (!e) return
    if (e.k === 'text') { pushHist(); setSel({ pid, ids: [id] }); setEditing({ pid, id }) }
    else if (e.k === 'image') pickImage(pid, id)
  }

  // ---- phím tắt ----
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const s = st.current, tg = ev.target as HTMLElement
      if (!s.canEdit || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable) return
      const ctrl = ev.ctrlKey || ev.metaKey, key = ev.key.toLowerCase()
      if (ctrl && key === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return }
      if (ctrl && key === 'y') { ev.preventDefault(); redo(); return }
      if (!s.sel.pid) return
      const pg = s.deck.pages.find(p => p.id === s.sel.pid), els = (pg?.els ?? []).filter(e => s.sel.ids.includes(e.id))
      if (ctrl && key === 'c' && els.length) { clip.current = els.map(e => ({ ...e })); return }
      if (ctrl && key === 'v' && clip.current.length) { ev.preventDefault(); pushHist(); const cp = clip.current.map(e => ({ ...e, id: uid(), x: e.x + 24, y: e.y + 24 })); clip.current = cp.map(e => ({ ...e })); setEls(s.sel.pid, a => [...a, ...cp]); setSel({ pid: s.sel.pid, ids: cp.map(e => e.id) }); return }
      if (!els.length) return
      if (ctrl && key === 'd') { ev.preventDefault(); dupSel(); return }
      if (key === 'delete' || key === 'backspace') { ev.preventDefault(); delSel(); return }
      if (key === 'escape') { setSel({ pid: s.sel.pid, ids: [] }); return }
      const dd = ev.shiftKey ? 10 : 1, mv = ({ arrowleft: [-dd, 0], arrowright: [dd, 0], arrowup: [0, -dd], arrowdown: [0, dd] } as Record<string, number[]>)[key]
      if (mv) { ev.preventDefault(); pushHist(true); setEls(s.sel.pid, a => a.map(e => (s.sel.ids.includes(e.id) && !e.lock ? { ...e, x: e.x + mv[0], y: e.y + mv[1] } : e))) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line

  // ---- xuất ----
  const raster = async (p: DeckPage, scale: number) => {
    const map: Record<string, string> = {}
    for (const e of p.els ?? []) if (e.src && urls[e.src] && !map[e.src]) map[e.src] = await toData(urls[e.src])
    const svg = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}><DeckPageSvg page={p} theme={theme} url={q => map[q]} /></svg>).replace(/<g class="ui-only">.*?<\/g>/g, '')
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const im = new Image(); await new Promise<void>((ok, no2) => { im.onload = () => ok(); im.onerror = () => no2(new Error('Không dựng được trang')); im.src = u })
    const c = document.createElement('canvas'); c.width = PW * scale; c.height = PH * scale
    const g = c.getContext('2d')!; g.fillStyle = p.bg ?? theme.bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u)
    return c
  }
  const fname = (proj.name || 'concept').replace(/[^\p{L}\d]+/gu, '_')
  const exportAll = async (kind: 'pdf' | 'png') => {
    setBusy(true)
    try {
      const sz = PAPER[deck.size]
      if (kind === 'png') { const i = Math.max(0, deck.pages.findIndex(p => p.id === sel.pid)); const c = await raster(deck.pages[i], sz.scale); c.toBlob(b => b && save(b, `${fname}_trang${i + 1}.png`), 'image/png') }
      else {
        const out = []
        for (let i = 0; i < deck.pages.length; i++) { const c = await raster(deck.pages[i], sz.scale); const b: Blob = await new Promise(ok => c.toBlob(x => ok(x!), 'image/jpeg', 0.92)); out.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height, pt: sz.pt }) }
        save(jpegPdf(out), `${fname}_${deck.size}.pdf`)
      }
    } catch (e) { toast(String(e)) }
    setBusy(false)
  }
  const url = (p: string) => urls[p]
  const pal = [theme.rust, theme.orange, theme.taupe, theme.ink, theme.ink2, theme.red, theme.text, theme.panel, theme.bg, '#ffffff', '#000000']

  // ---- khung chọn vẽ đè lên trang ----
  const overlay = (pg: DeckPage) => {
    const ids = sel.pid === pg.id ? sel.ids : []
    const ed = editing?.pid === pg.id ? pg.els?.find(e => e.id === editing.id) : undefined
    const hs = 11 * k, lw = 1.6 * k
    return <g>
      {guides.v.map((x, i) => <line key={'v' + i} x1={x} x2={x} y1={0} y2={PH} stroke="#e91e8c" strokeWidth={lw} />)}
      {guides.h.map((y, i) => <line key={'h' + i} x1={0} x2={PW} y1={y} y2={y} stroke="#e91e8c" strokeWidth={lw} />)}
      {marq?.pid === pg.id && <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill="rgba(21,101,192,.12)" stroke="#1565c0" strokeWidth={lw} />}
      {(pg.els ?? []).filter(e => ids.includes(e.id) && editing?.id !== e.id).map(e => {
        const h = elHeight(e, theme), single = ids.length === 1 && !e.lock
        return <g key={e.id} transform={e.r ? `rotate(${e.r} ${e.x + e.w / 2} ${e.y + h / 2})` : undefined}>
          <rect x={e.x} y={e.y} width={e.w} height={h} fill="none" stroke="#1565c0" strokeWidth={lw} style={{ pointerEvents: 'none' }} />
          {single && <>
            {Object.entries(HANDLES).filter(([n]) => e.k !== 'text' || n === 'e' || n === 'w' || n.length === 2).map(([n, [sx, sy]]) =>
              <rect key={n} data-h={n} x={e.x + e.w / 2 + sx * e.w / 2 - hs / 2} y={e.y + h / 2 + sy * h / 2 - hs / 2} width={hs} height={hs} rx={hs * .25} fill="#fff" stroke="#1565c0" strokeWidth={lw} style={{ cursor: n.length === 2 ? (n === 'nw' || n === 'se' ? 'nwse-resize' : 'nesw-resize') : n === 'n' || n === 's' ? 'ns-resize' : 'ew-resize' }} />)}
            <line x1={e.x + e.w / 2} x2={e.x + e.w / 2} y1={e.y} y2={e.y - 34 * k} stroke="#1565c0" strokeWidth={lw} style={{ pointerEvents: 'none' }} />
            <circle data-h="rot" cx={e.x + e.w / 2} cy={e.y - 34 * k} r={hs * .65} fill="#fff" stroke="#1565c0" strokeWidth={lw} style={{ cursor: 'grab' }} />
          </>}
        </g>
      })}
      {ed && ed.k === 'text' && <g transform={ed.r ? `rotate(${ed.r} ${ed.x + ed.w / 2} ${ed.y + elHeight(ed, theme) / 2})` : undefined}>
        <foreignObject x={ed.x} y={ed.y} width={ed.w + 2} height={Math.max(elHeight(ed, theme), (ed.size ?? 24) * (ed.lh ?? 1.3)) + 6}>
          <textarea autoFocus value={ed.t ?? ''} onFocus={e => e.currentTarget.select()} onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
            onChange={e => { pushHist(true); const v = e.target.value; setEls(pg.id, els => els.map(q => (q.id === ed.id ? { ...q, t: v } : q))) }}
            onBlur={() => setEditing(null)} onKeyDown={e => { if (e.key === 'Escape') setEditing(null); e.stopPropagation() }}
            style={{ width: '100%', height: '100%', margin: 0, padding: 0, border: '2px solid #1565c0', outline: 'none', resize: 'none', overflow: 'hidden', background: 'rgba(255,255,255,.35)', boxSizing: 'border-box',
              fontSize: ed.size ?? 24, lineHeight: ed.lh ?? 1.3, fontFamily: fontStack(theme, ed), fontWeight: ed.b ? 'bold' : 'normal', fontStyle: ed.i ? 'italic' : 'normal', color: ed.c ?? '#000', textAlign: ed.al === 'middle' ? 'center' : ed.al === 'end' ? 'right' : 'left', letterSpacing: ed.ls ?? 0, textTransform: ed.up ? 'uppercase' : 'none' }} />
        </foreignObject></g>}
    </g>
  }

  const E = one
  return (
    <div className="card concept">
      <div className="row between wrap"><h3 style={{ margin: 0 }}>Bộ trang concept <span className="muted small">– style: {styleOf(deck.style).name}</span></h3>
        <div className="row gap wrap">
          {canEdit && <><button className="btn sm" disabled={!past.current.length} onClick={undo} title="Ctrl+Z">↶ Hoàn tác</button><button className="btn sm" disabled={!future.current.length} onClick={redo} title="Ctrl+Shift+Z">↷ Làm lại</button></>}
          <label className="small">Khổ in <select value={deck.size} onChange={e => update(x => ({ ...normDeck(x), size: e.target.value as Deck['size'] }))}>{(Object.keys(PAPER) as (keyof typeof PAPER)[]).map(k2 => <option key={k2} value={k2}>{PAPER[k2].label}</option>)}</select></label>
          <button className="btn sm primary" disabled={busy} onClick={() => exportAll('pdf')}>⬇ PDF cả bộ</button>
          <button className="btn sm" disabled={busy || !selPage} onClick={() => exportAll('png')}>⬇ PNG trang đang chọn</button>
        </div></div>
      <div className="small muted">Bấm vào chữ/ảnh/khối để chọn – kéo để di chuyển, kéo ô vuông để đổi cỡ, chấm tròn để xoay, nhấp đúp chữ để sửa, nhấp đúp ảnh để tải ảnh (hoặc kéo thả file ảnh vào). Phím: Delete xoá, mũi tên dịch, Ctrl+C/V/D, Ctrl+Z.</div>
      <div className="deck-main">
        <div className="deck-scroll" ref={colRef}>
          {canEdit && <AddBar at={0} menu={menu} setMenu={setMenu} add={addPage} />}
          {deck.pages.map((p, i) => <div key={p.id}>
            <div className={'deck-pg' + (sel.pid === p.id ? ' on' : '')} onDragOver={e => canEdit && e.preventDefault()} onDrop={e => canEdit && onDrop(p.id, e)}>
              <div className="deck-pg-h" onClick={() => setSel({ pid: p.id, ids: [] })}><span>Trang {i + 1}</span>
                {canEdit && <span className="row gap sm-gap" onClick={e => e.stopPropagation()}>
                  <button className="btn ghost sm" title="Đưa lên" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn ghost sm" title="Đưa xuống" disabled={i === deck.pages.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn ghost sm" title="Nhân đôi trang" onClick={() => dupPage(p)}>⧉</button>
                  <button className="btn ghost sm danger" title="Xoá trang" onClick={() => delPage(p.id)}>🗑</button></span>}</div>
              <svg className="deck-page" viewBox={`0 0 ${PW} ${PH}`} style={{ touchAction: 'none', cursor: canEdit ? 'default' : 'auto' }}
                onPointerDown={e => onDown(p.id, e)} onPointerMove={e => onMove(p.id, e)} onPointerUp={e => onUp(p.id, e)} onDoubleClick={e => onDbl(p.id, e)}>
                <DeckPageSvg page={p} theme={theme} url={url} hideId={editing?.pid === p.id ? editing.id : undefined} />
                {canEdit && overlay(p)}
              </svg>
            </div>
            {canEdit && <AddBar at={i + 1} menu={menu} setMenu={setMenu} add={addPage} />}
          </div>)}
        </div>
        <div className="stack deck-form">
          {canEdit && <div className="deck-tools"><b className="small">Thêm vào trang {selPage ? deck.pages.indexOf(selPage) + 1 : 1}</b>
            <div className="row gap wrap"><button className="btn sm" onClick={addText}>Aa Chữ</button><button className="btn sm" onClick={addRect}>▭ Khối màu</button><button className="btn sm" onClick={addFrame}>▣ Khung ảnh</button><button className="btn sm" onClick={() => pickImage(sel.pid || deck.pages[0]?.id)}>🖼 Tải ảnh</button></div></div>}
          {!selEls.length && selPage && <div className="stack"><b className="small">Trang {deck.pages.indexOf(selPage) + 1}</b>
            <div className="small">Màu nền</div><Color value={selPage.bg} onChange={v => upPage(selPage.id, { bg: v })} palette={pal} />
            <div className="small muted">Chọn một phần tử trên trang để chỉnh chữ, màu, vị trí…</div></div>}
          {!selPage && <div className="small muted">Bấm vào một trang để bắt đầu chỉnh.</div>}
          {selEls.length > 0 && canEdit && <div className="stack">
            <b className="small">{selEls.length > 1 ? `Đang chọn ${selEls.length} phần tử` : { text: 'Chữ', rect: 'Khối màu', image: 'Khung ảnh' }[selEls[0].k]}</b>
            {E && E.k === 'text' && <>
              <label className="small">Nội dung<textarea rows={3} value={E.t ?? ''} onChange={ev => patch([E.id], { t: ev.target.value })} /></label>
              <div className="row gap wrap"><select value={E.f ?? 'sans'} onChange={ev => patch([E.id], { f: ev.target.value as 'serif' | 'sans' }, false)}><option value="sans">Chữ không chân</option><option value="serif">Chữ có chân</option></select>
                <Num label="Cỡ" value={E.size ?? 24} min={6} step={1} onChange={v => patch([E.id], { size: v })} /></div>
              <div className="row gap wrap"><button className={'btn sm' + (E.b ? ' primary' : '')} onClick={() => patch([E.id], { b: !E.b }, false)}><b>B</b></button><button className={'btn sm' + (E.i ? ' primary' : '')} onClick={() => patch([E.id], { i: !E.i }, false)}><i>I</i></button><button className={'btn sm' + (E.up ? ' primary' : '')} onClick={() => patch([E.id], { up: !E.up }, false)}>AA</button>
                {(['start', 'middle', 'end'] as const).map((a, i) => <button key={a} className={'btn sm' + ((E.al ?? 'start') === a ? ' primary' : '')} title={['Căn trái', 'Căn giữa', 'Căn phải'][i]} onClick={() => patch([E.id], { al: a }, false)}>{['⇤', '↔', '⇥'][i]}</button>)}</div>
              <div className="small">Màu chữ</div><Color value={E.c} onChange={v => patch([E.id], { c: v })} palette={pal} />
              <div className="row gap wrap"><Num label="Giãn chữ" value={E.ls ?? 0} step={0.5} onChange={v => patch([E.id], { ls: v })} /><Num label="Giãn dòng" value={E.lh ?? 1.3} step={0.1} min={0.8} onChange={v => patch([E.id], { lh: v })} /></div>
            </>}
            {E && E.k !== 'text' && <>
              {E.k === 'image' && <div className="row gap wrap small"><button className="btn sm" disabled={busy} onClick={() => pickImage(sel.pid, E.id)}>{E.src ? 'Đổi ảnh' : 'Tải ảnh'}</button>{E.src && <button className="btn ghost sm danger" onClick={() => patch([E.id], { src: undefined }, false)}>Bỏ ảnh</button>}
                <select value={E.fit ?? 'cover'} onChange={ev => patch([E.id], { fit: ev.target.value as 'cover' | 'contain' }, false)}><option value="cover">Lấp đầy khung (cắt)</option><option value="contain">Vừa khung (không cắt)</option></select></div>}
              <div className="small">Màu nền</div><Color value={E.fill} onChange={v => patch([E.id], { fill: v })} palette={pal} none />
              <div className="small">Viền</div><Color value={E.stroke} onChange={v => patch([E.id], { stroke: v, sw: E.sw || 4 })} palette={pal} />
              <div className="row gap wrap"><Num label="Dày viền" value={E.sw ?? 0} min={0} onChange={v => patch([E.id], { sw: v })} /><Num label="Bo góc" value={E.rx ?? 0} min={0} onChange={v => patch([E.id], { rx: v })} /></div>
            </>}
            {E && <div className="row gap wrap"><Num label="X" value={E.x} onChange={v => patch([E.id], { x: v })} /><Num label="Y" value={E.y} onChange={v => patch([E.id], { y: v })} /><Num label="Rộng" value={E.w} min={10} onChange={v => patch([E.id], { w: v })} />{E.k !== 'text' && <Num label="Cao" value={E.h} min={10} onChange={v => patch([E.id], { h: v })} />}<Num label="Xoay°" value={E.r ?? 0} onChange={v => patch([E.id], { r: v })} /><Num label="Trong suốt %" value={Math.round((E.op ?? 1) * 100)} min={0} onChange={v => patch([E.id], { op: Math.max(0, Math.min(100, v)) / 100 })} w={56} /></div>}
            <div className="small">Căn {selEls.length > 1 ? 'theo nhóm' : 'theo trang'}</div>
            <div className="row gap wrap">{([['l', '⇤ Trái'], ['c', '↔ Giữa'], ['r', '⇥ Phải'], ['t', '⤒ Trên'], ['m', '↕ Giữa'], ['b', '⤓ Dưới']] as const).map(([a, l]) => <button key={a} className="btn sm" onClick={() => align(a)}>{l}</button>)}</div>
            <div className="row gap wrap"><button className="btn sm" onClick={() => order('front')}>Lên trên cùng</button><button className="btn sm" onClick={() => order('up')}>Lên 1</button><button className="btn sm" onClick={() => order('down')}>Xuống 1</button><button className="btn sm" onClick={() => order('back')}>Dưới cùng</button></div>
            <div className="row gap wrap"><button className="btn sm" onClick={dupSel}>⧉ Nhân đôi</button>{E && <button className={'btn sm' + (E.lock ? ' primary' : '')} onClick={() => patch([E.id], { lock: !E.lock }, false)}>{E.lock ? '🔒 Đã khoá' : '🔓 Khoá'}</button>}<button className="btn sm danger" onClick={delSel}>🗑 Xoá</button></div>
          </div>}
          {busy && <div className="small muted"><span className="spinner" /> Đang xử lý…</div>}
        </div>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}

function AddBar({ at, menu, setMenu, add }: { at: number; menu: number; setMenu: (n: number) => void; add: (t: PageType, at: number) => void }) {
  return <div className="deck-addbar">
    {menu === at ? <div className="row gap wrap" style={{ justifyContent: 'center' }}>{(Object.keys(PAGE_TYPES) as PageType[]).map(t => <button key={t} className="btn sm" title={PAGE_TYPES[t].hint} onClick={() => add(t, at)}>{PAGE_TYPES[t].label}</button>)}<button className="btn ghost sm" onClick={() => setMenu(-1)}>✕</button></div>
      : <button className="btn ghost sm" onClick={() => setMenu(at)}>＋ Thêm trang</button>}
  </div>
}

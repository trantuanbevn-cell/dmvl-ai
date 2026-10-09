import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { FloorPlan, SheetItem, SheetLayout } from '../lib/types'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import type { PlanPaint } from '../lib/planPaint'
import { PW, PH, roomKey, pole, layoutSheet, leader, freeSpot, snapAlign, fontOf, type Spec, type Rect } from '../lib/sheetLayout'
import { jpegPdf } from '../lib/miniPdf'
import { PAPER, type PaperSize } from '../lib/deck'
import { useVecMode } from '../lib/planSheet'

import { NEUTRAL, autoRoomColor } from '../lib/palette'
const lumOf = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255 }
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export default function ConceptSheet({ d, fp, sheet, commit, pp, busy, size = 'A3' }: { d: ProjectData; fp: FloorPlan; sheet: SheetLayout; commit: (s: SheetLayout) => void; pp: PlanPaint | null; busy: boolean; size?: PaperSize }) {
  const { canEdit } = useAuth()
  const g = fp.geometry ?? null
  const [planUrl, setPlanUrl] = useState('')
  const [vec, setVec] = useVecMode()
  const [sel, setSel] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ key: string; kind: 'box' | 'anchor'; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // ---- phòng đã đặt tên → ô tên
  const named = useMemo(() => (g?.rooms ?? []).filter(r => r.user && r.names[0]).sort((a, b) => a.id - b.id), [g])
  const allRooms = g?.rooms ?? []
  const colorOf = (key: string, i: number) => sheet.items[key]?.color ?? autoRoomColor(i)
  const idxOf = (r: { id: number }) => allRooms.findIndex(x => x.id === r.id)
  const specs: Spec[] = useMemo(() => {
    if (!pp || !g) return []
    return named.map((r, i) => ({ r, i, key: roomKey(r) })).filter(x => !sheet.items[x.key]?.hide).map(({ r, key }) => {
      const [nx, ny] = pole(r)
      return { key, roomId: r.id, vn: r.names[0], en: r.names[1] ?? '', area: sheet.items[key]?.area ?? +r.area_m2.toFixed(1), u: clamp01((nx * pp.W - pp.crop.x) / pp.crop.w), v: clamp01((ny * pp.H - pp.crop.y) / pp.crop.h) }
    })
  }, [pp, g, named, sheet])
  const showVn = sheet.showVn !== false
  const layout = useMemo(() => (pp && specs.length ? layoutSheet(specs, pp.crop.w / pp.crop.h, sheet, showVn) : null), [pp, specs, sheet, showVn])

  // ---- ảnh mặt bằng đã tô sàn
  const colorMap = useMemo(() => {
    const m = new Map<number, string>()
    if (!g) return m
    for (const r of g.raw_rooms ?? g.rooms) m.set(r.id, NEUTRAL)
    allRooms.forEach((r, i) => { const key = roomKey(r); const c = sheet.items[key]?.hide ? NEUTRAL : colorOf(key, i); for (const id of r.merged ?? [r.id]) m.set(id, c) })
    return m
  }, [g, named, sheet]) // eslint-disable-line
  const colorSig = useMemo(() => [...colorMap].map(([k, v]) => k + v).join(','), [colorMap])
  const svgMarkup = useMemo(() => (vec && pp?.svg ? pp.svg(id => colorMap.get(id) ?? NEUTRAL) : ''), [pp, colorSig, vec]) // eslint-disable-line
  useEffect(() => {
    if (!pp || svgMarkup) return
    const t = window.setTimeout(() => setPlanUrl(pp.paint(id => colorMap.get(id) ?? NEUTRAL).toDataURL('image/jpeg', 0.92)), 120)
    return () => clearTimeout(t)
  }, [pp, colorSig, svgMarkup]) // eslint-disable-line

  const setItem = (key: string, patch: Partial<SheetItem>) => commit({ ...sheet, items: { ...sheet.items, [key]: { ...sheet.items[key], ...patch } } })
  /** khoá cả bố cục hiện tại (vị trí mọi ô) rồi áp thay đổi cho 1 ô */
  const freeze = (over?: { key: string; x: number; y: number }, anchor?: { key: string; ax: number; ay: number }) => {
    if (!layout) return
    const items: Record<string, SheetItem> = { ...sheet.items }
    for (const c of layout.callouts) items[c.key] = { ...items[c.key], x: over?.key === c.key ? over.x : c.x, y: over?.key === c.key ? over.y : c.y, ...(anchor?.key === c.key ? { ax: anchor.ax, ay: anchor.ay } : {}) }
    commit({ ...sheet, plan: layout.plan, items })
  }
  const resetLayout = () => { const items: Record<string, SheetItem> = {}; for (const [k, v] of Object.entries(sheet.items)) { const { x, y, ax, ay, ...rest } = v; void x; void y; void ax; void ay; items[k] = rest }; commit({ ...sheet, plan: undefined, items }) }

  // ---- kéo thả
  const toPage = (e: { clientX: number; clientY: number }) => { const m = svgRef.current!.getScreenCTM()!.inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: p.x, y: p.y } }
  const startDrag = (e: React.PointerEvent, key: string, kind: 'box' | 'anchor') => {
    e.stopPropagation(); setSel(key)
    if (!canEdit || !layout) return
    const c = layout.callouts.find(q => q.key === key)!, p0 = toPage(e)
    const off = kind === 'box' ? { x: p0.x - c.x, y: p0.y - c.y } : { x: 0, y: 0 }
    const others: Rect[] = layout.callouts.filter(q => q.key !== key).map(q => ({ x: q.x, y: q.y, w: q.w, h: q.h }))
    let last = { x: c.x, y: c.y }, moved = false
    const mv = (ev: PointerEvent) => {
      const p = toPage(ev); moved = true
      if (kind === 'box') { const r = snapAlign({ x: p.x - off.x, y: p.y - off.y, w: c.w, h: c.h }, others); last = { x: Math.max(12, Math.min(PW - 12 - c.w, r.x)), y: Math.max(12, Math.min(PH - 12 - c.h, r.y)) }; setDrag({ key, kind, ...last }) }
      else { last = { x: clamp01((p.x - layout.plan.x) / layout.plan.w), y: clamp01((p.y - layout.plan.y) / layout.plan.h) }; setDrag({ key, kind, ...last }) }
    }
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setDrag(null)
      if (!moved) return
      if (kind === 'box') { const r = freeSpot({ x: last.x, y: last.y, w: c.w, h: c.h }, others); freeze({ key, x: r.x, y: r.y }) } else freeze(undefined, { key, ax: last.x, ay: last.y })
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }

  // ---- tiêu đề trang
  const title = sheet.title ?? d.project?.name?.toUpperCase() ?? ''
  const fl = fp?.floor_label ?? ''
  const subtitle = sheet.subtitle ?? (/^mặt bằng/i.test(fl) ? fl : 'Mặt bằng ' + fl).toUpperCase()

  const live = layout?.callouts.map(c => (drag?.kind === 'box' && drag.key === c.key ? { ...c, x: drag.x, y: drag.y } : drag?.kind === 'anchor' && drag.key === c.key ? { ...c, ax: drag.x, ay: drag.y } : c)) ?? []

  // ---- xuất
  const rasterize = async (scale: number): Promise<HTMLCanvasElement> => {
    const el = svgRef.current!.cloneNode(true) as SVGSVGElement
    el.querySelectorAll('.ui-only').forEach(n => n.remove())
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); el.setAttribute('width', String(PW)); el.setAttribute('height', String(PH))
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(el)], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Không dựng được ảnh')); img.src = url })
    const c = document.createElement('canvas'); c.width = PW * scale; c.height = PH * scale
    const x = c.getContext('2d')!; x.fillStyle = '#f4f3f0'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url)
    return c
  }
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000) }
  const fname = `${(d.project?.name ?? 'concept').replace(/[^\p{L}\d]+/gu, '_')}_${fl.replace(/[^\p{L}\d]+/gu, '_')}`
  const dl = async (kind: 'png' | 'pdf', hi = false) => {
    try {
      const c = await rasterize(Math.min(PAPER[size].scale * (hi ? 1.75 : 1), 7600 / PW))
      if (kind === 'png') c.toBlob(b => b && save(b, fname + '.png'), 'image/png')
      else c.toBlob(async b => { if (!b) return; save(jpegPdf([{ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height, pt: PAPER[size].pt }]), fname + '.pdf') }, 'image/jpeg', 0.93)
    } catch (e) { toast(String(e)) }
  }

  const selC = live.find(c => c.key === sel)
  const selIdx = allRooms.findIndex(r => roomKey(r) === sel)
  const hidden = named.filter(r => sheet.items[roomKey(r)]?.hide)

  return (
    <div className="concept">
      <div className="step-box"><b>Trang mặt bằng tổng</b> <span className="muted small">– kéo ô tên để dời (tự hút thẳng hàng, không chồng nhau); kéo chấm đỏ để dời điểm nối nét đứt</span></div>
      {!g && <div className="note">Mặt bằng này chưa được đọc – quay lại bước ① để tải/đọc lại PDF.</div>}
      {g && !named.length && <div className="note">Chưa có phòng nào được đặt tên – sang bước ② để tô màu, gộp, tách và đặt tên phòng.</div>}
      {busy && <div className="small muted"><span className="spinner" /> Đang dựng mặt bằng và tô màu sàn (khoảng 5–15 giây)…</div>}
      {pp && <>
        <div className="row gap wrap sheet-tools">
          <label className="small">Tiêu đề <input value={title} disabled={!canEdit} onChange={e => commit({ ...sheet, title: e.target.value })} data-lang="none" /></label>
          <label className="small">Dòng phụ <input value={subtitle} disabled={!canEdit} onChange={e => commit({ ...sheet, subtitle: e.target.value })} data-lang="none" /></label>
          <label className="small"><input type="checkbox" checked={showVn} disabled={!canEdit} onChange={e => commit({ ...sheet, showVn: e.target.checked })} /> Hiện tên tiếng Việt</label>
          <label className="small">Trang số <input type="number" style={{ width: 56 }} value={sheet.page ?? ''} disabled={!canEdit} onChange={e => commit({ ...sheet, page: e.target.value ? +e.target.value : undefined })} /></label>
          {canEdit && <button className="btn sm" onClick={resetLayout}>↺ Tự bố trí lại</button>}
          <button className="btn sm primary" onClick={() => dl('png')}>⬇ PNG</button>
          <button className="btn sm primary" onClick={() => dl('pdf')}>⬇ PDF</button>
          <button className="btn sm" onClick={() => dl('pdf', true)} title="Độ phân giải cao hơn ~1,75 lần – file lớn hơn, nét mặt bằng sắc hơn khi in/phóng to">⬇ PDF nét cao</button>
          {pp?.svg && <button className="btn sm" onClick={() => setVec(!vec)}>{vec ? 'Mặt bằng: vector' : 'Mặt bằng: ảnh'}</button>}
        </div>
        <svg ref={svgRef} className="sheet-svg" viewBox={`0 0 ${PW} ${PH}`} onPointerDown={() => setSel(null)}>
          <rect width={PW} height={PH} fill="#f4f3f2" />
          <rect x={0} y={70.5} width={1236.8} height={48.7} fill="#9c918c" />
          <rect x={1771.5} y={16.2} width={148.5} height={48.7} fill="#9c918c" />
          <text x={1503.9} y={60} textAnchor="middle" fontSize={53.3} letterSpacing={1} fontFamily='Georgia, "Times New Roman", serif' fill="#60614d">{title.toUpperCase()}</text>
          <text x={1863.8} y={108} textAnchor="end" fontSize={33.3} fontWeight="bold" letterSpacing={0.7} fontFamily='"Helvetica Neue", Arial, sans-serif' fill="#60614d">{subtitle.toUpperCase()}</text>
          {sheet.page != null && <g><rect x={1866} y={PH - 42} width={26} height={22} fill="#7d7d7d" /><text x={1879} y={PH - 26} fontSize={14} fill="#fff" textAnchor="middle" fontFamily="Arial">{sheet.page}</text></g>}
          {layout && svgMarkup && pp && <svg x={layout.plan.x} y={layout.plan.y} width={layout.plan.w} height={layout.plan.h} viewBox={`0 0 ${pp.crop.w} ${pp.crop.h}`} preserveAspectRatio="none" overflow="hidden" dangerouslySetInnerHTML={{ __html: svgMarkup }} />}
          {layout && !svgMarkup && planUrl && <image href={planUrl} x={layout.plan.x} y={layout.plan.y} width={layout.plan.w} height={layout.plan.h} />}
          {layout && live.map(c => <path key={'l' + c.key} d={leader(c, layout.plan.x + c.ax * layout.plan.w, layout.plan.y + c.ay * layout.plan.h)} fill="none" stroke="#d62828" strokeWidth={2} strokeDasharray="7 5" />)}
          {layout && live.map(c => <circle key={'a' + c.key} cx={layout.plan.x + c.ax * layout.plan.w} cy={layout.plan.y + c.ay * layout.plan.h} r={5} fill="#d62828" />)}
          {live.map((c, k) => { const idx = allRooms.findIndex(r => roomKey(r) === c.key), col = colorOf(c.key, idx < 0 ? k : idx), tc = lumOf(col) > 0.62 ? '#2b2b2b' : '#fff'; let ty = c.y + 12
            return <g key={c.key} className={'sheet-box' + (sel === c.key ? ' on' : '')} onPointerDown={e => startDrag(e, c.key, 'box')} style={{ cursor: canEdit ? 'grab' : 'default' }}>
              <rect x={c.x + 2} y={c.y + 4} width={c.w} height={c.h} rx={16} fill="#000" opacity={0.14} />
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={16} fill={col} stroke="#fff" strokeWidth={3} />
              {c.lines.map((l, i) => { ty += l.size + 4; return <text key={i} x={c.x + c.w / 2} y={ty - 3} textAnchor="middle" fontSize={l.size} fontWeight={l.bold ? 'bold' : 'normal'} fontFamily="Arial, Helvetica, sans-serif" fill={tc} style={{ font: fontOf(l.size, l.bold) }}>{l.t}</text> })}
              {sel === c.key && <rect className="ui-only" x={c.x - 4} y={c.y - 4} width={c.w + 8} height={c.h + 8} rx={19} fill="none" stroke="#1565c0" strokeWidth={2} strokeDasharray="4 3" />}
            </g> })}
          {canEdit && layout && live.map(c => <circle key={'h' + c.key} className="ui-only" cx={layout.plan.x + c.ax * layout.plan.w} cy={layout.plan.y + c.ay * layout.plan.h} r={13} fill="transparent" style={{ cursor: 'move' }} onPointerDown={e => startDrag(e, c.key, 'anchor')} />)}
        </svg>
        {selC && selIdx >= 0 && canEdit && <div className="row gap wrap sheet-sel">
          <b>{selC.vn}</b>
          <label className="small">Màu <input type="color" value={colorOf(selC.key, selIdx)} onChange={e => setItem(selC.key, { color: e.target.value })} /></label>
          <label className="small">Diện tích (m²) <input type="number" step="0.1" style={{ width: 80 }} value={selC.area} onChange={e => setItem(selC.key, { area: +e.target.value })} /></label>
          {sheet.items[selC.key]?.area != null && <button className="btn sm" onClick={() => setItem(selC.key, { area: undefined })}>Dùng số đo từ bản vẽ ({named[selIdx].area_m2} m²)</button>}
          <button className="btn sm" onClick={() => setItem(selC.key, { ax: undefined, ay: undefined })}>Đưa điểm nối về tâm phòng</button>
          <button className="btn sm danger" onClick={() => { setItem(selC.key, { hide: true }); setSel(null) }}>Ẩn ô này</button>
        </div>}
        {hidden.length > 0 && <div className="small muted">Đã ẩn: {hidden.map(r => <span key={r.id} className="chip" onClick={() => setItem(roomKey(r), { hide: false })} style={{ cursor: 'pointer' }}>＋ {r.names[0]}</span>)}</div>}
        <div className="small muted">Diện tích là số đo tự động từ bản vẽ vector – bấm vào ô để kiểm và sửa nếu cần. Sàn tô màu theo từng không gian; đồ nội thất giữ trắng.</div>
      </>}
    </div>
  )
}

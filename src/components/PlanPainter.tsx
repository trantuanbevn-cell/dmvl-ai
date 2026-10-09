import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import type { FloorPlan, FloorRoom, SheetLayout } from '../lib/types'
import type { PlanPaint } from '../lib/planPaint'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { roomPolys, addMerge, removeMerge, centroidOf, addCut, removeCut, inRoom } from '../lib/cadZones'
import { furnInRoom } from '../lib/furniture'
import { computeFloor } from '../lib/floorPlans'
import { roomKey, pole } from '../lib/sheetLayout'
import { useVecMode } from '../lib/planSheet'
import { PALETTE, NEUTRAL, autoRoomColor } from '../lib/palette'

type VB = { x: number; y: number; w: number; h: number }

/** Bước ②: tô màu – gộp – tách – đặt tên phòng trên mặt bằng lớn (có zoom/kéo), diện tích đo tự động từ bản vẽ vector */
export default function PlanPainter({ d, fp, sheet, commit, pp, busy }: { d: ProjectData; fp: FloorPlan; sheet: SheetLayout; commit: (s: SheetLayout) => void; pp: PlanPaint | null; busy: boolean }) {
  const { canEdit } = useAuth()
  const g = fp.geometry
  const [sel, setSel] = useState<number[]>([])
  const [hover, setHover] = useState<number | null>(null)
  const [mode, setMode] = useState<'pick' | 'cut'>('pick')
  const [cutPts, setCutPts] = useState<[number, number][]>([]), [cursor, setCursor] = useState<[number, number] | null>(null)
  const [nm, setNm] = useState(''), [nmEn, setNmEn] = useState(''), [color, setColor] = useState(PALETTE[0])
  const [real, setReal] = useState('')
  const [work, setWork] = useState('')
  const [planUrl, setPlanUrl] = useState('')
  const [vec, setVec] = useVecMode()
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: 1, h: 1 })
  const svgRef = useRef<SVGSVGElement>(null), pan = useRef<{ sx: number; sy: number; vb: VB; moved: boolean } | null>(null)
  const crop = pp?.crop
  const fit = () => crop && setVb({ x: 0, y: 0, w: crop.w, h: crop.h })
  useEffect(() => { fit() }, [pp]) // eslint-disable-line

  const rooms = g?.rooms ?? []
  const named = useMemo(() => rooms.filter(r => r.user && r.names[0]), [g]) // eslint-disable-line
  const autoColor = (r: FloorRoom) => autoRoomColor(rooms.findIndex(x => x.id === r.id))
  const colorOf = (r: FloorRoom) => sheet.items[roomKey(r)]?.color ?? autoColor(r)
  const nextColor = () => PALETTE.find(c => !named.some(r => colorOf(r) === c)) ?? PALETTE[named.length % PALETTE.length]

  // ---- ảnh sàn đã tô màu
  const colorMap = useMemo(() => {
    const m = new Map<number, string>()
    if (!g) return m
    for (const r of g.raw_rooms ?? g.rooms) m.set(r.id, NEUTRAL)
    for (const r of rooms) { const c = sheet.items[roomKey(r)]?.hide ? NEUTRAL : colorOf(r); for (const id of r.merged ?? [r.id]) m.set(id, c) }
    return m
  }, [g, sheet]) // eslint-disable-line
  const colorSig = useMemo(() => [...colorMap].map(([k, v]) => k + v).join(','), [colorMap])
  const svgMarkup = useMemo(() => (vec && pp?.svg ? pp.svg(id => colorMap.get(id) ?? NEUTRAL) : ''), [pp, colorSig, vec]) // eslint-disable-line
  useEffect(() => {
    if (!pp || svgMarkup) return
    const t = window.setTimeout(() => setPlanUrl(pp.paint(id => colorMap.get(id) ?? NEUTRAL).toDataURL('image/jpeg', 0.9)), 100)
    return () => clearTimeout(t)
  }, [pp, colorSig, svgMarkup]) // eslint-disable-line

  // ---- chọn → điền sẵn ô tên / màu
  const selRooms = sel.map(id => rooms.find(r => r.id === id)).filter((r): r is FloorRoom => !!r)
  const total = selRooms.reduce((s, r) => s + r.area_m2, 0)
  useEffect(() => {
    const u = selRooms.find(r => r.user && r.names[0])
    if (u) { setNm(u.names[0] ?? ''); setNmEn(u.names[1] ?? ''); setColor(colorOf(u)) }
    else { const t = selRooms.find(r => r.names[0]); setNm(t?.names[0] ?? ''); setNmEn(t?.names[1] ?? ''); setColor(selRooms[0] ? colorOf(selRooms[0]) : nextColor()) }
    setReal('')
  }, [sel.join(',')]) // eslint-disable-line

  const recomputed = useRef(false)
  useEffect(() => {
    if (!g || g.algo === 5 || !canEdit || recomputed.current || busy) return
    recomputed.current = true; setWork('Đang áp thuật toán nhận diện không gian mới (khoảng 10–20 giây)…')
    computeFloor(fp, {}, () => {}).then(() => d.reload()).catch(e => toast(String(e))).finally(() => setWork(''))
  }, [g, canEdit, busy]) // eslint-disable-line
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  useEffect(() => { const el = svgRef.current; if (!el) return; const f = (e: WheelEvent) => wheelRef.current(e); el.addEventListener('wheel', f, { passive: false }); return () => el.removeEventListener('wheel', f) }, [pp])
  if (!g) return <div className="note">Mặt bằng này chưa được đọc – quay lại bước ① để tải/đọc lại PDF.</div>
  if (!pp || !crop) return <div className="small muted">{busy ? <><span className="spinner" /> Đang dựng mặt bằng và tô màu sàn (khoảng 5–15 giây)…</> : 'Chưa dựng được mặt bằng.'}</div>

  const toPx = (p: number[]): [number, number] => [p[0] * pp.W - crop.x, p[1] * pp.H - crop.y]
  const toNorm = (x: number, y: number): [number, number] => [(x + crop.x) / pp.W, (y + crop.y) / pp.H]
  const svgPt = (ev: { clientX: number; clientY: number }): [number, number] => { const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse()); return [p.x, p.y] }
  const save = async (ng: typeof g) => { setWork('Đang lưu…'); const { error } = await supabase.from('floor_plans').update({ geometry: ng }).eq('id', fp.id); if (error) toast('Lưu lỗi: ' + error.message); await d.reload(); setWork('') }
  const setColors = (rs: FloorRoom[], c: string) => { const items = { ...sheet.items }; for (const r of rs) items[roomKey(r)] = { ...items[roomKey(r)], color: c }; commit({ ...sheet, items }) }

  // ---- thao tác chuột: kéo = dời, bấm = chọn, lăn = zoom
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => { svgRef.current!.setPointerCapture(e.pointerId); pan.current = { sx: e.clientX, sy: e.clientY, vb, moved: false } }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pan.current
    if (mode === 'cut') setCursor(svgPt(e))
    if (!p) { const el = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-rid'); setHover(el ? +el : null); return }
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy
    if (!p.moved && Math.hypot(dx, dy) < 5) return
    p.moved = true
    const k = p.vb.w / svgRef.current!.clientWidth
    setVb({ ...p.vb, x: p.vb.x - dx * k, y: p.vb.y - dy * k })
  }
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pan.current; pan.current = null
    try { svgRef.current!.releasePointerCapture(e.pointerId) } catch { /* đã nhả */ }
    if (!p || p.moved || !canEdit) return
    if (mode === 'cut') {
      const pt = svgPt(e), pts = [...cutPts, pt]
      if (pts.length < 2) { setCutPts(pts); return }
      const ng = addCut(g, { a: toNorm(...pts[0]), b: toNorm(...pts[1]) })
      setCutPts([]); setCursor(null)
      if (!ng) { toast('Đường cắt phải đi qua bên trong một phòng (bấm 2 điểm cùng nằm trong phòng cần chia)'); return }
      setSel([]); setMode('pick'); save(ng); return
    }
    const rid = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-rid')
    if (rid) setSel(s => (s.includes(+rid) ? s.filter(x => x !== +rid) : [...s, +rid]))
  }
  const zoom = (f: number, at?: [number, number]) => setVb(v => { const c = at ?? [v.x + v.w / 2, v.y + v.h / 2], w = Math.max(crop.w / 40, Math.min(crop.w * 1.5, v.w * f)), r = w / v.w; return { x: c[0] - (c[0] - v.x) * r, y: c[1] - (c[1] - v.y) * r, w, h: v.h * r } })
  wheelRef.current = e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1 / 1.2 : 1.2, svgPt(e)) }
  const focus = (r: FloorRoom) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    for (const pl of roomPolys(r)) for (const q of pl) { const [x, y] = toPx(q); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const w = Math.max(x1 - x0, (y1 - y0) * crop.w / crop.h) * 2.4, h = w * crop.h / crop.w
    setVb({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h })
  }

  // ---- gộp / đặt tên / tách
  const apply = () => {
    if (!selRooms.length || !nm.trim()) return
    const ng = addMerge(g, { name: nm.trim(), name_en: nmEn.trim() || undefined, members: centroidOf(g, sel), src: 'user' })
    const raw = ng.raw_rooms ?? ng.rooms, first = centroidOf(g, sel)[0], rid = raw.find(r => Math.hypot(r.cx - first[0], r.cy - first[1]) < 0.03)?.id
    const nr = ng.rooms.find(r => r.user && rid != null && (r.merged ?? []).includes(rid))
    if (nr) { const items = { ...sheet.items }; items[roomKey(nr)] = { ...items[roomKey(nr)], color }; commit({ ...sheet, items }) }
    setSel([]); save(ng)
  }
  const unname = () => { let ng = g; for (const r of selRooms.filter(x => x.user)) ng = removeMerge(ng, r.id); setSel([]); save(ng) }
  const autoName = () => {
    let ng = g; const items = { ...sheet.items }, used = new Set(named.map(r => colorOf(r)))
    let n = 0
    for (const r of rooms) {
      if (r.user || !r.names[0] || r.area_m2 < 2) continue
      ng = addMerge(ng, { name: r.names[0], name_en: r.names[1] || undefined, members: [[r.cx, r.cy]], src: 'user' })
      const c = PALETTE.find(x => !used.has(x)) ?? PALETTE[n % PALETTE.length]; used.add(c)
      const nr = ng.rooms.find(x => x.user && Math.hypot(x.cx - r.cx, x.cy - r.cy) < 0.01); if (nr) items[roomKey(nr)] = { ...items[roomKey(nr)], color: c }
      n++
    }
    if (!n) return toast('Không còn phòng nào có chữ tên trong bản vẽ để nhận tự động.')
    commit({ ...sheet, items }); save(ng); toast(`Đã đặt tên và tô màu ${n} phòng theo chữ trong bản vẽ – kiểm lại và sửa tên nếu cần.`)
  }
  const calibrate = async () => {
    const r = selRooms[0], realA = parseFloat(real.replace(',', '.'))
    if (!r || !(realA > 0)) return
    const den = Math.round(fp.scale_den * Math.sqrt(realA / r.area_m2))
    if (!confirm(`Đổi tỉ lệ bản vẽ từ 1:${fp.scale_den} sang 1:${den} để phòng này đúng ${realA} m²? Mọi diện tích sẽ tính lại.`)) return
    setWork('Đang tính lại theo tỉ lệ mới…')
    try { await computeFloor(fp, { scaleDen: den }, () => {}) } catch (e) { toast(String(e)) }
    setSel([]); await d.reload(); setWork('')
  }

  const fs = vb.w / 80
  const unnamedBig = rooms.filter(r => !r.user && r.area_m2 >= 2).length
  const cutsN = g.cuts?.length ?? 0
  return (
    <div className="painter">
      <div className="row gap wrap small" style={{ marginBottom: 6 }}>
        <b>Bấm vào phòng để chọn (bấm thêm để chọn nhiều), kéo để dời, lăn chuột để phóng to.</b>
        {canEdit && <button className={'btn sm' + (mode === 'cut' ? ' primary' : '')} onClick={() => { setMode(mode === 'cut' ? 'pick' : 'cut'); setCutPts([]); setCursor(null) }}>{mode === 'cut' ? '✓ Đang chia phòng – bấm 2 điểm' : '✂ Chia 1 phòng thành 2'}</button>}
        {canEdit && unnamedBig > 0 && <button className="btn sm" disabled={!!work} onClick={autoName} title="Phòng nào có chữ tên ghi trong bản vẽ thì tự đặt tên + tô màu">⚡ Tự nhận tên từ chữ trong bản vẽ ({unnamedBig})</button>}
        <span style={{ flex: 1 }} />
        {pp?.svg && <button className="btn sm" onClick={() => setVec(!vec)} title="Vector: nét sắc ở mọi mức phóng to. Ảnh: kéo/thu phóng mượt hơn trên máy yếu">{vec ? 'Nét: vector' : 'Nét: ảnh'}</button>}
        <button className="btn sm" onClick={() => zoom(1 / 1.3)}>＋</button><button className="btn sm" onClick={() => zoom(1.3)}>－</button><button className="btn sm" onClick={fit}>⤢ Vừa khung</button>
      </div>
      {mode === 'cut' && <div className="note">Chia phòng: bấm <b>2 điểm</b> trong cùng một phòng – đường thẳng đi qua 2 điểm sẽ cắt phòng đó thành 2 phòng. {cutPts.length === 1 ? 'Bấm điểm thứ hai.' : 'Bấm điểm thứ nhất.'}</div>}
      <div className="painter-grid">
        <svg ref={svgRef} className="painter-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}
          style={{ cursor: mode === 'cut' ? 'crosshair' : pan.current?.moved ? 'grabbing' : hover != null ? 'pointer' : 'grab' }}>
          <rect x={0} y={0} width={crop.w} height={crop.h} fill="#fff" />
          {svgMarkup ? <svg x={0} y={0} width={crop.w} height={crop.h} viewBox={`0 0 ${crop.w} ${crop.h}`} overflow="hidden" dangerouslySetInnerHTML={{ __html: svgMarkup }} /> : planUrl && <image href={planUrl} x={0} y={0} width={crop.w} height={crop.h} />}
          {rooms.map(r => { const on = sel.includes(r.id), hv = hover === r.id
            return roomPolys(r).map((pl, k) => <polygon key={r.id + '_' + k} data-rid={r.id} points={pl.map(q => toPx(q).join(',')).join(' ')} fill={on ? 'rgba(21,101,192,.38)' : hv ? 'rgba(21,101,192,.18)' : 'transparent'} stroke={on ? '#1565c0' : 'none'} strokeWidth={vb.w / 700} />) })}
          {rooms.filter(r => r.area_m2 >= 1.5).map(r => { const [px, py] = toPx(pole(r)); const nmd = r.user && r.names[0]
            return <g key={'t' + r.id} style={{ pointerEvents: 'none' }} fontFamily="Arial, sans-serif" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={fs * 0.3} strokeLinejoin="round">
              {nmd && <text x={px} y={py - fs * 0.15} fontSize={fs} fontWeight="bold" fill="#222">{r.names[0]}</text>}
              <text x={px} y={py + (nmd ? fs * 1.15 : fs * 0.4)} fontSize={nmd ? fs * 0.85 : fs * 0.7} fill={nmd ? '#222' : '#777'}>{r.area_m2.toFixed(1)} m²</text></g> })}
          {cutPts.length > 0 && <g style={{ pointerEvents: 'none' }}>
            {cutPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={vb.w / 160} fill="#d62828" />)}
            {cursor && <line x1={cutPts[0][0]} y1={cutPts[0][1]} x2={cursor[0]} y2={cursor[1]} stroke="#d62828" strokeWidth={vb.w / 450} strokeDasharray={`${vb.w / 150} ${vb.w / 220}`} />}</g>}
        </svg>
        <div className="painter-side stack">
          {work && <div className="small muted"><span className="spinner" /> {work}</div>}
          <div className="small"><b>Đã chọn {selRooms.length} không gian</b>{selRooms.length > 0 && <> · diện tích tự đo: <b>{total.toFixed(1)} m²</b> <button className="btn ghost sm" onClick={() => setSel([])}>Bỏ chọn</button></>}</div>
          {selRooms.length === 0 && <div className="small muted">Chọn 1 phòng để đặt tên + màu, hoặc chọn nhiều phòng nhỏ rồi “Gộp thành 1 phòng”.</div>}
          {selRooms.length > 0 && canEdit && <>
            <input placeholder="Tên tiếng Việt" value={nm} onChange={e => setNm(e.target.value)} data-lang="none" />
            <input placeholder="English name (tuỳ chọn)" value={nmEn} onChange={e => setNmEn(e.target.value)} data-lang="none" />
            <div className="small">Màu sàn</div>
            <div className="deck-colors">{PALETTE.map(c => <button key={c} type="button" className={'deck-sw' + (color === c ? ' on' : '')} style={{ background: c }} onClick={() => { setColor(c); setColors(selRooms, c) }} />)}
              <input type="color" value={color} onChange={e => { setColor(e.target.value); setColors(selRooms, e.target.value) }} /></div>
            <div className="row gap wrap">
              <button className="btn sm primary" disabled={!nm.trim() || !!work} onClick={apply}>{selRooms.length > 1 ? `Gộp ${selRooms.length} không gian thành 1 phòng & đặt tên` : selRooms[0].user ? 'Cập nhật tên' : 'Đặt tên cho phòng'}</button>
              {selRooms.some(r => r.user) && <button className="btn sm" disabled={!!work} onClick={unname} title="Bỏ tên, trả các không gian đã gộp về các vùng gốc">↺ Tách lại / bỏ tên</button>}</div>
            {selRooms.length === 1 && <div className="row gap wrap small"><span>Diện tích thật:</span><input style={{ width: 70 }} placeholder="m²" value={real} onChange={e => setReal(e.target.value)} /><button className="btn sm" disabled={!real || !!work} onClick={calibrate} title="Nhập diện tích thật của phòng này để chỉnh tỉ lệ bản vẽ cho cả tầng">Chỉnh tỉ lệ bản vẽ</button></div>}
          </>}
          {selRooms.length > 0 && g.furn && (() => {
            const inside = (x: number, y: number) => selRooms.some(r => inRoom(r, x, y))
            const list = furnInRoom(g.furn!, inside), tx = new Map<string, number>()
            for (const [t, x, y] of g.labels ?? []) if (inside(x, y)) tx.set(t, (tx.get(t) ?? 0) + 1)
            const texts = [...tx].sort((a, b) => b[1] - a[1])
            const total = list.reduce((s, o) => s + o.n, 0)
            return <details className="small" open>
              <summary><b>Đồ rời trong không gian</b> · {total} vật · {list.length} loại</summary>
              {list.length === 0 && <div className="muted">Không có đồ rời nào trong vùng chọn.</div>}
              {list.slice(0, 40).map(o => <div key={o.group.id} className="row gap" style={{ alignItems: 'center', margin: '2px 0' }}>
                <b style={{ minWidth: 34 }}>×{o.n}</b>
                {canEdit ? <input style={{ flex: 1 }} defaultValue={g.furn!.names[o.group.id] ?? ''} placeholder={`${o.group.layer.split('$').pop()} · ${o.group.w}×${o.group.d} m`} data-lang="none"
                  onBlur={e => { const v = e.target.value.trim(); if (v !== (g.furn!.names[o.group.id] ?? '')) save({ ...g, furn: { ...g.furn!, names: { ...g.furn!.names, [o.group.id]: v } } }) }} />
                  : <span>{g.furn!.names[o.group.id] ?? `${o.group.layer.split('$').pop()} · ${o.group.w}×${o.group.d} m`}</span>}
                <span className="muted">{o.group.w}×{o.group.d} m</span></div>)}
              {texts.length > 0 && <div style={{ marginTop: 4 }}><b>Chữ ghi trong bản vẽ:</b> {texts.slice(0, 20).map(([t, n]) => <span key={t} className="chip">{t}{n > 1 ? ` ×${n}` : ''}</span>)}</div>}
              <div className="muted">Các vật giống hệt nhau (kể cả xoay/lật) được gom một loại; đặt tên 1 lần là áp cho cả loại, ở mọi không gian.</div>
            </details>
          })()}
          {cutsN > 0 && <div className="small muted">Đường cắt: {g.cuts!.map((_, i) => <span key={i} className="chip">#{i + 1} <a onClick={() => { setSel([]); save(removeCut(g, i)) }} title="Bỏ đường cắt này">✕</a></span>)}</div>}
          <div className="small"><b>Danh sách phòng</b> <span className="muted">({named.length} đã đặt tên · tổng {named.reduce((s, r) => s + r.area_m2, 0).toFixed(1)} m²)</span></div>
          <div className="floor-rooms">{rooms.slice().sort((a, b) => (+!!b.user - +!!a.user) || b.area_m2 - a.area_m2).filter(r => r.area_m2 >= 1.5).map(r => (
            <div key={r.id} className={'fr' + (sel.includes(r.id) ? ' on' : '')} onClick={() => { setSel(s => (s.includes(r.id) ? s.filter(x => x !== r.id) : [...s, r.id])); focus(r) }}>
              <span className="dotc" style={{ background: sheet.items[roomKey(r)]?.hide ? NEUTRAL : colorOf(r), border: '1px solid #bbb' }} />
              {r.user && r.names[0] ? <b>{r.names[0]}</b> : <span className="muted">{r.names[0] ?? '(chưa đặt tên)'}</span>}{r.merged && r.merged.length > 1 ? <span className="muted small"> · gộp {r.merged.length}</span> : null}<b>{r.area_m2} m²</b></div>))}</div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { roomPages } from '../lib/roomPages'
import { floorLabel } from '../lib/roomMatrix'
import type { ProjectData } from '../lib/useProject'
import type { Page } from '../lib/types'

type Cam = { plan_page_id: string; plan_page_no?: number; cam: { x: number; y: number }; dir: { dx: number; dy: number }; half: number; range: number; manual?: boolean; [k: string]: any }
const DIRS = ['phải', 'xuống-phải', 'xuống', 'xuống-trái', 'trái', 'lên-trái', 'lên', 'lên-phải']
const dirVn = (dx: number, dy: number) => DIRS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8] + ' (theo mặt bằng)'
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Khung ảnh phóng to: cuộn chuột để zoom tại con trỏ, kéo để di chuyển (khi pan=true), kích đúp để về mặc định */
function ZoomPane({ children, pan = true }: { children: React.ReactNode; pan?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  useEffect(() => {
    const el = box.current; if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top
      setT(o => {
        const s2 = Math.max(1, Math.min(10, o.s * Math.exp(-e.deltaY * 0.0015)))
        if (s2 === 1) return { s: 1, x: 0, y: 0 }
        return { s: s2, x: cx - (cx - o.x) * (s2 / o.s), y: cy - (cy - o.y) * (s2 / o.s) }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  return <div ref={box} style={{ position: 'relative', overflow: 'hidden', background: '#222', borderRadius: 6, flex: 1, minHeight: 0, cursor: pan ? (t.s > 1 ? 'grab' : 'zoom-in') : 'crosshair', touchAction: 'none' }}
    onDoubleClick={() => pan && setT({ s: 1, x: 0, y: 0 })}
    onPointerDown={e => { if (!pan || t.s === 1) return; drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
    onPointerMove={e => { const g = drag.current; if (g) setT(o => ({ ...o, x: g.x + e.clientX - g.px, y: g.y + e.clientY - g.py })) }}
    onPointerUp={() => { drag.current = null }}>
    <div style={{ transformOrigin: '0 0', transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, width: '100%', position: 'relative' }}>{children}</div>
    {t.s > 1 && <span className="small" style={{ position: 'absolute', right: 8, bottom: 6, background: 'rgba(0,0,0,.6)', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>×{t.s.toFixed(1)} · kích đúp để về lại</span>}
  </div>
}

/** Cửa sổ xem từng ảnh phối cảnh: ảnh lớn bên trái, mặt bằng (đổ vật liệu trong file concept) bên phải để đặt vị trí + hướng camera của ảnh */
export default function RenderViewer({ d, pageId, onClose, onGo }: { d: ProjectData; pageId: string; onClose: () => void; onGo: (id: string) => void }) {
  const { canEdit } = useAuth()
  const page = d.pages.find(x => x.id === pageId)!
  const room = d.rooms.find(r => r.id === page.room_id)
  const sibs = useMemo(() => (room ? roomPages(d.pages, room.id) : d.pages).filter(p => p.kind === 'render'), [d.pages, room])
  const idx = sibs.findIndex(p => p.id === pageId)
  const plans = useMemo(() => d.pages.filter(p => p.kind === 'plan'), [d.pages])
  const cam = page.camera as Cam | null
  const guess = (): string => {
    if (cam?.plan_page_id && plans.some(p => p.id === cam.plan_page_id)) return cam.plan_page_id
    return (plans.find(p => room?.floor && p.floor === room.floor) ?? plans.find(p => p.room_id === room?.id) ?? plans[0])?.id ?? ''
  }
  const [planId, setPlanId] = useState(guess)
  useEffect(() => { setPlanId(guess()) }, [pageId])   // eslint-disable-line react-hooks/exhaustive-deps
  const plan = plans.find(p => p.id === planId)
  const [tool, setTool] = useState(false)
  const [draft, setDraft] = useState<Cam | null>(null)
  const [busy, setBusy] = useState(false)
  const [nat, setNat] = useState<Record<string, [number, number]>>({})
  const wrap = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && idx > 0) onGo(sibs[idx - 1].id)
      if (e.key === 'ArrowRight' && idx >= 0 && idx < sibs.length - 1) onGo(sibs[idx + 1].id)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [idx, sibs, onClose, onGo])

  const dims = (p?: Page): [number, number] => p ? (nat[p.id] ?? [p.width ?? 1000, p.height ?? 700]) : [1000, 700]
  const [W, H] = dims(plan)
  const sw = W / 400
  const shown: Cam | null = draft ?? (cam && cam.plan_page_id === planId ? cam : null)

  const save = async (c: Cam | null) => {
    setBusy(true)
    try {
      const { error } = await supabase.from('pages').update({ camera: c }).eq('id', page.id)
      if (error) throw new Error(error.message)
      await d.reload()
    } catch (e) { alert(String((e as Error).message ?? e)) }
    setDraft(null); setBusy(false)
  }
  const build = (x: number, y: number, dx: number, dy: number, prev?: Cam | null): Cam => {
    const L = Math.hypot(dx, dy) || 1
    return {
      ...(prev && prev.plan_page_id === planId ? prev : { thumb: { x: 0, y: 0, w: 0, h: 0 }, visible: { chairs: 0, tables: 0 }, rooms_in_view: [], inliers: 0 }),
      plan_page_id: planId, plan_page_no: plan?.page_no, cam: { x: clamp01(x), y: clamp01(y) }, dir: { dx: dx / L, dy: dy / L },
      half: prev?.half ?? 0.5, range: prev?.range ?? 0.12, dir_vn: dirVn(dx, dy), label: prev?.label ?? 'A', room_id: page.room_id, manual: true,
    }
  }
  const norm = (e: React.PointerEvent) => { const r = wrap.current!.getBoundingClientRect(); return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) } }
  const down = (e: React.PointerEvent) => {
    if (!tool || !canEdit || busy) return
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = norm(e); start.current = p
    const keep = cam && cam.plan_page_id === planId ? cam.dir : { dx: 0, dy: -1 }
    setDraft(build(p.x, p.y, keep.dx, keep.dy, cam))
  }
  const move = (e: React.PointerEvent) => {
    const s = start.current; if (!s) return
    const p = norm(e), dx = (p.x - s.x) * W, dy = (p.y - s.y) * H
    if (Math.hypot(dx, dy) < 6) return   // chỉ kéo đủ xa mới đổi hướng
    setDraft(build(s.x, s.y, dx, dy, cam))
  }
  const up = () => { const c = draft; start.current = null; if (c) save(c) }
  const rotate = (deg: number) => { if (!shown) return; const a = Math.atan2(shown.dir.dy, shown.dir.dx) + deg * Math.PI / 180; save(build(shown.cam.x, shown.cam.y, Math.cos(a), Math.sin(a), shown)) }
  const widen = (f: number) => { if (!shown) return; save({ ...shown, half: Math.max(0.15, Math.min(1.4, shown.half * f)), manual: true }) }

  const cone = (c: Cam) => {
    const a0 = Math.atan2(c.dir.dy, c.dir.dx), R = c.range * W, cx = c.cam.x * W, cy = c.cam.y * H
    const pts = [[cx, cy]]; for (let i = -6; i <= 6; i++) { const a = a0 + (c.half * i) / 6; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]) }
    return pts.map(q => q.join(',')).join(' ')
  }
  const others = sibs.filter(p => p.id !== pageId && (p.camera as Cam | null)?.plan_page_id === planId)
  const img = (p: Page) => d.urls[p.image_path] ?? d.urls[p.thumb_path ?? '']

  return <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseDown={onClose}>
    <div className="card" style={{ width: '97vw', height: '94vh', display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }} onMouseDown={e => e.stopPropagation()}>
      <div className="row between">
        <div className="row gap sm-gap">
          <button className="btn ghost sm" disabled={idx <= 0} onClick={() => onGo(sibs[idx - 1].id)}>←</button>
          <b>{room ? `${room.code} ${room.name_vn}` : 'Chưa thuộc phòng'}</b>
          <span className="small muted">Tr.{page.page_no}{sibs.length > 1 ? ` · ảnh ${idx + 1}/${sibs.length}` : ''}{room?.floor ? ` · ${floorLabel(room.floor)}` : ''}</span>
          <button className="btn ghost sm" disabled={idx < 0 || idx >= sibs.length - 1} onClick={() => onGo(sibs[idx + 1].id)}>→</button>
        </div>
        <span className="small muted">Cuộn chuột = phóng to · kéo = di chuyển · ←/→ chuyển ảnh · Esc đóng</span>
        <button className="btn ghost sm" onClick={onClose}>✕ Đóng</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
          <b className="small">Phối cảnh</b>
          <ZoomPane><img src={img(page)} alt="" draggable={false} style={{ width: '100%', display: 'block' }} /></ZoomPane>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
          <div className="row gap sm-gap" style={{ flexWrap: 'wrap' }}>
            <b className="small">Mặt bằng (đổ vật liệu theo concept)</b>
            {plans.length > 0 && <select value={planId} onChange={e => setPlanId(e.target.value)} style={{ maxWidth: 260 }}>{plans.map(p => <option key={p.id} value={p.id}>Tr.{p.page_no}{p.floor ? ' · ' + floorLabel(p.floor) : ''}</option>)}</select>}
            {canEdit && plans.length > 0 && <button className={'btn sm' + (tool ? ' primary' : '')} onClick={() => setTool(!tool)} title="Bấm vào mặt bằng để đặt camera; giữ và kéo để chỉ hướng nhìn">{tool ? '📍 Đang đặt: bấm / kéo trên mặt bằng' : '📍 Đặt camera'}</button>}
            {canEdit && shown && !draft && <>
              <button className="btn ghost sm" onClick={() => rotate(-15)} title="Xoay camera sang trái">⟲</button><button className="btn ghost sm" onClick={() => rotate(15)} title="Xoay camera sang phải">⟳</button>
              <button className="btn ghost sm" onClick={() => widen(1.2)} title="Mở rộng góc nhìn">◢ rộng</button><button className="btn ghost sm" onClick={() => widen(1 / 1.2)} title="Thu hẹp góc nhìn">◥ hẹp</button>
              <button className="btn ghost sm danger" onClick={() => confirm('Xoá camera của ảnh này?') && save(null)}>Xoá camera</button>
            </>}
          </div>
          {plan ? <ZoomPane pan={!tool}>
            <div ref={wrap} style={{ position: 'relative' }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              <img src={img(plan)} alt="" draggable={false} style={{ width: '100%', display: 'block' }} onLoad={e => { const im = e.currentTarget; setNat(n => ({ ...n, [plan.id]: [im.naturalWidth, im.naturalHeight] })) }} />
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {others.map(p => { const c = p.camera as Cam; return <g key={p.id} opacity={.55}><polygon points={cone(c)} fill="rgba(21,101,192,.18)" stroke="#1565c0" strokeWidth={sw * .8} /><circle cx={c.cam.x * W} cy={c.cam.y * H} r={sw * 3} fill="#1565c0" stroke="#fff" strokeWidth={sw * .8} /><text x={c.cam.x * W + sw * 5} y={c.cam.y * H - sw * 3} fontSize={sw * 12} fill="#0d47a1" stroke="#fff" strokeWidth={sw * .6} paintOrder="stroke">Tr.{p.page_no}</text></g> })}
                {shown && <g><polygon points={cone(shown)} fill="rgba(229,57,53,.25)" stroke="#e53935" strokeWidth={sw} /><circle cx={shown.cam.x * W} cy={shown.cam.y * H} r={sw * 4.5} fill="#e53935" stroke="#fff" strokeWidth={sw} /></g>}
              </svg>
            </div>
          </ZoomPane> : <div className="card muted">Dự án chưa có trang mặt bằng. Đổi loại trang sang “Mặt bằng” ở danh sách trang.</div>}
          <div className="small muted">
            {shown ? <>Camera ảnh này: <b>{shown.dir_vn ?? dirVn(shown.dir.dx, shown.dir.dy)}</b>{shown.manual ? ' · đặt tay' : ' · phần mềm tự nhận'}{plan?.floor ? ` · ${floorLabel(plan.floor)}` : ''}. </> : <>Ảnh này chưa có vị trí trên mặt bằng đang chọn. </>}
            {others.length > 0 && <>Chấm xanh = camera của các ảnh khác trong phòng. </>}
            {canEdit ? 'Bấm 📍 rồi bấm lên mặt bằng; giữ và kéo để chỉ hướng nhìn.' : ''}
          </div>
        </div>
      </div>
    </div>
  </div>
}

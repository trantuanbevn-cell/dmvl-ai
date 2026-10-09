import { useEffect, useRef, useState } from 'react'
import { supabase, BUCKET } from './supabase'
import { toast } from './toast'
import { buildPlanPaint, type PlanPaint } from './planPaint'
import type { FloorPlan, SheetLayout } from './types'
import type { ProjectData } from './useProject'

const cache = new Map<string, PlanPaint>()
/** Mặt bằng PDF đã dựng + bản đồ vùng sàn từng phòng (dùng chung giữa bước tô màu và bước dàn trang) */
export function usePlanPaint(fp?: FloorPlan) {
  const g = fp?.geometry ?? null
  const sig = fp && g ? `${fp.id}:${fp.pdf_path}:${g.algo ?? 0}:${(g.raw_rooms ?? g.rooms).length}:${g.w}:${fp.scale_den}` : ''
  const [pp, setPp] = useState<PlanPaint | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => {
    setPp(null)
    if (!fp || !g || !sig) return
    const hitc = cache.get(sig); if (hitc) { setPp(hitc); return }
    let dead = false
    setBusy(true)
    ;(async () => {
      try {
        console.info('[usePlanPaint] download', fp.pdf_path)
        const { data, error } = await supabase.storage.from(BUCKET).download(fp.pdf_path); if (error) throw new Error(error.message)
        console.info('[usePlanPaint] downloaded')
        const p = await buildPlanPaint(await data.arrayBuffer(), fp.page_no, g)
        cache.set(sig, p); if (!dead) setPp(p)
      } catch (e) { console.info('[usePlanPaint] error', String(e)); if (!dead) toast('Không dựng được mặt bằng: ' + String(e)) }
      if (!dead) setBusy(false)
    })()
    return () => { dead = true; setBusy(false) }
  }, [sig]) // eslint-disable-line
  return { pp, busy }
}

/** Bố cục trang mặt bằng tổng của 1 tầng (màu, tên, diện tích sửa tay, vị trí ô…) – lưu tự động sau 0,7 giây */
export function useSheet(fp: FloorPlan | undefined, d: ProjectData) {
  const [sheets, setSheets] = useState<Record<string, SheetLayout>>({})
  const sheet: SheetLayout = (fp && (sheets[fp.id] ?? fp.sheet)) || { items: {} }
  const dirty = useRef(false), timer = useRef<number | undefined>()
  const commit = (next: SheetLayout) => {
    if (!fp) return
    setSheets(s => ({ ...s, [fp.id]: next })); dirty.current = true
    clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => { const { error } = await supabase.from('floor_plans').update({ sheet: next }).eq('id', fp.id); if (error) toast('Lưu lỗi: ' + error.message); else dirty.current = false }, 700)
  }
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current) d.reload() }, []) // eslint-disable-line
  return { sheet, commit }
}

/** Chế độ hiển thị mặt bằng: vector (nét sắc ở mọi mức phóng, xuất file nét) hoặc ảnh (nhẹ hơn) */
export function useVecMode(): [boolean, (b: boolean) => void] {
  const [v, setV] = useState(() => { try { return sessionStorage.getItem('plan-vec') !== '0' } catch { return true } })
  return [v, (b: boolean) => { setV(b); try { sessionStorage.setItem('plan-vec', b ? '1' : '0') } catch { /* */ } }]
}

import type { Page, Room } from '../lib/types'
import type { CameraData, PlanData } from '../lib/planPipeline'

/** Mặt bằng chi tiết + vùng phòng + vị trí/hướng camera của trang phối cảnh đang xem */
export default function PlanMap({ url, plan, cam, planPage, room }: { url?: string; plan?: PlanData | null; cam?: CameraData | null; planPage?: Page; room?: Room }) {
  if (!url || !planPage) return null
  const W = planPage.width ?? 1, H = planPage.height ?? 1
  const vb = `0 0 ${W} ${H}`
  const mine = plan && plan.page_id === planPage.id ? plan : null
  let cone: string | null = null
  if (cam && cam.plan_page_id === planPage.id) {
    const a0 = Math.atan2(cam.dir.dy, cam.dir.dx), R = cam.range * W, cx = cam.cam.x * W, cy = cam.cam.y * H
    const pts = [[cx, cy]]
    for (let i = -6; i <= 6; i++) { const a = a0 + (cam.half * i) / 6; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]) }
    cone = pts.map(p => p.join(',')).join(' ')
  }
  const sw = W / 400
  return (
    <div className="planmap">
      <div className="img-wrap">
        <img src={url} alt="" draggable={false} />
        <svg viewBox={vb} preserveAspectRatio="none">
          {mine?.regions.map((r, i) => r.poly.length > 2 && <polygon key={i} points={r.poly.map(p => `${p[0] * W},${p[1] * H}`).join(' ')} fill="rgba(46,125,50,.18)" stroke="#2e7d32" strokeWidth={sw} />)}
          {mine?.items.map((it, i) => <circle key={i} cx={it.x * W} cy={it.y * H} r={sw * 1.6} fill={it.t === 'c' ? '#1565c0' : '#ef6c00'} />)}
          {cone && <polygon points={cone} fill="rgba(229,57,53,.22)" stroke="#e53935" strokeWidth={sw} />}
          {cam && cam.plan_page_id === planPage.id && <circle cx={cam.cam.x * W} cy={cam.cam.y * H} r={sw * 4} fill="#e53935" stroke="#fff" strokeWidth={sw} />}
        </svg>
      </div>
      <div className="small muted">
        {room && mine ? <>{mine.cad ? <>✓ Đã đối chiếu mặt bằng gốc <b>{mine.cad.floor_label}</b> ({mine.cad.inliers} phòng khớp, tỉ lệ đo thật). </> : null}Phòng {room.code}: ~{Math.round(mine.area_m2)} m² · ước tính <b>{mine.counts.chairs} ghế</b> (chấm xanh), <b>{mine.counts.tables} bàn</b> (chấm cam). </> : null}
        {cam?.plan_page_id ? <>Camera (chấm đỏ) nhìn <b>{cam.dir_vn}</b>{cam.cad?.room_id ? <>, đặt trong <b>{cam.cad.names[0] ?? `phòng #${cam.cad.room_id}`}</b> ({cam.cad.floor_label}{cam.cad.area_m2 ? `, ${cam.cad.area_m2} m² theo bản vẽ gốc` : ''})</> : null}; trong nón nhìn ~{cam.visible.chairs} ghế, ~{cam.visible.tables} bàn{cam.rooms_in_view.length ? `; khu vực: ${cam.rooms_in_view.join(', ')}` : ''}. </> : <>Chưa định vị được camera trên mặt bằng. </>}
        <span className="warn-text">Số đếm tự động chỉ là ước lượng – cần kiểm.</span>
      </div>
    </div>
  )
}

// Mặt bằng 2D–3D trong LẬP DANH MỤC: dùng chung bộ công cụ đọc mặt bằng của Dàn trang concept (tô màu · gộp · đặt tên · đo diện tích · dựng 3D).
// An toàn dữ liệu: chỉ đọc/ghi bảng floor_plans và file riêng của tầng (plan3d/*.json) – KHÔNG chạm danh mục vật liệu, phòng, trang.
import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import { newDeck } from '../lib/deck'
import MasterPlan from './MasterPlan'
import PlanReader from './PlanReader'
import Plan3D from './Plan3D'

/** Dự án cũ đã làm xong danh mục: không bật công cụ này để khỏi lỡ tay đổi dữ liệu */
export const PLANLAB_EXCLUDE = /westin/i
export const planLabAllowed = (name?: string | null) => !PLANLAB_EXCLUDE.test(name ?? '')

type Sub = 'plan' | 'read' | 'e3d'
export default function PlanLab({ d }: { d: ProjectData }) {
  const [sub, setSub] = useState<Sub>(() => { try { return (sessionStorage.getItem('pl-sub') as Sub) || 'plan' } catch { return 'plan' } })
  const go = (s: Sub) => { setSub(s); try { sessionStorage.setItem('pl-sub', s) } catch { /* bỏ */ } }
  return <div style={{ display: 'grid', gap: 10 }}>
    <div className="mp-tabs big">{([['plan', 'Mặt bằng tầng & tô màu phòng'], ['read', 'Đọc mặt bằng (thử nghiệm)'], ['e3d', 'Soạn & dựng 3D (thử nghiệm)']] as [Sub, string][]).map(([k, l]) => <button key={k} className={'mp-tab' + (sub === k ? ' on' : '')} onClick={() => go(k)}>{l}</button>)}</div>
    {sub === 'plan' ? <MasterPlan d={d} size={newDeck('westin').size} /> : sub === 'read' ? <PlanReader /> : <Plan3D proj={{ id: d.project!.id, floors: d.floors }} />}
  </div>
}

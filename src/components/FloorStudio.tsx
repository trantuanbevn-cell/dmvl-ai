// Mặt bằng tầng làm việc TRỰC TIẾP trong ô hình ảnh: tải DXF của tầng → tự vẽ lại (tường · cột · cửa · nội thất) → sửa, dim, vẽ phòng, xem 3D ngay tại đây.
import { useState } from 'react'
import type { ProjectData } from '../lib/useProject'
import FloorPlans from './FloorPlans'
import Plan3D from './Plan3D'

export default function FloorStudio({ d }: { d: ProjectData }) {
  const [fid, setFid] = useState('')
  return <div style={{ display: 'grid', gap: 10 }}>
    <FloorPlans d={d} studio onAdded={setFid} onPick={setFid} />
    {d.floors.length > 0 && <Plan3D proj={{ id: d.project!.id, floors: d.floors, d }} autoFloor={fid} />}
  </div>
}

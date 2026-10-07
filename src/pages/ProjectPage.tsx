import { NavLink, useParams } from 'react-router-dom'
import { useProject } from '../lib/useProject'
import UploadTab from './tabs/UploadTab'
import AnalyzeTab from './tabs/AnalyzeTab'
import RoomView from './tabs/RoomView'
import MaterialView from './tabs/MaterialView'
import CheckView from './tabs/CheckView'
import ExportTab from './tabs/ExportTab'

const TABS = [
  ['upload', '1. Hồ sơ & phòng'], ['analyze', '2. Phân tích AI'], ['rooms', '3. Theo phòng'],
  ['materials', '4. Theo nhóm vật liệu'], ['check', '5. Kiểm tra đủ'], ['export', '6. Xuất file'],
] as const

export default function ProjectPage() {
  const { id = '', tab = 'upload' } = useParams()
  const data = useProject(id)
  if (!data.project) return <div className="page muted">{data.loading ? 'Đang tải dự án…' : 'Không tìm thấy dự án'}</div>
  const pending = data.entries.filter(e => e.status === 'pending' || e.status === 'review').length
  return (
    <div className="page wide">
      <div className="row between">
        <div><h1>{data.project.name}</h1><div className="muted">{data.project.location}</div></div>
        <div className="stats">
          <span><b>{data.rooms.length}</b> phòng</span><span><b>{data.entries.length}</b> mã</span>
          <span className="warn-text"><b>{pending}</b> chờ duyệt</span>
        </div>
      </div>
      <nav className="tabs">
        {TABS.map(([k, label]) => <NavLink key={k} to={`/p/${id}/${k}`} className={({ isActive }) => (isActive || (tab === k) ? 'active' : '')}>{label}</NavLink>)}
      </nav>
      {tab === 'upload' && <UploadTab d={data} />}
      {tab === 'analyze' && <AnalyzeTab d={data} />}
      {tab === 'rooms' && <RoomView d={data} />}
      {tab === 'materials' && <MaterialView d={data} />}
      {tab === 'check' && <CheckView d={data} />}
      {tab === 'export' && <ExportTab d={data} />}
    </div>
  )
}

import { NavLink, useParams } from 'react-router-dom'
import { useProject } from '../lib/useProject'
import { projectStats, roomStats } from '../lib/progress'
import Bar from '../components/Bar'
import Overview from './tabs/Overview'
import UploadTab from './tabs/UploadTab'
import AnalyzeTab from './tabs/AnalyzeTab'
import RoomView from './tabs/RoomView'
import MaterialView from './tabs/MaterialView'
import CheckView from './tabs/CheckView'
import ExportTab from './tabs/ExportTab'

export default function ProjectPage() {
  const { id = '', tab = 'overview' } = useParams()
  const data = useProject(id)
  if (!data.project) return <div className="page muted">{data.loading ? 'Đang tải dự án…' : 'Không tìm thấy dự án'}</div>
  const ps = projectStats(data)
  const rs = [...roomStats(data).values()]
  const analyzed = rs.filter(r => r.total > 0).length
  const TABS: [string, string, string, string?][] = [
    ['overview', '🏠', 'Tổng quan'],
    ['upload', '📄', 'Hồ sơ & phòng', `${data.rooms.length} phòng`],
    ['analyze', '✨', 'Phân tích', `${analyzed}/${data.rooms.length}`],
    ['rooms', '🛋', 'Theo phòng', ps.pending + ps.review ? `${ps.pending + ps.review} chờ` : undefined],
    ['materials', '🧱', 'Theo vật liệu', `${ps.total} mã`],
    ['check', '✅', 'Kiểm tra đủ'],
    ['export', '⬇', 'Xuất file'],
  ]
  return (
    <div className="page wide">
      <div className="proj-head">
        <div><h1>{data.project.name}</h1><div className="muted small">{data.project.location}</div></div>
        <div className="proj-prog"><div className="small"><b>{ps.pct}%</b> đã xác nhận · {ps.approved}/{ps.total} mã · {data.rooms.length} phòng</div><Bar approved={ps.approved} pending={ps.pending + ps.review} total={ps.total} /></div>
      </div>
      <nav className="steps">
        {TABS.map(([k, ic, label, badge]) => (
          <NavLink key={k} to={`/p/${id}/${k}`} className={({ isActive }) => 'step' + (isActive || tab === k ? ' active' : '')}>
            <span className="step-ic">{ic}</span><span className="step-tx">{label}{badge && <small>{badge}</small>}</span>
          </NavLink>))}
      </nav>
      {tab === 'overview' && <Overview d={data} />}
      {tab === 'upload' && <UploadTab d={data} />}
      {tab === 'analyze' && <AnalyzeTab d={data} />}
      {tab === 'rooms' && <RoomView d={data} />}
      {tab === 'materials' && <MaterialView d={data} />}
      {tab === 'check' && <CheckView d={data} />}
      {tab === 'export' && <ExportTab d={data} />}
    </div>
  )
}

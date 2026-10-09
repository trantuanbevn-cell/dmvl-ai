import { useEffect, useRef } from 'react'
import { syncSharedPages } from '../lib/roomSplit'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import { syncLibrary } from '../lib/matLibrary'
import { useAuth } from '../lib/auth'
import { useProject } from '../lib/useProject'
import { setProjectWords } from '../lib/spell'
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
  const { canEdit } = useAuth()
  // mở dự án → đồng bộ các mã vào thư viện công ty (một lần mỗi lần mở)
  const synced = useRef(false)
  // Slide đã tách phòng: tự gán ô ảnh cho đúng phòng để ảnh đại diện khớp ở mọi màn hình
  useEffect(() => { if (canEdit && !synced.current && !data.loading && data.project && data.pages.length && data.occ.length) { synced.current = true; syncSharedPages(data).then(n => { if (n) data.reload() }).catch(() => {}) } }, [canEdit, data.loading, data.pages.length, data.occ.length]) // eslint-disable-line
  // từ của dự án (hãng, xuất xứ, tên sản phẩm, mã, tên phòng) coi là đúng chính tả
  useEffect(() => { const w = new Set<string>(); const add = (v?: string | null) => (v ?? '').split(/[^\p{L}]+/u).forEach(x => x.length > 1 && w.add(x)); for (const e of data.entries) { add(e.brand); add(e.origin); add(e.product_name); add(e.product_code); try { add(e.product_url ? new URL(e.product_url).hostname : '') } catch { /* */ } } for (const r of data.rooms) { add(r.name_vn); add(r.name_en) } setProjectWords([...w]) }, [data.entries, data.rooms])
  useEffect(() => { if (canEdit && !data.loading && data.project && data.entries.length) syncLibrary(data.project.id, data.entries) }, [canEdit, data.loading, data.project?.id]) // eslint-disable-line
  if (data.project?.kind === 'concept') return <Navigate to={`/c/${id}`} replace />
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
    ['check', '✅', 'QC cuối'],
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
      {!canEdit && <div className="note ro-note">👁 Bạn chỉ có quyền <b>xem</b> – không sửa được dữ liệu. Vẫn xuất file được ở bước “Xuất file”.</div>}
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

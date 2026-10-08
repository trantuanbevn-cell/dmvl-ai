import { useEffect, useState } from 'react'
import { loadSettings, saveSetting } from '../lib/settings'
import { DEFAULT_CHECKLIST, DEFAULT_RULES, DEFAULT_PERF } from '../lib/rules'
import { GROUPS } from '../lib/codes'
import { useAuth } from '../lib/auth'

const KEYS = [
  ['checklist', 'Checklist hạng mục theo loại phòng', DEFAULT_CHECKLIST, 'req: required = bắt buộc (thiếu báo đỏ), common = thường có, na = không áp dụng. keywords: từ khoá để nhận ra hạng mục trong tên mã.'],
  ['rules', 'Quy tắc suy luận hạng mục không thể hiện', DEFAULT_RULES, 'AI chỉ thêm hạng mục suy luận khi điều kiện (trigger) đúng với phòng.'],
  ['perf', 'Tính chất vật liệu theo không gian', DEFAULT_PERF, 'AI dùng bảng này khi viết cột "Tính chất yêu cầu theo không gian".'],
] as const

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<string>('checklist')
  const [msg, setMsg] = useState('')
  useEffect(() => { loadSettings().then(s => setVals({ checklist: JSON.stringify(s.checklist, null, 1), rules: JSON.stringify(s.rules, null, 1), perf: JSON.stringify(s.perf, null, 1) })) }, [])
  const cur = KEYS.find(k => k[0] === tab)!
  const save = async () => {
    try { await saveSetting(tab as any, JSON.parse(vals[tab])); setMsg('Đã lưu.') } catch (e) { setMsg('Lỗi: ' + String(e)) }
  }
  if (!isAdmin) return <div className="page"><div className="card muted">Chỉ quản trị viên mới xem được trang này.</div></div>
  return (
    <div className="page">
      <h1>Cài đặt chung</h1>
      <div className="tabs">
        {KEYS.map(k => <a key={k[0]} className={tab === k[0] ? 'active' : ''} onClick={() => { setTab(k[0]); setMsg('') }}>{k[1]}</a>)}
        <a className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>Hệ ký hiệu</a>
      </div>
      {tab === 'codes' ? (
        <div className="card"><table className="tbl"><thead><tr><th>Mã</th><th>Nhóm (VN)</th><th>Group (EN)</th><th>Mã cũ</th><th>CSI</th><th>Thông tin bắt buộc</th><th>Tiêu chuẩn</th></tr></thead>
          <tbody>{GROUPS.map(g => <tr key={g.code}><td><b>{g.code}</b></td><td>{g.vn}</td><td>{g.en}</td><td>{g.legacy}</td><td className="small">{g.csi}</td><td className="small">{g.attrs_vn}</td><td className="small">{g.std_vn}<br />{g.std_intl}</td></tr>)}</tbody></table></div>
      ) : (
        <div className="card stack">
          <p className="muted">{cur[3]}</p>
          <textarea className="json" value={vals[tab] ?? ''} onChange={e => setVals({ ...vals, [tab]: e.target.value })} />
          <div className="row gap">
            <button className="btn primary" onClick={save}>Lưu</button>
            <button className="btn ghost" onClick={() => setVals({ ...vals, [tab]: JSON.stringify(cur[2], null, 1) })}>Khôi phục mặc định</button>
            <span className="note-text">{msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}

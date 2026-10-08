import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadSettings, type Settings } from '../lib/settings'
import { checkRoom } from '../lib/check'
import { useAuth } from '../lib/auth'
import type { ProjectData } from '../lib/useProject'
import type { Room } from '../lib/types'
import type { AddPreset } from './AddMaterial'

const BY_CAT: Record<string, string> = { floor: 'CT', base: 'BS', wall: 'PT', feature_wall: 'WC', ceiling: 'GWB', door: 'DR', window: 'WT', joinery: 'JN', loose: 'FF', lighting: 'LT', sanitary: 'SF', equipment: 'EQ', decor: 'DC', artwork: 'AW', mep: 'ME' }
const BY_LABEL: [RegExp, string][] = [[/biển|signage/i, 'SN'], [/phụ kiện cửa|hardware|chặn cửa/i, 'HW'], [/ổ cắm|công tắc|socket|switch|exit|emergency|access panel|nắp thăm/i, 'ME'], [/thùng rác|waste/i, 'DC'], [/tranh|artwork/i, 'AW'], [/rèm|blind|curtain/i, 'WT'], [/nẹp|transition|skirting|len/i, 'BS'], [/tủ|kệ|joinery|storage/i, 'JN'], [/gương|mirror/i, 'MR'], [/kính|glass/i, 'GL']]
const groupFor = (label: string, category: string) => BY_LABEL.find(([r]) => r.test(label))?.[1] ?? BY_CAT[category] ?? 'DC'

/** Đề xuất các hạng mục còn thiếu theo checklist – nằm cuối bảng của phòng. Cần thì bấm "Tạo sẵn" để thêm rồi sửa, thừa thì bấm ✕ bỏ */
export default function RoomSuggest({ d, room, onAdd }: { d: ProjectData; room: Room; onAdd: (p: AddPreset) => void }) {
  const { canEdit } = useAuth()
  const [st, setSt] = useState<Settings | null>(null)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { loadSettings().then(setSt) }, [])
  const dismissed: string[] = (room as any).dismissed_suggest ?? []
  const miss = useMemo(() => (st ? checkRoom(d, room, st.checklist).filter(x => !x.ok) : []), [st, d.occ, d.entries, room])
  const vis = miss.filter(x => !dismissed.includes(x.item.label)), hid = miss.filter(x => dismissed.includes(x.item.label))
  const setDis = async (v: string[]) => { await supabase.from('rooms').update({ dismissed_suggest: v }).eq('id', room.id); d.reload() }
  if (!st) return null
  if (!vis.length && !hid.length) return <div className="suggest-box ok-text small">✓ Đã đủ các hạng mục thường có theo checklist của loại phòng này.</div>
  return (
    <div className="suggest-box">
      <div className="row between"><b>Đề xuất hạng mục còn thiếu của phòng này</b><span className="small muted">dựa trên checklist theo loại phòng · bấm “Tạo sẵn” để thêm rồi sửa nội dung, ✕ nếu không cần</span></div>
      {vis.map(x => {
        const [vn, en] = x.item.label.split(' / ')
        return (
          <div key={x.item.label} className={'sg-row ' + (x.level === 'required' ? 'req' : 'com')}>
            <span className="sg-tag">{x.level === 'required' ? 'Bắt buộc' : 'Thường có'}</span>
            <span className="sg-name">{vn}{en ? <span className="muted"> / {en}</span> : null}</span>
            {canEdit && <>
              <button className="btn sm primary" onClick={() => onAdd({ group: groupFor(x.item.label, x.item.category), category: x.item.category, name: vn, name_en: en, hint: `Hạng mục đề xuất: ${x.item.label}. Điền vật liệu/màu rồi tạo – sau đó chỉnh chi tiết trong bảng.` })}>＋ Tạo sẵn</button>
              <button className="btn ghost sm" title="Không cần hạng mục này cho phòng" onClick={() => setDis([...dismissed, x.item.label])}>✕ Bỏ</button></>}
          </div>)
      })}
      {hid.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>Đã bỏ {hid.length} đề xuất. <a style={{ cursor: 'pointer' }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Ẩn' : 'Xem lại'}</a>
        {showAll && hid.map(x => <span key={x.item.label} className="chip" style={{ margin: '2px 4px' }}>{x.item.label} <a style={{ cursor: 'pointer' }} onClick={() => setDis(dismissed.filter(l => l !== x.item.label))}>↺</a></span>)}</div>}
    </div>
  )
}

import { ROOM_TYPES, roomTypeLabel } from '../lib/codes'

/** Chọn loại phòng trong danh sách có sẵn hoặc "＋ Loại khác" để tự gõ tên loại mới (các loại tự gõ đã dùng trong dự án hiện lại để chọn) */
export default function RoomTypeSelect({ value, used, onChange, style }: { value: string; used: (string | null | undefined)[]; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const known = new Set(ROOM_TYPES.map(t => t.key))
  const custom = [...new Set([...used, value].filter((x): x is string => !!x && !known.has(x)))]
  return <select value={value} style={style} onChange={e => {
    if (e.target.value !== '__new') return onChange(e.target.value)
    const n = (window.prompt('Tên loại phòng mới (vd: Sảnh thang, Showroom, Phòng kỹ thuật):') ?? '').trim()
    if (n) onChange(n)
  }}>
    {ROOM_TYPES.map(t => <option key={t.key} value={t.key}>{t.vn}</option>)}
    {custom.map(c => <option key={c} value={c}>{roomTypeLabel(c)}</option>)}
    <option value="__new">＋ Loại khác (tự gõ)…</option>
  </select>
}

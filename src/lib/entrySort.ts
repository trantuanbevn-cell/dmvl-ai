// Sắp xếp thông minh THỨ TỰ các mã trong một mục (vd Nội thất rời): theo loại đồ / theo phòng / theo tên.
// Chỉ đổi thứ tự (mã được đánh lại theo thứ tự mới, như khi kéo thả) – không tạo nhóm mới, không đổi nội dung.
import { floorRank } from './roomMatrix'
import type { Entry, Occurrence, Room } from './types'

/** Loại đồ rời, theo thứ tự hiển thị. re áp lên tên VN + EN (không dấu, chữ thường); loại nào khớp đầu tiên thì lấy */
export const KINDS: { key: string; label: string; re: RegExp }[] = [
  { key: 'sofa', label: 'Sofa', re: /\bsofa\b|ghe dai|ghe bang dai|ghe sofa|sectional/ },
  { key: 'armchair', label: 'Ghế armchair / ghế bành', re: /armchair|ghe banh|ghe don|lounge chair|ghe thu gian|ghe tiep khach|ghe tua|ghe lanh dao ngoi tiep/ },
  { key: 'bar', label: 'Ghế bar / ghế quầy', re: /ghe (quay )?bar|bar ?stool|ghe quay|counter ?stool|ghe cao/ },
  { key: 'dining', label: 'Ghế ăn', re: /ghe an|dining chair|ghe nha hang|ghe tiec|ghe ban an/ },
  { key: 'meeting', label: 'Ghế họp / ghế văn phòng', re: /ghe hop|ghe van phong|ghe xoay|ghe giam doc|ghe lanh dao|task chair|office chair|meeting chair|ghe lam viec|ghe nhan vien/ },
  { key: 'bench', label: 'Ghế băng / ghế chờ / đôn', re: /ghe bang|ghe cho|bench|\bdon\b|pouf|puff|ottoman|ghe dai|stool/ },
  { key: 'chair', label: 'Ghế khác', re: /\bghe\b|chair|seat/ },
  { key: 'coffee', label: 'Bàn trà / bàn bên', re: /ban tra|ban ben|ban goc|coffee table|side table|ban tron|ban nuoc/ },
  { key: 'meetingtable', label: 'Bàn họp', re: /ban hop|meeting table|conference/ },
  { key: 'desk', label: 'Bàn làm việc / bàn giám đốc', re: /ban lam viec|ban giam doc|ban van phong|desk|ban lanh dao/ },
  { key: 'dining_t', label: 'Bàn ăn / bàn tiệc', re: /ban an|ban tiec|dining table|ban bar/ },
  { key: 'table', label: 'Bàn khác', re: /\bban\b|table/ },
  { key: 'counter', label: 'Quầy / quầy lễ tân', re: /quay|reception|counter/ },
  { key: 'storage', label: 'Tủ / kệ', re: /\btu\b|\bke\b|cabinet|shelf|sideboard|tu trung bay/ },
  { key: 'bed', label: 'Giường', re: /giuong|bed/ },
]
const plain = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
export function kindOf(e: Pick<Entry, 'name_vn' | 'name_en' | 'part_vn'>) {
  const t = plain(e.name_vn) + ' | ' + plain(e.name_en)
  const i = KINDS.findIndex(k => k.re.test(t))
  return i < 0 ? { idx: KINDS.length, label: 'Khác' } : { idx: i, label: KINDS[i].label }
}

export type SortMode = 'kind' | 'room' | 'name'
export const SORT_MODES: { key: SortMode; label: string; hint: string }[] = [
  { key: 'kind', label: 'Theo loại đồ', hint: 'Sofa → armchair → ghế bar → ghế ăn → ghế họp → bàn… Trong mỗi loại xếp theo phòng.' },
  { key: 'room', label: 'Theo phòng', hint: 'Theo thứ tự phòng (tầng → số phòng); trong mỗi phòng xếp theo loại đồ.' },
  { key: 'name', label: 'Theo tên A–Z', hint: 'Xếp theo bảng chữ cái của tên hạng mục.' },
]

/** Thứ tự phòng đầu tiên mà mã xuất hiện (nhỏ nhất), để xếp theo phòng */
export function roomKey(e: Entry, occ: Occurrence[], rooms: Room[]): number {
  const rs = new Map(rooms.map(r => [r.id, r]))
  let best = 1e9
  for (const o of occ) { if (o.entry_id !== e.id || !o.room_id) continue; const r = rs.get(o.room_id); if (!r) continue; const k = floorRank(r.floor) * 1e5 + (r.matrix_sort ?? 1e4 + (r.sort ?? 0)); if (k < best) best = k }
  return best
}

/** Trả về danh sách đã sắp (ổn định: bằng nhau thì giữ thứ tự mã cũ) */
export function sortEntries<T extends Entry>(list: T[], mode: SortMode, occ: Occurrence[], rooms: Room[]): T[] {
  const cache = new Map(list.map((e, i) => [e.id, { i, k: kindOf(e).idx, r: roomKey(e, occ, rooms) }]))
  const c = (e: T) => cache.get(e.id)!
  const by = (...f: ((e: T) => number | string)[]) => (a: T, b: T) => { for (const g of f) { const x = g(a), y = g(b); if (x < y) return -1; if (x > y) return 1 } return c(a).i - c(b).i }
  const name = (e: T) => plain(e.name_vn)
  if (mode === 'kind') return [...list].sort(by(e => c(e).k, e => c(e).r, name))
  if (mode === 'room') return [...list].sort(by(e => c(e).r, e => c(e).k, name))
  return [...list].sort(by(name, e => c(e).r))
}

// Sắp xếp thông minh THỨ TỰ các mã trong một mục (vd Nội thất rời): theo loại đồ / theo phòng / theo tên.
// Chỉ đổi thứ tự (mã được đánh lại theo thứ tự mới, như khi kéo thả) – không tạo nhóm mới, không đổi nội dung.
import { floorRank } from './roomMatrix'
import type { Entry, Occurrence, Room } from './types'

export type Kind = { label: string; re: RegExp; rank?: number }
/** Bộ loại theo từng mục (khoá = section.key). Thứ tự trong mảng = thứ tự ưu tiên khi nhận loại; hiển thị theo rank (mặc định = vị trí).
 *  re áp lên tên VN + EN đã bỏ dấu, chữ thường. Mục không có bộ loại (gạch, sơn, đá…) chỉ sắp theo phòng / tên. */
export const KIND_SETS: Record<string, Kind[]> = {
  loose: [
    { label: 'Sofa', re: /\bsofa\b|ghe dai|ghe bang dai|ghe sofa|sectional/ },
    { label: 'Ghế armchair / ghế bành', re: /armchair|ghe banh|ghe don|lounge chair|ghe thu gian|ghe tiep khach|ghe tua/ },
    { label: 'Ghế bar / ghế quầy', re: /ghe (quay )?bar|bar ?stool|ghe quay|counter ?stool|ghe cao/ },
    { label: 'Ghế ăn', re: /ghe an|dining chair|ghe nha hang|ghe tiec|ghe ban an/ },
    { label: 'Ghế họp / ghế văn phòng', re: /ghe hop|ghe van phong|ghe xoay|ghe giam doc|ghe lanh dao|task chair|office chair|meeting chair|ghe lam viec|ghe nhan vien/ },
    { label: 'Ghế băng / ghế chờ / đôn', re: /ghe bang|ghe cho|bench|\bdon\b|pouf|puff|ottoman|stool/ },
    { label: 'Ghế khác', re: /\bghe\b|chair|seat/ },
    { label: 'Bàn trà / bàn bên', re: /ban tra|ban ben|ban goc|coffee table|side table|ban tron|ban nuoc/ },
    { label: 'Bàn họp', re: /ban hop|meeting table|conference/ },
    { label: 'Bàn làm việc / bàn giám đốc', re: /ban lam viec|ban giam doc|ban van phong|desk|ban lanh dao/ },
    { label: 'Bàn ăn / bàn tiệc', re: /ban an|ban tiec|dining table|ban bar/ },
    { label: 'Bàn khác', re: /\bban\b|table/ },
    { label: 'Quầy / quầy lễ tân', re: /quay|reception|counter/ },
    { label: 'Tủ / kệ', re: /\btu\b|\bke\b|cabinet|shelf|sideboard/ },
    { label: 'Giường', re: /giuong|bed/ },
  ],
  joinery: [
    { label: 'Quầy (lễ tân, bar, pha chế)', re: /quay|counter|reception/ },
    { label: 'Giường / đầu giường', re: /giuong|dau giuong|bed|headboard/ },
    { label: 'Ghế băng / banquette liền tường', re: /ghe bang|banquette|bench|ghe liền|ghe lien/ },
    { label: 'Tủ', re: /\btu\b|cabinet|wardrobe|locker/ },
    { label: 'Kệ / giá', re: /\bke\b|\bgia\b|shelf|shelving/ },
    { label: 'Bàn / mặt bàn liền', re: /\bban\b|desk|table|worktop/ },
    { label: 'Vách / ốp liền tường', re: /vach|\bop\b|panel|partition|screen/ },
  ],
  lighting: [
    { label: 'Đèn âm trần / chiếu điểm', re: /am tran|downlight|chieu diem|mat ech|recessed/ },
    { label: 'Đèn thả / đèn chùm', re: /\btha\b|chum|pendant|chandelier|lustre/ },
    { label: 'Đèn tường', re: /den tuong|gan tuong|wall (light|lamp)|sconce|op tuong/ },
    { label: 'Đèn rọi / đèn ray', re: /\broi\b|\bray\b|track|spot ?light|chieu roi/ },
    { label: 'Đèn LED dây / hắt sáng', re: /led day|day led|hat sang|cove|strip|linear|hoc tran|thanh led/ },
    { label: 'Đèn tủ / gương / bàn trang điểm', re: /\btu\b|guong|mirror|trang diem/ },
    { label: 'Đèn bàn / đèn sàn / đèn cây', re: /den ban|den san|den cay|floor lamp|table lamp|standing/ },
    { label: 'Đèn thoát hiểm / sự cố', re: /thoat hiem|su co|exit|emergency/ },
    { label: 'Đèn ngoài trời / sân vườn', re: /ngoai troi|san vuon|outdoor|bollard|cot den|am dat/ },
  ],
  sanitary: [
    { label: 'Bồn cầu', re: /bon cau|toilet|\bwc\b|nap bon cau/, rank: 0 },
    { label: 'Tiểu nam', re: /tieu nam|urinal/, rank: 1 },
    { label: 'Vòi xịt / bidet', re: /voi xit|bidet|xit ve sinh/, rank: 2 },
    { label: 'Vòi chậu / vòi nước', re: /\bvoi\b|faucet|\btap\b|mixer/, rank: 4 },
    { label: 'Chậu rửa / lavabo', re: /chau|lavabo|basin|sink/, rank: 3 },
    { label: 'Sen tắm / vòi sen', re: /\bsen\b|shower/, rank: 5 },
    { label: 'Bồn tắm', re: /bon tam|bathtub|\btub\b/, rank: 6 },
    { label: 'Phụ kiện phòng tắm', re: /giay|moc|\bke\b|thanh|\bly\b|\bhop\b|phu kien|accessor|may say|gia treo/, rank: 7 },
    { label: 'Phễu thu / thoát sàn', re: /pheu|thoat san|drain|ga thu/, rank: 8 },
  ],
  door: [
    { label: 'Tay nắm / khóa', re: /tay nam|handle|\bpull\b|khoa|lock/, rank: 20 },
    { label: 'Bản lề / đóng cửa / chặn cửa', re: /ban le|hinge|dong cua|closer|chan cua|stopper|thoat hiem/, rank: 21 },
    { label: 'Phụ kiện cửa khác', re: /phu kien|hardware|seal|gioang/, rank: 22 },
    { label: 'Cửa đi mở / cửa chính', re: /cua di|cua chinh|cua mo|cua phong|door/, rank: 0 },
    { label: 'Cửa trượt / cửa lùa', re: /truot|lua\b|sliding/, rank: 1 },
    { label: 'Cửa kính khung nhôm', re: /cua kinh|khung nhom|glass door/, rank: 2 },
    { label: 'Cửa thép / chống cháy', re: /chong chay|thep|fire/, rank: 3 },
    { label: 'Cửa sổ', re: /cua so|window/, rank: 4 },
    { label: 'Vách / cửa gập', re: /vach|gap\b|partition|fold/, rank: 5 },
  ],
  equipment: [
    { label: 'Tủ lạnh / tủ mát', re: /tu lanh|tu mat|fridge|refrigerator|tu dong/ },
    { label: 'Bếp / lò / hút mùi', re: /\bbep\b|lo nuong|lo vi song|microwave|oven|hut mui|\bhood\b/ },
    { label: 'Máy rửa chén', re: /rua chen|dishwasher/ },
    { label: 'Máy giặt / sấy', re: /giat|\bsay\b|washer|dryer/ },
    { label: 'Máy pha cà phê / lọc nước', re: /pha ca phe|coffee|loc nuoc|nuoc nong|water|may nuoc/ },
    { label: 'Tivi / màn hình / máy chiếu', re: /tivi|\btv\b|man hinh|may chieu|projector|display|led wall|video wall/ },
    { label: 'Điều hòa / quạt / hút ẩm', re: /dieu hoa|\bquat\b|hut am|air ?con/ },
  ],
  curtain: [
    { label: 'Rèm vải (2 lớp, chống nắng)', re: /rem vai|2 lop|hai lop|drape|blackout|chong nang/ },
    { label: 'Rèm voan / sheer', re: /voan|sheer/ },
    { label: 'Rèm cuốn / roller', re: /cuon|roller|blind/ },
    { label: 'Rèm lá / sáo / vách', re: /\bla\b|\bsao\b|louver|venetian|vach/ },
    { label: 'Ray / thanh / mô tơ', re: /\bray\b|thanh|motor|mo to|rail/ },
  ],
  art: [
    { label: 'Tranh', re: /tranh|painting|canvas/ },
    { label: 'Ảnh / poster', re: /\banh\b|photo|poster|print/ },
    { label: 'Điêu khắc / tượng', re: /dieu khac|tuong|sculpture|statue/ },
    { label: 'Logo / chữ nổi', re: /logo|chu noi|lettering/ },
  ],
  decor: [
    { label: 'Cây / hoa', re: /\bcay\b|\bhoa\b|plant|flower|chau cay/ },
    { label: 'Bình / lọ / chậu', re: /binh|\blo\b|vase|chau/ },
    { label: 'Tượng / đồ trang trí', re: /tuong|decor|ornament|object/ },
    { label: 'Gối / thảm / chăn', re: /\bgoi\b|\btham\b|\bchan\b|cushion|throw|rug/ },
    { label: 'Sách / phụ kiện bàn', re: /sach|book|khay|tray|phu kien/ },
  ],
  sign: [
    { label: 'Biển tên phòng', re: /ten phong|room sign|name ?plate|so phong/ },
    { label: 'Biển chỉ dẫn / hướng', re: /chi dan|huong|direction|wayfinding/ },
    { label: 'Biển thoát hiểm / an toàn', re: /thoat hiem|exit|pccc|an toan|cam |safety/ },
    { label: 'Logo / chữ nổi', re: /logo|chu noi|bieu tuong|lettering/ },
    { label: 'Biển hiệu', re: /bien hieu|signboard|bang hieu/ },
  ],
  mep: [
    { label: 'Ổ cắm / công tắc / data', re: /o cam|cong tac|socket|switch|data|usb/ },
    { label: 'Cửa gió / điều hòa', re: /cua gio|dieu hoa|diffuser|grille|\bfcu\b|\bahu\b/ },
    { label: 'Camera / an ninh', re: /camera|cctv|chuong|access|the tu/ },
    { label: 'PCCC / đầu phun / báo cháy', re: /pccc|dau phun|bao chay|sprinkler|smoke/ },
    { label: 'Cấp thoát nước', re: /cap nuoc|thoat nuoc|\bong\b|\bvan\b/ },
    { label: 'Tủ / hộp điện', re: /tu dien|hop dien|panel|\bdb\b/ },
  ],
}
export const hasKinds = (sectionKey: string) => !!KIND_SETS[sectionKey]
const plain = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
/** Loại của một mã trong mục sectionKey: idx = thứ tự hiển thị (loại không nhận ra → cuối) */
export function kindOf(e: Pick<Entry, 'name_vn' | 'name_en'>, sectionKey = 'loose') {
  const set = KIND_SETS[sectionKey] ?? []
  const t = plain(e.name_vn) + ' | ' + plain(e.name_en)
  const i = set.findIndex(k => k.re.test(t))
  return i < 0 ? { idx: 1000, label: 'Khác' } : { idx: set[i].rank ?? i, label: set[i].label }
}

export type SortMode = 'kind' | 'room' | 'name'
export const SORT_MODES: { key: SortMode; label: string; hint: string }[] = [
  { key: 'kind', label: 'Theo loại', hint: 'Các loại giống nhau nằm liền nhau (vd nội thất rời: sofa → armchair → ghế bar → bàn…; đèn: âm trần → đèn thả → đèn tường…). Trong mỗi loại xếp theo phòng.' },
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
export function sortEntries<T extends Entry>(list: T[], mode: SortMode, occ: Occurrence[], rooms: Room[], sectionKey = 'loose'): T[] {
  const cache = new Map(list.map((e, i) => [e.id, { i, k: kindOf(e, sectionKey).idx, r: roomKey(e, occ, rooms) }]))
  const c = (e: T) => cache.get(e.id)!
  const by = (...f: ((e: T) => number | string)[]) => (a: T, b: T) => { for (const g of f) { const x = g(a), y = g(b); if (x < y) return -1; if (x > y) return 1 } return c(a).i - c(b).i }
  const name = (e: T) => plain(e.name_vn)
  if (mode === 'kind') return [...list].sort(by(e => c(e).k, e => c(e).r, name))
  if (mode === 'room') return [...list].sort(by(e => c(e).r, e => c(e).k, name))
  return [...list].sort(by(name, e => c(e).r))
}

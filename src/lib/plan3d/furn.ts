// Đồ nội thất rời trong mô hình 3D: mỗi món là một khối đặt trên mặt bằng, cao đúng theo chiều cao tiêu chuẩn của loại đồ (không bằng chiều cao tường).
export type FurnShape = 'box' | 'round'
export type FurnType = {
  key: string; label: string; group: 'Ngồi' | 'Bàn' | 'Tủ – kệ – quầy' | 'Ngủ' | 'Vệ sinh' | 'Khác'
  /** cao tiêu chuẩn (m): phần thân/mặt bàn/mặt ngồi */
  h: number
  /** nếu có: tổng chiều cao đến lưng tựa / đầu giường / thùng nước (m) – dựng thêm một dải lưng ở một cạnh dài */
  back?: number
  /** dày dải lưng tựa (m) */
  backT?: number
  shape: FurnShape; w: number; d: number; color: string
}
const T = (key: string, label: string, group: FurnType['group'], w: number, d: number, h: number, color: string, extra: Partial<FurnType> = {}): FurnType => ({ key, label, group, w, d, h, color, shape: 'box', ...extra })
export const FURN_TYPES: FurnType[] = [
  T('chair', 'Ghế ăn / ghế họp (mặt ngồi 450, lưng 900)', 'Ngồi', 0.5, 0.5, 0.45, '#9b7b57', { back: 0.9, backT: 0.06 }),
  T('armchair', 'Ghế bành / sofa đơn (ngồi 420, lưng 850)', 'Ngồi', 0.8, 0.8, 0.42, '#b08968', { back: 0.85, backT: 0.18 }),
  T('sofa', 'Sofa (ngồi 420, lưng 850)', 'Ngồi', 2.0, 0.9, 0.42, '#b08968', { back: 0.85, backT: 0.2 }),
  T('stool', 'Ghế đẩu / ghế bar (650)', 'Ngồi', 0.4, 0.4, 0.65, '#8a6a4a', { shape: 'round' }),
  T('table', 'Bàn ăn / bàn họp (750)', 'Bàn', 1.6, 0.9, 0.75, '#a8865f'),
  T('tableRound', 'Bàn tròn (750)', 'Bàn', 1.2, 1.2, 0.75, '#a8865f', { shape: 'round' }),
  T('desk', 'Bàn làm việc (750)', 'Bàn', 1.4, 0.7, 0.75, '#b59a76'),
  T('coffee', 'Bàn trà / bàn sofa (420)', 'Bàn', 1.0, 0.6, 0.42, '#8f7253'),
  T('side', 'Bàn phụ / táp đầu giường (550)', 'Bàn', 0.5, 0.5, 0.55, '#8f7253'),
  T('counter', 'Quầy lễ tân / quầy bar (1100)', 'Tủ – kệ – quầy', 2.4, 0.7, 1.1, '#7d6a58'),
  T('kitchen', 'Tủ bếp / thiết bị bếp (900)', 'Tủ – kệ – quầy', 1.2, 0.65, 0.9, '#a6a39b'),
  T('fridge', 'Tủ lạnh / tủ đông đứng (1800)', 'Tủ – kệ – quầy', 0.8, 0.75, 1.8, '#c9c9c6'),
  T('cabinet', 'Tủ thấp / tủ trưng bày (800)', 'Tủ – kệ – quầy', 1.2, 0.45, 0.8, '#8f7253'),
  T('tv', 'Kệ tivi (500)', 'Tủ – kệ – quầy', 1.8, 0.4, 0.5, '#6e5b49'),
  T('wardrobe', 'Tủ quần áo / tủ cao (2200)', 'Tủ – kệ – quầy', 1.2, 0.6, 2.2, '#8a7358'),
  T('shelf', 'Kệ sách / kệ trang trí (1900)', 'Tủ – kệ – quầy', 1.0, 0.35, 1.9, '#8a7358'),
  T('bed', 'Giường (đệm 500, đầu giường 1000)', 'Ngủ', 2.0, 1.6, 0.5, '#d8cfc0', { back: 1.0, backT: 0.08 }),
  T('wc', 'Bồn cầu (400, két nước 800)', 'Vệ sinh', 0.7, 0.4, 0.4, '#f1f1ee', { back: 0.8, backT: 0.2 }),
  T('basin', 'Chậu rửa / lavabo (850)', 'Vệ sinh', 0.6, 0.5, 0.85, '#f1f1ee'),
  T('bath', 'Bồn tắm (550)', 'Vệ sinh', 1.7, 0.75, 0.55, '#f1f1ee'),
  T('plant', 'Cây / chậu cây (1200)', 'Khác', 0.5, 0.5, 1.2, '#6b8f5e', { shape: 'round' }),
  T('stage', 'Bục / sân khấu / thảm nền (300)', 'Khác', 3.0, 2.0, 0.3, '#9a9a96'),
  T('group', 'Cụm nội thất gộp (thấp, chưa tách) 450', 'Khác', 3.0, 3.0, 0.45, '#b8a58c'),
  T('generic', 'Đồ rời khác (750)', 'Khác', 1.0, 0.6, 0.75, '#a8865f'),
]
export const furnTypeOf = (k: string) => FURN_TYPES.find(t => t.key === k) ?? FURN_TYPES[FURN_TYPES.length - 1]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
/** Đoán loại đồ từ tên khối/layer, không có thì từ kích thước (m). Chỉ là gợi ý – người dùng đổi loại trong bảng thuộc tính. */
export function classifyFurn(name: string, layer: string, w: number, d: number): string {
  const n = norm(name), a = Math.max(w, d), b = Math.min(w, d), rnd = Math.abs(w - d) / a < 0.12
  const has = (re: RegExp) => re.test(n)
  if (n) {
    if (has(/fridge|refriger|freezer|tu lanh|tu dong|chiller/)) return 'fridge'
    if (has(/\b(bar ?)?stool\b|ghe dau|ghe bar/)) return 'stool'
    if (has(/arm ?chair|lounge chair|ghe banh|sofa don|single sofa/)) return 'armchair'
    if (has(/sofa|couch|banquette|sectional|ghe dai/)) return 'sofa'
    if (has(/chair|\bghe\b|aaron|seat/)) return 'chair'
    if (has(/\bbed\b|giuong|mattress/)) return 'bed'
    if (has(/wardrobe|closet|locker|tu quan ao|tu cao/)) return 'wardrobe'
    if (has(/urinal|toilet|\bwc\b|bon cau/)) return 'wc'
    if (has(/basin|lavabo|wash ?hand|chau rua|sink/) && a < 1.0) return 'basin'
    if (has(/bath ?tub|bathtub|bon tam/)) return 'bath'
    if (has(/reception|counter|quay|\bbar\b/)) return 'counter'
    if (has(/kitchen|tu bep|dishwash|oven|stove|cooker|hood|cart|trolley|dispenser|machine|may /)) return 'kitchen'
    if (has(/coffee|ban tra|tea table|center table/)) return 'coffee'
    if (has(/desk|ban lam viec|workstation/)) return 'desk'
    if (has(/table|\bban\b/)) return rnd && a < 1.8 ? 'tableRound' : 'table'
    if (has(/shelf|book ?case|ke sach|\bke\b/)) return 'shelf'
    if (has(/tv ?unit|ke tivi|\btv\b/)) return 'tv'
    if (has(/cabinet|credenza|sideboard|\btu\b/)) return 'cabinet'
    if (has(/plant|\bcay\b|vase|\bpot\b|chau cay/)) return 'plant'
    if (has(/stage|san khau|podium|\bbuc\b|carpet|tham/)) return 'stage'
  }
  const area = w * d
  if (area > 5) return 'group'
  if (a < 0.35) return 'side'
  if (a <= 0.75 && b >= 0.3) return rnd ? 'chair' : 'side'
  if (rnd && a >= 0.8 && a <= 1.8) return 'tableRound'
  if (a >= 1.6 && b >= 0.3 && b <= 0.65) return 'cabinet'
  if (b >= 0.5 && a <= 2.6) return 'table'
  return 'generic'
}

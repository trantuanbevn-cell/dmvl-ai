// Bộ dàn trang concept: STYLE = bài mẫu (bố cục, màu, chữ) – sau chỉ thay ảnh và nội dung. Khổ trang 1920×1080 (16:9) đúng file Canva mẫu.
import { measure } from './sheetLayout'
export type PaperSize = 'A3' | 'A2'
/** pt = khổ in ngang theo bề rộng giấy (1pt = 1/72 inch), chiều cao giữ tỉ lệ 16:9 như Canva; scale = hệ số dựng ảnh từ trang 1920 px */
export const PAPER: Record<PaperSize, { pt: [number, number]; scale: number; label: string }> = {
  A3: { pt: [1190.55, 669.69], scale: 2, label: 'Rộng A3 (420 mm) – 16:9' },
  A2: { pt: [1683.78, 947.0], scale: 2, label: 'Rộng A2 (594 mm) – 16:9' },
}
export type PageType = 'cover' | 'zone' | 'render' | 'closing'
export type DeckPage = { id: string; type: PageType; title?: string; subtitle?: string; body?: string; notes?: string; brand?: string; head?: string; area?: string; img?: Record<string, string> }
export type Deck = { style: string; size: PaperSize; pages: DeckPage[] }
export type Theme = { bg: string; bg2: string; rust: string; orange: string; taupe: string; ink: string; ink2: string; red: string; text: string; panel: string; slot: string; serif: string; sans: string }
export type StyleDef = { key: string; name: string; desc: string; theme: Theme; pages: () => DeckPage[] }
export const PAGE_TYPES: Record<PageType, { label: string; slots: { key: string; label: string }[]; hint: string }> = {
  cover: { label: 'Bìa', slots: [{ key: 'hero', label: 'Ảnh bìa' }], hint: 'Tên dự án + ảnh phối cảnh dọc có viền trắng' },
  zone: { label: 'Mặt bằng khu', slots: [{ key: 'plan', label: 'Mặt bằng phóng to' }, { key: 'key', label: 'Key-plan' }], hint: 'Khung mặt bằng viền đỏ + ghi chú diện tích + key-plan' },
  render: { label: 'Phối cảnh không gian', slots: [{ key: 'main', label: 'Ảnh phối cảnh' }, { key: 'key', label: 'Key-plan' }], hint: 'Ảnh lớn bên phải, cột xám tên + diện tích bên trái' },
  closing: { label: 'Trang kết', slots: [], hint: 'Cảm ơn / thông tin liên hệ' },
}
const id = () => Math.random().toString(36).slice(2, 9)
export const newPage = (type: PageType): DeckPage => ({
  id: id(), type,
  title: { cover: 'WESTIN HOTEL', zone: '', render: 'SHARED OFFICE', closing: 'THANK YOU!' }[type],
  subtitle: { cover: 'CONCEPT THIẾT KẾ NỘI THẤT BOH', zone: '', render: 'VĂN PHÒNG CHUNG', closing: '' }[type],
  brand: type === 'zone' || type === 'render' ? 'BOH WESTIN HOTEL' : '',
  head: { cover: '', zone: 'MẶT BẰNG VĂN PHÒNG - HẦM B2', render: 'CONCEPT NỘI THẤT KHU VĂN PHÒNG HẦM B2', closing: '' }[type],
  area: type === 'render' ? 'S=73M²' : '',
  body: type === 'cover' ? 'NO.269 KIM MA, GIANG VO, HA NOI' : type === 'render' ? '' : type === 'closing' ? 'GS-Archi' : '',
  notes: type === 'zone' ? 'CASHIER (PHÒNG THU NGÂN)|S=6M²\nFINANCE (BỘ PHẬN TÀI CHÍNH)|S=14.5M²' : '', img: {},
})
export const STYLES: StyleDef[] = [
  { key: 'westin', name: 'Westin BOH – Canva', desc: 'Sao chép từ file Canva “BOH WESTIN HOTEL HA NOI – Final concept”: 1920×1080, nền kem, khối gạch/cam, dải taupe, khung đỏ.',
    theme: { bg: '#f4f3f2', bg2: '#efece7', rust: '#803118', orange: '#b6654b', taupe: '#9c918c', ink: '#464734', ink2: '#60614d', red: '#a2595b', text: '#444444', panel: '#dbdbdb', slot: '#e6e2dd', serif: 'Georgia, "Times New Roman", serif', sans: '"Helvetica Neue", Arial, sans-serif' },
    pages: () => ['cover', 'zone', 'render', 'closing'].map(t => newPage(t as PageType)) },
  { key: 'minimal', name: 'Tối giản trắng – đen', desc: 'Cùng bố cục 16:9 nhưng màu đơn sắc xám – đen, gọn cho bộ hồ sơ in trắng đen.',
    theme: { bg: '#ffffff', bg2: '#ffffff', rust: '#2b2b2b', orange: '#8a8a8a', taupe: '#d0d0d0', ink: '#1f1f1f', ink2: '#1f1f1f', red: '#444444', text: '#222222', panel: '#e4e4e4', slot: '#ececec', serif: 'Arial, Helvetica, sans-serif', sans: 'Arial, Helvetica, sans-serif' },
    pages: () => ['cover', 'zone', 'render', 'closing'].map(t => newPage(t as PageType)) },
]
export const styleOf = (k?: string) => STYLES.find(s => s.key === k) ?? STYLES[0]
export const newDeck = (style: string): Deck => ({ style, size: 'A3', pages: styleOf(style).pages() })
/** Ngắt dòng theo bề rộng (có tôn trọng xuống dòng của người dùng) */
export function wrapText(t: string, size: number, maxW: number, bold = false): string[] {
  const out: string[] = []
  for (const para of (t || '').split('\n')) {
    let cur = ''
    for (const w of para.split(/\s+/).filter(Boolean)) { const n = cur ? cur + ' ' + w : w; if (measure(n, size, bold) <= maxW || !cur) cur = n; else { out.push(cur); cur = w } }
    out.push(cur)
  }
  return out
}

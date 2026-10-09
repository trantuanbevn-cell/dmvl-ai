// Bộ dàn trang concept: STYLE (khung sườn có sẵn) + các trang. Trang theo tỉ lệ giấy A (1920×1358), in A3 chuẩn, tối đa A2.
import { measure } from './sheetLayout'
export type PaperSize = 'A3' | 'A2'
/** pt = khổ giấy ngang (1pt = 1/72 inch); scale = hệ số dựng ảnh từ trang 1920 px (A3 ≈ 235 dpi, A2 ≈ 180 dpi) */
export const PAPER: Record<PaperSize, { pt: [number, number]; scale: number; label: string }> = {
  A3: { pt: [1190.55, 841.89], scale: 2, label: 'A3 (420×297 mm) – chuẩn' },
  A2: { pt: [1683.78, 1190.55], scale: 2.2, label: 'A2 (594×420 mm) – tối đa' },
}
export type PageType = 'cover' | 'zone' | 'render' | 'closing'
export type DeckPage = { id: string; type: PageType; title?: string; subtitle?: string; body?: string; notes?: string; img?: Record<string, string> }
export type Deck = { style: string; size: PaperSize; pages: DeckPage[] }
export type Theme = { bg: string; band: string; ink: string; panel: string; panelInk: string; slot: string; serif: string; sans: string }
export type StyleDef = { key: string; name: string; desc: string; theme: Theme; pages: () => DeckPage[] }
export const PAGE_TYPES: Record<PageType, { label: string; slots: { key: string; label: string }[]; hint: string }> = {
  cover: { label: 'Bìa', slots: [{ key: 'hero', label: 'Ảnh bìa' }], hint: 'Tên dự án + ảnh phối cảnh lớn' },
  zone: { label: 'Mặt bằng khu (phóng to)', slots: [{ key: 'plan', label: 'Mặt bằng phóng to' }, { key: 'key', label: 'Key-plan' }], hint: 'Ô ảnh mặt bằng phóng to + ghi chú + key-plan' },
  render: { label: 'Phối cảnh', slots: [{ key: 'main', label: 'Ảnh phối cảnh' }, { key: 'key', label: 'Key-plan' }], hint: 'Ảnh lớn bên phải, cột xám mô tả bên trái + key-plan' },
  closing: { label: 'Trang kết', slots: [], hint: 'Cảm ơn / thông tin liên hệ' },
}
const id = () => Math.random().toString(36).slice(2, 9)
export const newPage = (type: PageType): DeckPage => ({
  id: id(), type,
  title: { cover: 'TÊN DỰ ÁN', zone: 'KHU VỰC', render: 'TÊN KHÔNG GIAN', closing: 'CẢM ƠN' }[type],
  subtitle: { cover: 'CONCEPT DESIGN', zone: 'MẶT BẰNG PHÓNG TO', render: '', closing: '' }[type],
  body: type === 'render' ? 'Mô tả ý tưởng thiết kế, vật liệu chủ đạo, không khí không gian…' : type === 'closing' ? 'GS-Archi' : '',
  notes: type === 'zone' ? '1 – Tên không gian\n2 – Tên không gian' : '', img: {},
})
export const STYLES: StyleDef[] = [
  { key: 'westin', name: 'Westin BOH – Canva', desc: 'Nền kem, dải taupe, tiêu đề serif olive; trang phối cảnh có cột xám bên trái. Dựng từ mẫu Canva của công ty.',
    theme: { bg: '#f4f3f0', band: '#9d948d', ink: '#5e5e4a', panel: '#8a8a8a', panelInk: '#ffffff', slot: '#e3ded8', serif: 'Georgia, "Times New Roman", serif', sans: 'Arial, Helvetica, sans-serif' },
    pages: () => ['cover', 'zone', 'render', 'closing'].map(t => newPage(t as PageType)) },
  { key: 'minimal', name: 'Tối giản trắng – đen', desc: 'Nền trắng, chữ đen, dải xám nhạt – gọn cho bộ hồ sơ in đơn sắc.',
    theme: { bg: '#ffffff', band: '#d0d0d0', ink: '#1f1f1f', panel: '#2b2b2b', panelInk: '#ffffff', slot: '#ececec', serif: 'Arial, Helvetica, sans-serif', sans: 'Arial, Helvetica, sans-serif' },
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

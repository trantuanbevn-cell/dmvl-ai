// Bộ dàn trang concept: STYLE = bài mẫu (bố cục, màu, chữ) – sau chỉ thay ảnh và nội dung. Khổ trang 1920×1080 (16:9) đúng file Canva mẫu.
import { measure } from './sheetLayout'
export type PaperSize = 'A3' | 'A2'
/** pt = khổ in ngang theo bề rộng giấy (1pt = 1/72 inch), chiều cao giữ tỉ lệ 16:9 như Canva; scale = hệ số dựng ảnh từ trang 1920 px */
export const PAPER: Record<PaperSize, { pt: [number, number]; scale: number; label: string }> = {
  A3: { pt: [1190.55, 669.69], scale: 2, label: 'Rộng A3 (420 mm) – 16:9' },
  A2: { pt: [1683.78, 947.0], scale: 2, label: 'Rộng A2 (594 mm) – 16:9' },
}
export type PageType = 'cover' | 'zone' | 'render' | 'closing' | 'blank'
/** Phần tử trên trang (như Canva): hình chữ nhật, chữ, ảnh – kéo/thả/đổi cỡ/xoay tự do. Toạ độ theo trang 1920×1080 */
export type El = {
  id: string; k: 'rect' | 'text' | 'image'; x: number; y: number; w: number; h: number; r?: number; op?: number; lock?: boolean
  fill?: string; stroke?: string; sw?: number; rx?: number
  t?: string; size?: number; b?: boolean; i?: boolean; c?: string; al?: 'start' | 'middle' | 'end'; f?: 'serif' | 'sans'; ls?: number; lh?: number; up?: boolean
  src?: string; fit?: 'cover' | 'contain'; label?: string
}
export type DeckPage = {
  id: string; bg?: string; els?: El[]
  /** các trường cũ (bản trước) – tự đổi sang els khi mở */
  type?: PageType; title?: string; subtitle?: string; body?: string; notes?: string; brand?: string; head?: string; area?: string; img?: Record<string, string>
}
export type Deck = { style: string; size: PaperSize; pages: DeckPage[] }
export type Theme = { bg: string; bg2: string; rust: string; orange: string; taupe: string; ink: string; ink2: string; red: string; text: string; panel: string; slot: string; serif: string; sans: string }
export type StyleDef = { key: string; name: string; desc: string; theme: Theme; pages: () => DeckPage[] }
export const PAGE_TYPES: Record<PageType, { label: string; hint: string }> = {
  cover: { label: 'Bìa', hint: 'Tên dự án + ảnh phối cảnh dọc có viền trắng' },
  zone: { label: 'Mặt bằng khu', hint: 'Khung mặt bằng viền đỏ + ghi chú diện tích + key-plan' },
  render: { label: 'Phối cảnh không gian', hint: 'Ảnh lớn bên phải, cột xám tên + diện tích bên trái' },
  closing: { label: 'Trang kết', hint: 'Cảm ơn / thông tin liên hệ' },
  blank: { label: 'Trang trống', hint: 'Chỉ có nền – tự thêm chữ, ảnh, khối màu' },
}
export const uid = () => Math.random().toString(36).slice(2, 9)
const R = (x: number, y: number, w: number, h: number, fill: string, o: Partial<El> = {}): El => ({ id: uid(), k: 'rect', x, y, w, h, fill, ...o })
const T = (x: number, y: number, w: number, t: string, size: number, c: string, o: Partial<El> = {}): El => ({ id: uid(), k: 'text', x, y, w, h: 0, t, size, c, lh: 1.3, f: 'sans', al: 'start', ...o })
const I = (x: number, y: number, w: number, h: number, label: string, o: Partial<El> = {}): El => ({ id: uid(), k: 'image', x, y, w, h, label, fit: 'cover', fill: '#e6e2dd', ...o })
/** Dựng các phần tử của 1 loại trang theo màu của style (số liệu lấy từ file Canva Westin mẫu) */
export function templateEls(type: PageType, th: Theme): El[] {
  const hdr = (z: boolean, brand: string, head: string): El[] => z
    ? [R(1771.5, 16.2, 148.5, 48.7, th.taupe), R(0, 70.5, 1236.8, 48.7, th.taupe),
      T(1242.7, 8.7, 522.4, brand, 46, th.ink2, { f: 'serif', al: 'middle', lh: 1.26, up: true }), T(1236.8, 79.2, 627, head, 33.3, th.ink2, { b: true, al: 'end', lh: 1.05, up: true, ls: 0.7 })]
    : [R(1556.8, 16.2, 363.2, 48.7, th.taupe), R(0, 70.5, 1043.9, 48.7, th.taupe),
      T(1043.9, 8.7, 522.4, brand, 46, th.ink2, { f: 'serif', al: 'middle', lh: 1.26, up: true }), T(1056.8, 74.8, 839.5, head, 33.3, th.ink2, { b: true, al: 'end', lh: 1.05, up: true, ls: 0.7 })]
  if (type === 'cover') return [
    R(1645.6, 0, 274.4, 458.3, th.rust), R(1064.2, 513.8, 187.1, 566.2, th.rust), R(1251.2, 458.3, 668.8, 621.7, th.orange),
    I(1115.4, 108, 696.6, 864, 'Ảnh bìa (dọc)', { stroke: '#ffffff', sw: 10 }),
    R(1064.2, 87.4, 187.1, 178.9, th.orange), R(0, 902.1, 654.5, 69.9, th.orange), R(0, 0, 389.1, 45.6, th.rust),
    T(40.2, 266.3, 700, 'CONCEPT THIẾT KẾ NỘI THẤT BOH', 36.9, th.ink, { lh: 1.4 }),
    T(35, 350.3, 1020, 'WESTIN HOTEL', 86.6, th.ink, { f: 'serif', lh: 1.22, ls: -1 }),
    T(35, 916.5, 620, 'NO.269 KIM MA, GIANG VO, HA NOI', 34.7, '#ffffff', { lh: 1.2 })]
  if (type === 'zone') return [
    I(37.7, 158.4, 1251.5, 874.1, 'Mặt bằng phóng to (tải ảnh)', { stroke: th.red, sw: 4 }), ...hdr(true, 'BOH WESTIN HOTEL', 'MẶT BẰNG VĂN PHÒNG - HẦM B2'),
    I(1350, 685, 562.8, 339.9, 'Key-plan', { op: 0.85 }),
    T(1343.2, 147.7, 350, 'Ghi chú:', 24.4, th.red, { b: true, lh: 1.4, ls: 1.7 }), T(1343.2, 182, 350, 'diện tích các khu vực', 19.3, th.text, { b: true, lh: 1.4 }),
    T(1343.2, 226, 250, 'CASHIER (PHÒNG THU NGÂN)\nFINANCE (BỘ PHẬN TÀI CHÍNH)', 13, th.text, { lh: 1.6 }), T(1590, 226, 120, 'S=6M²\nS=14.5M²', 13, th.text, { lh: 1.6 }),
    R(1661.3, 890.4, 199.4, 134.6, 'none', { stroke: th.red, sw: 4, rx: 19 })]
  if (type === 'render') return [
    R(0, 139.9, 442.2, 913.9, th.panel), I(465.8, 139.9, 1431.8, 913.9, 'Ảnh phối cảnh (tải ảnh)'), I(41.6, 735, 360, 300, 'Key-plan'),
    ...hdr(false, 'BOH WESTIN HOTEL', 'CONCEPT NỘI THẤT KHU VĂN PHÒNG HẦM B2'),
    T(41.6, 245.4, 390, 'SHARED OFFICE', 26.1, th.text, { b: true, lh: 1.4, ls: 3, up: true }), T(41.6, 281.4, 390, 'VĂN PHÒNG CHUNG', 26.1, th.ink2, { b: true, lh: 1.4, ls: 3, up: true }),
    T(41.6, 329.3, 390, 'S=73M²', 21.8, th.text, { i: true, lh: 1.4, ls: 2.6 }), T(41.6, 385, 360, 'Mô tả ý tưởng, vật liệu chủ đạo, không khí không gian…', 18, th.text, { lh: 1.45 })]
  if (type === 'closing') return [
    R(0, 0, 389.1, 45.6, th.rust), R(1645.6, 0, 274.4, 458.3, th.rust), R(1251.2, 458.3, 668.8, 621.7, th.orange), R(0, 902.1, 654.5, 69.9, th.orange),
    T(140, 430, 1000, 'THANK YOU!', 86.6, th.ink, { f: 'serif', lh: 1.22, ls: -1 }), T(144, 560, 1000, 'GS-Archi', 30, th.ink, { lh: 1.4 })]
  return []
}
export const bgOf = (type: PageType, th: Theme) => (type === 'cover' || type === 'closing' ? th.bg2 : th.bg)
export const newPage = (type: PageType, th: Theme = STYLES[0].theme): DeckPage => ({ id: uid(), bg: bgOf(type, th), els: templateEls(type, th) })
/** Trang kiểu cũ (type/title/img…) → phần tử, giữ nội dung đã nhập */
export function migratePage(p: DeckPage, th: Theme): DeckPage {
  if (p.els) return p
  const type = p.type ?? 'blank', np = newPage(type, th), els = np.els!
  const txt = (match: (e: El) => boolean, v?: string) => { const e = els.find(match); if (e && v != null && v !== '') e.t = v }
  const texts = els.filter(e => e.k === 'text'), imgs = els.filter(e => e.k === 'image')
  if (type === 'cover') { txt(e => e === texts[0], p.subtitle); txt(e => e === texts[1], p.title); txt(e => e === texts[2], p.body) }
  if (type === 'zone' || type === 'render') {
    txt(e => e === texts[0], p.brand); txt(e => e === texts[1], p.head)
    if (type === 'render') { txt(e => e === texts[2], p.title); txt(e => e === texts[3], p.subtitle); txt(e => e === texts[4], p.area); txt(e => e === texts[5], p.body) }
    else if (p.notes) { const rows = p.notes.split('\n').filter(Boolean).map(l => l.split('|')); const nm = texts.find(e => e.t?.startsWith('CASHIER')), ar = texts.find(e => e.t?.startsWith('S=6')); if (nm) nm.t = rows.map(r => r[0] ?? '').join('\n'); if (ar) ar.t = rows.map(r => r[1] ?? '').join('\n') }
  }
  if (type === 'closing') { txt(e => e === texts[0], p.title); txt(e => e === texts[1], p.body) }
  const keys = type === 'cover' ? ['hero'] : type === 'zone' ? ['plan', 'key'] : type === 'render' ? ['main', 'key'] : []
  keys.forEach((k, i) => { if (p.img?.[k] && imgs[i]) imgs[i].src = p.img[k] })
  return { id: p.id, bg: np.bg, els }
}
export const normDeck = (d: Deck): Deck => (d.pages.some(p => !p.els) ? { ...d, pages: d.pages.map(p => migratePage(p, styleOf(d.style).theme)) } : d)
export const STYLES: StyleDef[] = [
  { key: 'westin', name: 'Westin BOH – Canva', desc: 'Sao chép từ file Canva “BOH WESTIN HOTEL HA NOI – Final concept”: 1920×1080, nền kem, khối gạch/cam, dải taupe, khung đỏ.',
    theme: { bg: '#f4f3f2', bg2: '#efece7', rust: '#803118', orange: '#b6654b', taupe: '#9c918c', ink: '#464734', ink2: '#60614d', red: '#a2595b', text: '#444444', panel: '#dbdbdb', slot: '#e6e2dd', serif: 'Georgia, "Times New Roman", serif', sans: '"Helvetica Neue", Arial, sans-serif' },
    pages: function () { return ['cover', 'zone', 'render', 'closing'].map(t => newPage(t as PageType, this.theme)) } },
  { key: 'minimal', name: 'Tối giản trắng – đen', desc: 'Cùng bố cục 16:9 nhưng màu đơn sắc xám – đen, gọn cho bộ hồ sơ in trắng đen.',
    theme: { bg: '#ffffff', bg2: '#ffffff', rust: '#2b2b2b', orange: '#8a8a8a', taupe: '#d0d0d0', ink: '#1f1f1f', ink2: '#1f1f1f', red: '#444444', text: '#222222', panel: '#e4e4e4', slot: '#ececec', serif: 'Arial, Helvetica, sans-serif', sans: 'Arial, Helvetica, sans-serif' },
    pages: function () { return ['cover', 'zone', 'render', 'closing'].map(t => newPage(t as PageType, this.theme)) } },
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

let mctx: CanvasRenderingContext2D | null = null
export const fontStack = (th: Theme, e: El) => (e.f === 'serif' ? th.serif : th.sans)
/** Ngắt dòng của phần tử chữ theo bề rộng khung + font thật của nó */
export function wrapEl(e: El, th: Theme): string[] {
  mctx ??= document.createElement('canvas').getContext('2d')!
  const size = e.size ?? 24; mctx.font = `${e.i ? 'italic ' : ''}${e.b ? 'bold ' : ''}${size}px ${fontStack(th, e)}`
  const ls = e.ls ?? 0, m = (t: string) => mctx!.measureText(t).width + ls * t.length, out: string[] = []
  for (const para of ((e.up ? (e.t ?? '').toUpperCase() : e.t) ?? '').split('\n')) {
    let cur = ''
    for (const w of para.split(' ')) { const n = cur ? cur + ' ' + w : w; if (m(n) <= e.w || !cur) cur = n; else { out.push(cur); cur = w } }
    out.push(cur)
  }
  return out
}
export const elHeight = (e: El, th: Theme) => (e.k === 'text' ? wrapEl(e, th).length * (e.size ?? 24) * (e.lh ?? 1.3) : e.h)

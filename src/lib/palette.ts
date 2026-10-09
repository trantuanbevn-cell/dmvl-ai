/** Bảng màu sàn các không gian trên mặt bằng tổng (lấy theo mẫu Canva) */
export const PALETTE = ['#f2c6d4', '#c9ccd1', '#c3dbe6', '#b9c7d6', '#c6e5bd', '#dcead2', '#d8d8b0', '#ecd9c6', '#e3d2b4', '#f0b9a4', '#e8a9b4', '#bfd9b4', '#d6c6e6', '#b8e0e6', '#f5e0a0', '#f7cfa6', '#cfe3a8', '#a9d8cc']
export const NEUTRAL = '#e3ded8'

const hsl2hex = (h: number, s: number, l: number) => { const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0') }; return `#${f(0)}${f(8)}${f(4)}` }
/** màu pastel tự động, khác nhau theo thứ tự phòng */
export const autoRoomColor = (i: number) => hsl2hex((Math.max(0, i) * 137.508) % 360, 0.5 + (i % 3) * 0.1, 0.8 + (i % 2) * 0.05)

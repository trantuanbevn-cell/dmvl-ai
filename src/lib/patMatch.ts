// Hồ sơ vân (nhãn do AI đọc 1 lần) và phép so khớp bằng phần mềm.
export type Pat = { family: string; pattern: string; direction: string; scale: string; contrast: string; tone: string; gloss: string; desc?: string }
export const PAT_LABEL: Record<string, string> = {
  plain: 'trơn/đều', straight_grain: 'vân thẳng', wavy_grain: 'vân sóng', cathedral: 'vân vòm', ribbed_linear: 'nan/rãnh song song', herringbone_chevron: 'xương cá', faceted_polygon: 'mảng đa giác/mặt cắt',
  geometric_repeat: 'hoạ tiết hình học lặp', large_motif: 'hoạ tiết lớn', veined: 'vân đá có gân', cloudy: 'loang mây', speckled: 'đốm/hạt', woven: 'dệt', other: 'khác',
}
const GROUPS: string[][] = [['plain'], ['straight_grain', 'wavy_grain', 'cathedral', 'ribbed_linear'], ['faceted_polygon', 'geometric_repeat', 'herringbone_chevron'], ['veined', 'cloudy'], ['speckled'], ['woven'], ['large_motif']]
const grp = (p: string) => GROUPS.findIndex(g => g.includes(p))
function patSimilar(a: string, b: string) {
  if (a === b) return 1
  if (a === 'other' || b === 'other') return 0.2
  if (a === 'cloudy' && b === 'plain' || a === 'plain' && b === 'cloudy') return 0.5
  const ga = grp(a), gb = grp(b)
  return ga >= 0 && ga === gb ? 0.55 : 0
}
const TONES = ['white', 'cream', 'beige', 'light_grey', 'grey', 'dark_grey', 'black']
const BROWNS = ['cream', 'beige', 'light_brown', 'mid_brown', 'dark_brown', 'black']
function toneSim(a: string, b: string) {
  if (a === b) return 1
  if (a === 'multi' || b === 'multi') return 0.5
  const near = (L: string[]) => (L.includes(a) && L.includes(b) ? 1 - Math.abs(L.indexOf(a) - L.indexOf(b)) / 3 : -1)
  return Math.max(0, near(BROWNS), near(TONES), 0)
}
const ORD = (L: string[], a: string, b: string) => { const i = L.indexOf(a), j = L.indexOf(b); return i < 0 || j < 0 ? 0.5 : 1 - Math.abs(i - j) / (L.length - 1) }
function dirSim(a: string, b: string) {
  if (a === b) return 1
  if (a === 'multi' || b === 'multi') return 0.5
  if (a === 'none' || b === 'none') return 0.4
  return (a === 'horizontal' && b === 'vertical') || (a === 'vertical' && b === 'horizontal') ? 0.6 : 0.4   // vân có thể ốp xoay 90°
}
/** Độ giống hồ sơ vân 0..1 – VÂN/HOA VĂN là chính, màu chỉ là phụ */
export function patScore(q: Pat, m: Pat): number {
  return 0.46 * patSimilar(q.pattern, m.pattern) + 0.12 * dirSim(q.direction, m.direction) + 0.12 * ORD(['fine', 'medium', 'coarse'], q.scale, m.scale)
    + 0.05 * ORD(['low', 'medium', 'high'], q.contrast, m.contrast) + 0.17 * toneSim(q.tone, m.tone) + 0.05 * (q.family === m.family ? 1 : 0) + 0.03 * ORD(['matte', 'satin', 'gloss'], q.gloss, m.gloss)
}
export const validPat = (p: any): p is Pat => !!p && typeof p.pattern === 'string' && typeof p.tone === 'string'

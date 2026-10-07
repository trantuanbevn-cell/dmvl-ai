// Phân loại trang & gom phòng KHÔNG dùng AI – dựa vào chữ trong PDF (tiêu đề trang, ô số liệu).
// AI chỉ là phương án dự phòng cho PDF dạng ảnh scan (không có chữ).

export type Count = { label: string; qty: number; unit: string }
export type LocalPage = { page_no: number; text: string | null }
export type LocalResult = {
  page_no: number; kind: 'cover' | 'moodboard' | 'plan' | 'render' | 'other' | 'unknown'
  room_key: string | null; room_title: string | null; room_name_vn: string | null; room_type: string
  counts: Count[]; box_title: string | null
}

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()

// Từ điển tên phòng phổ biến EN → VN (người dùng sửa lại được)
const DICT: [RegExp, string, string][] = [
  [/team ?member din+ing|staff din+ing|canteen|cafeteria|din+ing/, 'Phòng ăn nhân viên', 'dining'],
  [/locker|changing|change room/, 'Phòng thay đồ nhân viên', 'locker_wc'],
  [/toilet|restroom|washroom|\bwc\b|bathroom/, 'Phòng vệ sinh', 'locker_wc'],
  [/shower/, 'Khu tắm', 'locker_wc'],
  [/knowledge|training|learning|class/, 'Phòng học & thư giãn', 'lounge_training'],
  [/relax|lounge|break ?room/, 'Phòng nghỉ nhân viên', 'lounge_training'],
  [/meeting|conference|board ?room/, 'Phòng họp', 'meeting'],
  [/pantry|tea room/, 'Pantry', 'pantry'],
  [/office|work ?space|admin/, 'Văn phòng', 'office'],
  [/corridor|lobby|circulation|hallway/, 'Hành lang', 'corridor'],
  [/store|storage|warehouse|workshop|linen|uniform/, 'Kho / xưởng', 'storage'],
  [/clinic|medical|nurse|first aid/, 'Phòng y tế', 'clinic'],
  [/security|guard/, 'Phòng bảo vệ', 'office'],
  [/kitchen/, 'Bếp', 'pantry'],
]
const PLAN_RE = /\b(layout|plan|floor plan|mat bang)\b/

export function guessRoom(title: string): { vn: string; type: string } {
  const n = norm(title)
  for (const [re, vn, type] of DICT) if (re.test(n)) return { vn, type }
  return { vn: title.trim(), type: 'other' }
}

const UNIT = String.raw`(Seats?|Tables?|Counters?|Sinks?|Lockers?|Toilets?|Showers?|Sets?|Pcs|Beds?|Desks?|Chairs?|Sofas?|Units?|Ghế|Bàn|Bộ|Cái|Chiếc)`
const VALUE_LINE = new RegExp(String.raw`^(\d{1,4})\s+${UNIT}\.?$`, 'i')
const INLINE = new RegExp(String.raw`^(.{2,60}?)\s*:?\s+(\d{1,4})\s+${UNIT}\.?$`, 'i')
const LABEL_LINE = /^[A-Za-zÀ-ỹ][^|]{0,58}$/

/** Đọc ô số liệu. Hỗ trợ cả kiểu "Low Chair : 50 Seats" trên một dòng
 *  lẫn kiểu cột (khối nhãn rồi khối giá trị) như các file xuất từ Canva. */
export function extractCounts(lines: string[]): { counts: Count[]; boxTitle: string | null } {
  const counts: Count[] = []
  // 1) cùng dòng
  for (const l of lines) { const m = l.match(INLINE); if (m && !VALUE_LINE.test(l)) counts.push({ label: m[1].replace(/:\s*$/, '').trim(), qty: +m[2], unit: m[3] }) }
  if (counts.length) return { counts, boxTitle: null }
  // 2) dạng cột
  const first = lines.findIndex(l => VALUE_LINE.test(l))
  if (first < 0) return { counts, boxTitle: null }
  const values: { qty: number; unit: string }[] = []
  for (let i = first; i < lines.length && VALUE_LINE.test(lines[i]); i++) { const m = lines[i].match(VALUE_LINE)!; values.push({ qty: +m[1], unit: m[2] }) }
  const labels: string[] = []
  let j = first - 1
  for (; j >= 0 && labels.length < values.length; j--) {
    const l = lines[j]
    if (/\|/.test(l) || /^\d+$/.test(l) || !LABEL_LINE.test(l)) break
    labels.unshift(l.replace(/:\s*$/, '').replace(/\s*:\s*$/, '').trim())
  }
  // dòng ngay trên khối nhãn thường là tiêu đề ô số liệu (vd "TEAMMEMBER DINNING ROOM")
  const boxTitle = j >= 0 && LABEL_LINE.test(lines[j]) && !/\|/.test(lines[j]) && lines[j] === lines[j].toUpperCase() ? lines[j] : null
  values.forEach((v, i) => counts.push({ label: labels[i] ?? `Mục ${i + 1}`, qty: v.qty, unit: v.unit }))
  return { counts, boxTitle }
}

export function classifyLocal(pages: LocalPage[]): LocalResult[] {
  return pages.map((p, i) => {
    const lines = (p.text ?? '').split('\n').map(l => l.trim()).filter(Boolean)
    const base: LocalResult = { page_no: p.page_no, kind: 'unknown', room_key: null, room_title: null, room_name_vn: null, room_type: 'other', counts: [], box_title: null }
    if (!lines.length) return { ...base, kind: i === 0 ? 'cover' : 'unknown' }
    const titleLine = lines.find(l => /\|/.test(l))
    const title = titleLine ? titleLine.split('|').pop()!.trim() : null
    if (!title) {
      const all = norm(lines.join(' '))
      if (/thank you|cam on/.test(all) && all.length < 60) return { ...base, kind: 'other' }
      const kind = i === 0 ? 'cover' : /rgb|colou?r|material|finish|tile|panel|ceiling|vat lieu|mau/.test(all) ? 'moodboard' : 'other'
      return { ...base, kind }
    }
    const isPlan = PLAN_RE.test(norm(title))
    const clean = title.replace(/\b(LAYOUT|FLOOR PLAN|PLAN|MẶT BẰNG)\b/gi, '').replace(/\s+/g, ' ').trim()
    const g = guessRoom(clean)
    const { counts, boxTitle } = extractCounts(lines)
    return { ...base, kind: isPlan ? 'plan' : 'render', room_key: norm(clean), room_title: clean, room_name_vn: g.vn, room_type: g.type, counts, box_title: boxTitle }
  })
}

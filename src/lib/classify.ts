// Phân loại trang & gom phòng KHÔNG dùng AI – dựa vào chữ trong PDF.
// Hỗ trợ 2 kiểu trình bày phổ biến:
//  (A) Tiêu đề "INTERIOR CONCEPT | TÊN PHÒNG" + ô số liệu (vd Waldorf)
//  (B) Tiêu đề "CONCEPT NỘI THẤT …" / "MẶT BẰNG …" + nhãn phòng song ngữ "SHARED OFFICE / VĂN PHÒNG CHUNG / S=73M²" (vd Westin)
// AI chỉ là phương án dự phòng cho PDF dạng ảnh scan (không có chữ).
import { LATIN } from './despace'

export type Count = { label: string; qty: number; unit: string }
export type LocalPage = { page_no: number; text: string | null }
export type LocalResult = {
  page_no: number; kind: 'cover' | 'moodboard' | 'plan' | 'render' | 'other' | 'unknown'
  room_key: string | null; room_title: string | null; room_name_vn: string | null; room_type: string
  counts: Count[]; box_title: string | null
}

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()

// Từ điển tên phòng phổ biến (EN + VN không dấu) → tên VN chuẩn + loại phòng
const DICT: [RegExp, string, string][] = [
  [/team ?member din+ing|staff din+ing|canteen|cafeteria|din+ing|nha an/, 'Phòng ăn nhân viên', 'dining'],
  [/locker|changing|change room|thay do/, 'Phòng thay đồ nhân viên', 'locker_wc'],
  [/toilet|restroom|washroom|\bwc\b|bathroom|ve sinh/, 'Phòng vệ sinh', 'locker_wc'],
  [/shower|phong tam/, 'Khu tắm', 'locker_wc'],
  [/knowledge|training|learning|class|dao tao|phong hoc/, 'Phòng học & thư giãn', 'lounge_training'],
  [/relax|lounge|break ?room|nghi ngoi|thu gian/, 'Phòng nghỉ nhân viên', 'lounge_training'],
  [/meeting|conference|board ?room|interview|phong hop|phong van/, 'Phòng họp', 'meeting'],
  [/pantry|tea room|pha che/, 'Pantry', 'pantry'],
  [/laundry|linen|uniform|giat|vai sach|dong phuc/, 'Phòng giặt / đồ vải', 'storage'],
  [/store|storage|warehouse|kho\b|nha kho/, 'Kho', 'storage'],
  [/workshop|maintenance|eng\b|xuong|ky thuat|mep/, 'Xưởng kỹ thuật', 'storage'],
  [/clinic|medical|nurse|first aid|y te/, 'Phòng y tế', 'clinic'],
  [/corridor|hallway|circulation|hanh lang/, 'Hành lang', 'corridor'],
  [/lobby|sanh/, 'Sảnh', 'corridor'],
  [/security|guard|fcr|an ninh|bao ve|pccc/, 'Phòng an ninh', 'office'],
  [/hskp|housekeeping|buong phong/, 'Phòng buồng phòng (HSKP)', 'office'],
  [/kitchen|prep area|so che|bep/, 'Bếp / sơ chế', 'pantry'],
  [/office|manager|director|finance|hr\b|cashier|purchasing|receiving|system|van phong|giam doc|tai chinh|thu ngan|thu mua|cntt|hcns|tiep don/, 'Văn phòng', 'office'],
  [/flower|cam hoa/, 'Phòng cắm hoa', 'storage'],
]

export function guessRoom(title: string): { vn: string; type: string } {
  const n = norm(title)
  for (const [re, vn, type] of DICT) if (re.test(n)) return { vn, type }
  return { vn: title.trim(), type: 'other' }
}

/** Viết hoa chữ đầu câu, giữ nguyên chữ viết tắt (HSKP, CNTT, MEP, B2…) */
export function sentenceCase(s: string): string {
  const keep = new Set([...LATIN, 'B1', 'B2', 'B3', 'GĐ', 'TGĐ', 'P.'])
  const words = s.trim().split(/\s+/).map((w, i) => {
    if (keep.has(w) || /\d/.test(w) || (/^[A-Z&-]{2,5}$/.test(w) && !/[aeiouy]/i.test(w))) return w
    const lw = w.toLocaleLowerCase('vi')
    return i === 0 ? lw.charAt(0).toLocaleUpperCase('vi') + lw.slice(1) : lw
  })
  return words.join(' ')
}

const UNIT = String.raw`(Seats?|Tables?|Counters?|Sinks?|Lockers?|Toilets?|Showers?|Sets?|Pcs|Beds?|Desks?|Chairs?|Sofas?|Units?|Ghế|Bàn|Bộ|Cái|Chiếc)`
const VALUE_LINE = new RegExp(String.raw`^(\d{1,4})\s+${UNIT}\.?$`, 'i')
const INLINE = new RegExp(String.raw`^(.{2,60}?)\s*:?\s+(\d{1,4})\s+${UNIT}\.?$`, 'i')
const LABEL_LINE = /^[A-Za-zÀ-ỹ][^|]{0,58}$/
const AREA = /S\s*=\s*([\d.,]+)\s*M²/gi
const VN_CHARS = /[ĐđĂăÂâÊêÔôƠơƯưÀ-ỹ]|\b(KHO|KHU|SINH|HOA|NAM|NINH|CHUNG|LANG|THANG|PHONG)\b/
const HEADER = /^(concept|interior concept|mat bang|mặt bằng|ghi chu|ghi chú|dien tich|diện tích|layout|floor plan|thank you)/i
const PLAN = /(mặt bằng|mat bang|\blayout\b|floor plan|ghi chú: diện tích|ghi chu: dien tich)/i
const RENDER = /(concept nội thất|concept noi that|interior concept)/i

/** Ô số liệu kiểu cột hoặc cùng dòng ("Low Chair : 50 Seats") */
export function extractCounts(lines: string[]): { counts: Count[]; boxTitle: string | null } {
  const counts: Count[] = []
  for (const l of lines) { const m = l.match(INLINE); if (m && !VALUE_LINE.test(l)) counts.push({ label: m[1].replace(/:\s*$/, '').trim(), qty: +m[2], unit: m[3] }) }
  if (counts.length) return { counts, boxTitle: null }
  const first = lines.findIndex(l => VALUE_LINE.test(l))
  if (first < 0) return { counts, boxTitle: null }
  const values: { qty: number; unit: string }[] = []
  for (let i = first; i < lines.length && VALUE_LINE.test(lines[i]); i++) { const m = lines[i].match(VALUE_LINE)!; values.push({ qty: +m[1], unit: m[2] }) }
  const labels: string[] = []
  let j = first - 1
  for (; j >= 0 && labels.length < values.length; j--) {
    const l = lines[j]
    if (/\|/.test(l) || /^\d+$/.test(l) || !LABEL_LINE.test(l)) break
    labels.unshift(l.replace(/\s*:\s*$/, '').trim())
  }
  const boxTitle = j >= 0 && LABEL_LINE.test(lines[j]) && !/\|/.test(lines[j]) && lines[j] === lines[j].toUpperCase() ? lines[j] : null
  values.forEach((v, i) => counts.push({ label: labels[i] ?? `Mục ${i + 1}`, qty: v.qty, unit: v.unit }))
  return { counts, boxTitle }
}

/** Kiểu (B): đọc nhãn phòng song ngữ trên trang phối cảnh */
function bilingualRooms(lines: string[], noise: Set<string>): { rooms: { en?: string; vn?: string }[]; areas: number[] } {
  const areas: number[] = []
  const cleaned: string[] = []
  for (let l of lines) {
    l = l.replace(AREA, (_m, a) => { areas.push(parseFloat(String(a).replace(',', '.'))); return ' ' }).replace(/^\d+\s+/, '').replace(/\s+\d+$/, '').trim()
    if (!l || /^\d+$/.test(l) || noise.has(l) || HEADER.test(l) || HEADER.test(norm(l))) continue
    if (l.length > 45 || /:/.test(l)) continue
    if (l !== l.toUpperCase()) continue // nhãn phòng luôn viết hoa
    cleaned.push(l)
  }
  const rooms: { en?: string; vn?: string }[] = []
  for (let i = 0; i < cleaned.length; i++) {
    const l = cleaned[i]
    const isVN = VN_CHARS.test(l)
    if (!isVN) {
      const next = cleaned[i + 1]
      if (next && VN_CHARS.test(next)) { rooms.push({ en: l, vn: next.replace(/\s*\/\s*$/, '') }); i++ }
      else rooms.push({ en: l })
    } else {
      // dòng VN nối tiếp (vd "PHÒNG THU MUA /" + "NHẬN HÀNG")
      const prev = rooms[rooms.length - 1]
      if (prev?.vn && /\/\s*$/.test(cleaned[i - 1] ?? '')) prev.vn = `${prev.vn} / ${l}`
      else rooms.push({ vn: l })
    }
  }
  // gộp tiếp dòng EN bị ngắt (vd "PURCHASING" + "RECEIVING OFFICE" + VN)
  const merged: { en?: string; vn?: string }[] = []
  for (const r of rooms) {
    const last = merged[merged.length - 1]
    if (last && r.en && last.en === r.en && !r.vn) continue
    if (last && last.en && !last.vn && r.en) { last.en = last.en === r.en ? last.en : `${last.en} ${r.en}`; last.vn = r.vn; continue }
    merged.push({ ...r })
  }
  return { rooms: merged.filter(r => r.en || r.vn), areas }
}

export function classifyLocal(pages: LocalPage[]): LocalResult[] {
  // Dòng xuất hiện ở ≥ 30% số trang (tên dự án, logo chữ…) → bỏ qua
  const freq = new Map<string, number>()
  for (const p of pages) for (const l of new Set((p.text ?? '').split('\n').map(x => x.trim()).filter(Boolean))) freq.set(l, (freq.get(l) ?? 0) + 1)
  const noise = new Set([...freq].filter(([, n]) => pages.length >= 5 && n / pages.length >= 0.3).map(([l]) => l))

  return pages.map((p, i) => {
    const lines = (p.text ?? '').split('\n').map(l => l.trim()).filter(Boolean)
    const all = lines.join(' ')
    const base: LocalResult = { page_no: p.page_no, kind: 'unknown', room_key: null, room_title: null, room_name_vn: null, room_type: 'other', counts: [], box_title: null }
    if (!lines.length) return { ...base, kind: i === 0 ? 'cover' : 'unknown' }
    if (i === 0) return { ...base, kind: 'cover' }
    if (/thank you|cảm ơn|cam on/i.test(all) && all.length < 60) return { ...base, kind: 'other' }

    // (A) "… | TÊN PHÒNG"
    const titleLine = lines.find(l => /\|/.test(l))
    if (titleLine) {
      const title = titleLine.split('|').pop()!.trim()
      const isPlan = /\b(layout|plan|floor plan|mat bang)\b/.test(norm(title))
      const clean = title.replace(/\b(LAYOUT|FLOOR PLAN|PLAN|MẶT BẰNG)\b/gi, '').replace(/\s+/g, ' ').trim()
      const g = guessRoom(clean)
      const { counts, boxTitle } = extractCounts(lines)
      return { ...base, kind: isPlan ? 'plan' : 'render', room_key: norm(clean), room_title: clean, room_name_vn: g.vn, room_type: g.type, counts, box_title: boxTitle }
    }

    // (B) trang mặt bằng tổng / trang phối cảnh có nhãn song ngữ
    if (PLAN.test(all)) return { ...base, kind: 'plan' }
    if (/định hướng vật liệu|dinh huong vat lieu|moodboard|material board|tone màu/i.test(all)) return { ...base, kind: 'moodboard' }
    const { rooms, areas } = bilingualRooms(lines, noise)
    if (RENDER.test(all) || rooms.length) {
      if (!rooms.length) return { ...base, kind: 'render' }
      const vn = rooms.map(r => r.vn ? sentenceCase(r.vn) : guessRoom(r.en!).vn).join(' & ')
      const en = rooms.map(r => r.en ?? '').filter(Boolean).join(' & ')
      const g = guessRoom(`${en} ${rooms.map(r => r.vn ?? '').join(' ')}`)
      const counts = areas.map((a, k) => ({ label: rooms.length > 1 && rooms[k] ? `Diện tích ${sentenceCase(rooms[k].vn ?? rooms[k].en ?? '')}` : 'Diện tích', qty: a, unit: 'm²' }))
      return { ...base, kind: 'render', room_key: norm(vn), room_title: en || vn, room_name_vn: vn, room_type: g.type, counts, box_title: null }
    }
    if (/rgb|colou?r|material|finish|tiles?|panel|ceiling|vật liệu|màu/i.test(all)) return { ...base, kind: 'moodboard' }
    return { ...base, kind: 'other' }
  })
}

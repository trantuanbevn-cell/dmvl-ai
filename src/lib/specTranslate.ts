// Dịch dòng thông số kỹ thuật dạng “Tên: giá trị” Việt → Anh bằng từ điển (không AI). Dòng nào dịch không hết thì báo để giữ nguyên.
const KEYS: [string, string][] = [
  ['kích thước tổng thể', 'Overall size'], ['kích thước', 'Size'], ['chiều dài', 'Length'], ['chiều rộng', 'Width'], ['chiều cao', 'Height'], ['chiều dày', 'Thickness'], ['độ dày', 'Thickness'], ['bề dày', 'Thickness'],
  ['đơn vị tính', 'Unit'], ['chất liệu', 'Material'], ['vật liệu', 'Material'], ['bề mặt', 'Surface'], ['loại cạnh', 'Edge type'], ['gạch cắt cạnh', 'Rectified edge'], ['cắt cạnh', 'Rectified edge'],
  ['màu sắc', 'Colour'], ['màu', 'Colour'], ['quy cách đóng gói', 'Packing'], ['đóng gói', 'Packing'], ['tiêu chuẩn chất lượng', 'Quality standard'], ['tiêu chuẩn', 'Standard'], ['kiểu vân', 'Pattern'], ['vân', 'Pattern'],
  ['thiết kế', 'Design'], ['xuất xứ', 'Origin'], ['thương hiệu', 'Brand'], ['bảo hành', 'Warranty'], ['trọng lượng', 'Weight'], ['công suất', 'Power'], ['điện áp', 'Voltage'], ['độ hút nước', 'Water absorption'],
  ['độ chống trơn', 'Slip resistance'], ['chống trơn', 'Slip resistance'], ['hệ số ma sát', 'Friction coefficient'], ['mã sản phẩm', 'Product code'], ['dòng sản phẩm', 'Product line'], ['ứng dụng', 'Application'],
  ['loại men', 'Glaze type'], ['công nghệ', 'Technology'], ['đặc tính', 'Features'], ['kiểu dáng', 'Style'], ['hình dạng', 'Shape'], ['độ bóng', 'Gloss level'], ['dung tích', 'Capacity'], ['loại', 'Type'], ['cấp độ', 'Grade'], ['độ cứng', 'Hardness'], ['nhiệt độ màu', 'Colour temperature'], ['góc chiếu', 'Beam angle'], ['quang thông', 'Luminous flux'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][]
const WORDS: [string, string][] = [
  ['chưa mài', 'unground'], ['đã mài', 'ground'], ['men bóng', 'glossy glaze'], ['men mờ', 'matt glaze'], ['men matt', 'matt glaze'], ['xám nhạt', 'light grey'], ['xám đậm', 'dark grey'], ['xám tro', 'ash grey'], ['đỏ đậm', 'dark red'], ['nâu đỏ', 'reddish brown'],
  ['trắng', 'white'], ['đen', 'black'], ['xám', 'grey'], ['đỏ', 'red'], ['nâu', 'brown'], ['kem', 'cream'], ['be', 'beige'], ['vàng', 'yellow'], ['xanh lá', 'green'], ['xanh dương', 'blue'], ['bóng', 'glossy'], ['mờ', 'matt'], ['nhám', 'textured'], ['mịn', 'smooth'],
  ['có', 'yes'], ['không', 'no'], ['viên', 'pcs'], ['hộp', 'box'], ['thùng', 'carton'], ['gốm', 'ceramic'], ['sứ', 'porcelain'], ['đá', 'stone'], ['gỗ', 'wood'], ['kính', 'glass'], ['inox', 'stainless steel'], ['nhôm', 'aluminium'], ['thép', 'steel'], ['nhựa', 'plastic'], ['vải', 'fabric'], ['da', 'leather'],
  ['men', 'glazed'], ['gạch', 'tile'], ['xi măng', 'cement'], ['thiết kế', 'design'], ['lát sàn', 'floor'], ['ốp tường', 'wall'], ['trong nhà', 'indoor'], ['ngoài trời', 'outdoor'], ['bóng kính', 'high gloss'], ['cạnh', 'edge'], ['mài', 'ground'], ['và', 'and'], ['hoặc', 'or'], ['tương đương', 'equivalent'], ['chưa', 'not yet'], ['tiêu chuẩn', 'standard'], ['loại', 'type'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][]
const VN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i

function words(v: string): { en: string; left: number } {
  const toks = v.split(/(\s+)/); let out = '', left = 0
  for (let i = 0; i < toks.length;) {
    if (/^\s+$/.test(toks[i])) { out += toks[i]; i++; continue }
    let done = false
    for (const n of [3, 2, 1]) {
      const seg = toks.slice(i, i + 2 * n - 1).join('').toLowerCase()
      const hit = WORDS.find(w => w[0] === seg.replace(/[.,;]+$/, ''))
      if (hit && toks.slice(i, i + 2 * n - 1).filter(t => !/^\s+$/.test(t)).length === n) { out += hit[1] + (/[.,;]$/.test(seg) ? seg.slice(-1) : ''); i += 2 * n - 1; done = true; break }
    }
    if (!done) { if (VN.test(toks[i])) left++; out += toks[i]; i++ }
  }
  return { en: out, left }
}

/** Dịch một dòng thông số. ok=false nếu còn từ tiếng Việt chưa dịch được */
export function translateLine(line: string): { en: string; ok: boolean } {
  const s = line.trim(); if (!s) return { en: '', ok: true }
  const low = s.toLowerCase()
  for (const [k, en] of KEYS) {
    if (!low.startsWith(k)) continue
    const rest = s.slice(k.length)
    if (rest && !/^[\s:：]/.test(rest)) continue
    const val = rest.replace(/^[\s:：]+/, '')
    const w = words(val), cap = w.en.charAt(0).toUpperCase() + w.en.slice(1)
    return { en: val ? `${en}: ${cap}` : en, ok: w.left === 0 }
  }
  const w = words(s)
  return { en: w.en, ok: w.left === 0 }
}
/** Dịch cả đoạn thông số nhiều dòng; ok=false nếu có dòng chưa dịch hết */
export function translateSpec(text: string): { en: string; ok: boolean } {
  const ls = text.split('\n').map(x => x.trim()).filter(Boolean).map(translateLine)
  return { en: ls.map(l => l.en).join('\n'), ok: ls.every(l => l.ok) }
}

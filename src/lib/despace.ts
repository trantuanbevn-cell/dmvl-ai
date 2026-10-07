// Khôi phục chữ bị giãn cách kiểu Canva ("S H A R E D O F F I C E" → "SHARED OFFICE",
// "V Ă N P H Ò N G C H U N G" → "VĂN PHÒNG CHUNG") – không dùng AI.

/** Dòng có dạng từng ký tự cách nhau bởi khoảng trắng */
export function isLetterSpaced(line: string): boolean {
  const toks = line.trim().split(' ')
  if (toks.length >= 2 && toks.length < 4) return toks.every(t => [...t].length === 1 && /[A-ZĐ]/.test(t))
  if (toks.length < 4) return false
  const singles = toks.filter(t => [...t].length === 1).length
  return singles / toks.length >= 0.8
}

const V = 'AĂÂEÊIOÔƠUƯYÁÀẢÃẠẮẰẲẴẶẤẦẨẪẬÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ'
const isV = (c: string) => V.includes(c)
/** Bỏ dấu thanh, giữ dấu mũ/móc/trăng: Ấ → Â, Ờ → Ơ */
const base = (c: string) => c.normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC')
const toned = (c: string) => /[̣̀́̃̉]/.test(c.normalize('NFD'))
// Các vần nguyên âm hợp lệ (theo chữ cái gốc)
const NUCLEI = new Set(`A Ă Â E Ê I O Ô Ơ U Ư Y AI AO AU AY ÂU ÂY EO ÊU IA IÊ IU OA OĂ OE OI ÔI ƠI UA UÂ UÊ UI UÔ UƠ UY ƯA ƯI ƯƠ ƯU YÊ IÊU OAI OAO OAY OEO UÂY UÔI UYA UYÊ UYU ƯƠI ƯƠU YÊU`.split(' '))
const ONSETS = ['NGH', 'NG', 'GH', 'KH', 'NH', 'PH', 'TH', 'TR', 'CH', 'GI', 'QU', 'B', 'C', 'D', 'Đ', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'X']
const FINALS = ['NG', 'NH', 'CH', 'C', 'M', 'N', 'P', 'T']
// Tên viết tắt / chữ Latin hay xen trong tên phòng tiếng Việt
const LATIN = ['E-GAME', 'PCCC', 'CNTT', 'HCNS', 'HSKP', 'MEP', 'BOH', 'F&B', 'GM', 'IT', 'WC']

// Âm tiết hay gặp (tên phòng, nội thất, khách sạn, văn phòng) – dùng để chọn cách tách hợp lý nhất
const COMMON = new Set(`PHÒNG KHU NHÀ ĂN AN NINH NHÂN VIÊN VĂN CHUNG HỌP PHỎNG VẤN TỔNG GIÁM ĐỐC ĐIỀU HÀNH BỘ PHẬN TÀI CHÍNH KẾ TOÁN THU NGÂN MUA NHẬN HÀNG
THAY ĐỒ NAM NỮ VỆ SINH TẮM KHO VẢI SẠCH BẨN GIẶT LÀ ỦI ĐỒNG PHỤC XƯỞNG KỸ THUẬT BẢO TRÌ HÀNH LANG TẦNG HẦM SẢNH THANG MÁY BỘ CẮM HOA SƠ CHẾ THÔ
TRƯỞNG TIẾP ĐÓN LỄ TÂN ĐIỀU HÀNH NGHỈ NGƠI HỌC ĐÀO TẠO THƯ GIÃN Y TẾ CÔNG NGHỆ THÔNG TIN HÓA CHẤT TẨY RỬA RÁC CHỨA BƠM ĐIỆN NƯỚC MÁY PHÁT
BẾP ĂN UỐNG PHA CHẾ TRÀ CAFE QUẦY BAR LÀM VIỆC RIÊNG GIÁM SÁT QUẢN LÝ KINH DOANH NHÂN SỰ HÀNH CHÍNH DỊCH VỤ BUỒNG PHÒNG KHÁCH SẠN
TONE MÀU ĐIỂM NHẤN CẢM XÚC BỀ MẶT SẮC XANH TỰ NHIÊN SỰ MỀM MẠI ĐỊNH HƯỚNG VẬT LIỆU THIẾT CONCEPT NỘI THẤT NGOẠI TRẦN TƯỜNG SÀN CỬA SỔ
GỖ ĐÁ GẠCH SƠN KÍNH GƯƠNG KIM LOẠI THÉP NHÔM INOX VẢI DA NỈ THẢM RÈM ĐÈN TỦ BÀN GHẾ GIƯỜNG KỆ GIÁ SOFA ĐÔN MỚI CŨ LỚN NHỎ CHÍNH PHỤ TRỢ
DIỆN TÍCH GHI CHÚ MẶT BẰNG ĐIỂN HÌNH CÁC VÀ CỦA CHO TỪ ĐẾN TRONG NGOÀI TRÊN DƯỚI GIỮA SAU TRƯỚC MỘT HAI BA BỐN NĂM SÁU BẢY TÁM CHÍN MƯỜI
NGƯỜI ĐƯỢC CÓ KHÔNG LÀ VỚI NHƯ NÀY ĐÓ ĐI VỀ RA VÀO LÊN XUỐNG TRẮNG ĐEN XÁM BE NÂU VÀNG ĐỎ CAM HỒNG TÍM ẤM LẠNH SÁNG TỐI MỜ BÓNG`.split(/\s+/))
const LATIN_SET = new Set(LATIN)

/** Mọi âm tiết hợp lệ bắt đầu tại i (độ dài) */
function syllablesAt(s: string, i: number): number[] {
  const res: number[] = []
  const onsets = ['', ...ONSETS.filter(o => s.startsWith(o, i))]
  for (const on of onsets) {
    const j = i + on.length
    if (!isV(s[j] ?? '')) continue
    let k = j, nb = '', tones = 0
    while (k < s.length && isV(s[k])) {
      const nb2 = nb + base(s[k]), t2 = tones + (toned(s[k]) ? 1 : 0)
      if (!NUCLEI.has(nb2) || t2 > 1) break
      nb = nb2; tones = t2; k++
      res.push(k - i)
      for (const f of FINALS) if (s.startsWith(f, k)) res.push(k + f.length - i)
    }
  }
  return [...new Set(res)]
}

/** Tách chuỗi tiếng Việt viết liền (chữ hoa) thành các âm tiết – quy hoạch động, ưu tiên âm tiết thông dụng */
export function splitVietnamese(s: string): string {
  const n = s.length
  const cost = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(-1)
  cost[0] = 0
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue
    const cands: [number, number][] = []
    for (const L of syllablesAt(s, i)) { const w = s.slice(i, i + L); cands.push([L, COMMON.has(w) ? 1 : isV(w[0]) ? 3.5 : 2.5]) }
    for (const l of LATIN) if (s.startsWith(l, i)) cands.push([l.length, 1])
    cands.push([1, /[\d.,&/()+\-]/.test(s[i]) ? 0.5 : 6])
    for (const [L, c] of cands) if (cost[i] + c < cost[i + L]) { cost[i + L] = cost[i] + c; prev[i + L] = i }
  }
  const parts: string[] = []
  for (let k = n; k > 0; k = prev[k]) parts.unshift(s.slice(prev[k], k))
  // gộp ký tự lẻ (số, dấu) liền nhau
  const out: string[] = []
  for (const p of parts) {
    const odd = p.length === 1 && !isV(p) && !LATIN_SET.has(p)
    if (odd && out.length && /[\d.,()+\-]$/.test(out[out.length - 1]) && /[\d.,()+\-]/.test(p)) out[out.length - 1] += p
    else out.push(p)
  }
  return out.join(' ').replace(/\s*([&/])\s*/g, ' $1 ').replace(/ \. /g, '. ').replace(/\b([A-Z]) (\d+)\b/g, '$1$2').replace(/\s+/g, ' ').trim()
}

// Từ tiếng Anh thường gặp trong tên phòng BOH/khách sạn/văn phòng
const EN_WORDS = `shared office meeting room interview locker male female director of operation operations general manager finance hr human resource resources
employee employees cafeteria canteen dining staff team member storage store linen clean dirty uniform issue laundry emergency hskp housekeeping shop and
maintenance eng engineering security fcr fire control purchasing receiving flower f&b rough prep area lift lobby elevator boh service corridor corridors
system it front desk cashier cash accounting account toilet wc shower changing knowledge relaxation lounge training pantry kitchen workshop clinic medical
first aid nurse guard rest break prayer smoking garbage loading dock detergent chemical room e-game game typical additional non-food food bev beverage
manager's gm executive chef sales marketing revenue reservation concierge bell porter driver driving engineer mep it's server data record archive
waiting reception guest public back of house plant pump ejector water tank electrical switch transformer generator`.split(/\s+/).filter(Boolean)
const EN_SET = new Set(EN_WORDS.map(w => w.toUpperCase()))
const MAXW = Math.max(...EN_WORDS.map(w => w.length))

/** Tách chuỗi tiếng Anh viết liền theo từ điển (quy hoạch động, ít ký tự lạ nhất) */
export function splitEnglish(s: string): string {
  const n = s.length
  const cost = new Array(n + 1).fill(Infinity), prev = new Array(n + 1).fill(-1), known = new Array(n + 1).fill(false)
  cost[0] = 0
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue
    for (let L = 1; L <= Math.min(MAXW, n - i); L++) {
      const w = s.slice(i, i + L)
      const isW = EN_SET.has(w) || /^[^A-Z]+$/.test(w)
      const c = cost[i] + (isW ? 1 : L * 3)
      if (c < cost[i + L]) { cost[i + L] = c; prev[i + L] = i; known[i + L] = isW }
    }
  }
  const parts: string[] = []
  for (let k = n; k > 0; k = prev[k]) parts.unshift(s.slice(prev[k], k))
  // gộp các ký tự lạ liền nhau thành một cụm
  const merged: string[] = []
  for (const p of parts) {
    const unk = !EN_SET.has(p) && /[A-Z]/.test(p)
    if (unk && merged.length && (merged as any).lastUnk) merged[merged.length - 1] += p
    else merged.push(p)
    ;(merged as any).lastUnk = unk
  }
  return merged.join(' ').replace(/\s*([&/-])\s*/g, '$1').replace(/\s+/g, ' ').trim()
}

const HAS_VN = new RegExp(`[ĐĂÂÊÔƠƯ${V.slice(12)}]`)
export { LATIN }
/** Khôi phục một dòng chữ giãn cách */
export function despaceLine(line: string): string {
  if (!isLetterSpaced(line)) return line
  // giữ các cụm số/diện tích (S = 7 3 M ²) riêng ra
  const joined = line.replace(/ /g, '')
  return joined.replace(/S=[\d.,]+M²/g, m => ` ${m} `).split(/\s+/).filter(Boolean).map(chunk => {
    if (/^S=/.test(chunk)) return chunk
    return HAS_VN.test(chunk) ? splitVietnamese(chunk) : splitEnglish(chunk)
  }).join(' ').trim()
}

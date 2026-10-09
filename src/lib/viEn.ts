// Dịch Việt → Anh bằng từ điển chuyên ngành + luật đảo thứ tự (không AI). Chỉ tin cậy với cụm ngắn, đơn giản;
// cụm dài/phức tạp hoặc có từ lạ → ok=false để chuyển cho bước AI (admin) hoặc tự dịch tay.
import { GLOSS, ROOM_GLOSS, MAX_PHRASE, SPEC_KEYS, type Gloss, type Tag } from './glossary'

export type Tr = { en: string; ok: boolean; unknown: string[] }
const VN = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
const NUMERIC = /^[\d.,×x*÷/\-–+±≥≤<>=%°²³µø~()]+[a-zµ²³]*$/i
const strip = (w: string) => w.replace(/^[(\[]+|[).,;:!?\]]+$/g, '')
// “3 chỗ” → 3-seater, “2 tầng” → 2-tier…
const NUMUNIT: [string, string][] = [['ngăn kéo', '-drawer'], ['chỗ', '-seater'], ['người', '-seater'], ['tầng', '-tier'], ['hố', '-bowl'], ['ngăn', '-compartment'], ['cánh', '-door'], ['hướng thổi', '-way']]
const rank: Record<string, number> = { A: 1, C: 2, M: 3, U: 3.5, Y: 4 }

type Item = { tag: Tag | 'U' | 'D'; en: string; vi: string }
function lex(words: string[], unknown: string[]): Item[] {
  const out: Item[] = []
  for (let i = 0; i < words.length;) {
    let hit: Gloss | null = null, n = 0
    for (let k = Math.min(MAX_PHRASE, words.length - i); k >= 1; k--) {
      const key = words.slice(i, i + k).map(w => strip(w).toLowerCase()).join(' ')
      const g = GLOSS.get(key); if (g) { hit = g; n = k; break }
      const r = ROOM_GLOSS.get(key); if (r) { hit = { tag: 'N', en: r }; n = k; break }
    }
    if (hit) { out.push({ tag: hit.tag, en: hit.en, vi: words.slice(i, i + n).join(' ') }); i += n; continue }
    const w = words[i], core = strip(w)
    if (!core) { i++; continue }
    const nx = words.slice(i + 1, i + 3).map(x => strip(x).toLowerCase())
    const cnt = /^\d+([-–]\d+)?$/.test(core) ? NUMUNIT.find(([k]) => nx.slice(0, k.split(' ').length).join(' ') === k) : undefined
    if (cnt) { out.push({ tag: 'A', en: `${core}${cnt[1]}`, vi: w }); i += 1 + cnt[0].split(' ').length; continue }
    if (NUMERIC.test(core)) out.push({ tag: 'D', en: core, vi: w })
    else if (VN.test(core)) { unknown.push(core); out.push({ tag: 'U', en: core, vi: w }) }
    else out.push({ tag: 'U', en: core, vi: w })          // tên hãng, mã, từ tiếng Anh sẵn → giữ nguyên
    i++
  }
  return out
}

/** Dựng một cụm danh từ tiếng Anh từ danh sách thành phần của MỘT cụm (không có giới từ) */
function renderNP(items: Item[]): string {
  const head = items.find(x => x.tag === 'N') ?? items.find(x => x.tag === 'M') ?? items.find(x => x.tag === 'D')
  const trail = items.filter(x => x.tag === 'T').map(x => x.en)
  const nums = items.filter(x => x.tag === 'D' && x !== head)
  const mods = items.filter(x => x !== head && x.tag !== 'T' && x.tag !== 'D' && x.tag !== 'K')
  // sắp xếp: nhóm theo hạng (A, C, M/U, Y) – A và C đảo thứ tự gốc (tiếng Việt: danh từ + tính từ), M/U/Y giữ thứ tự
  const by = (r: number) => mods.filter(x => (rank[x.tag] ?? 3) === r)
  const ordered = [...by(1).reverse(), ...by(2).reverse(), ...by(3), ...by(3.5), ...by(4)]
  const parts = [...nums.map(x => x.en), ...ordered.map(x => x.en), head?.en ?? ''].filter(Boolean)
  return [...parts, ...trail].join(' ')
}

/** Dịch một mệnh đề (không chứa dấu phẩy/và/hoặc) */
function clause(text: string, unknown: string[]): { en: string; splits: number } {
  const items = lex(text.trim().split(/\s+/).filter(Boolean), unknown).filter(x => x.tag !== 'K')
  const segs: { conn: string; items: Item[] }[] = [{ conn: '', items: [] }]
  let haveHead = false
  for (const it of items) {
    if (haveHead && it.vi.toLowerCase() === 'sơn') { segs.push({ conn: 'painted', items: [] }); haveHead = false; continue }
    if (it.tag === 'P') { segs.push({ conn: it.en, items: [] }); haveHead = false; continue }
    if (it.tag === 'N' && haveHead) { segs.push({ conn: 'with', items: [it] }); continue }   // danh từ thứ hai → “with …”
    if (it.tag === 'N') haveHead = true
    segs[segs.length - 1].items.push(it)
  }
  const en = segs.map(s => [s.conn, renderNP(s.items)].filter(Boolean).join(' ')).filter(Boolean).join(' ')
  return { en, splits: segs.length - 1 }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Dịch một dòng văn bản (tên hạng mục, vật liệu, bộ phận…) */
export function translateVi(src: string): Tr & { splits: number; words: number } {
  const unknown: string[] = []
  const text = src.replace(/^[\s\-•]+/, '').trim()
  if (!text) return { en: '', ok: true, unknown, splits: 0, words: 0 }
  // toàn câu là tên phòng/khu vực đã biết
  const whole = ROOM_GLOSS.get(text.toLowerCase()); if (whole) return { en: cap(whole), ok: true, unknown, splits: 0, words: text.split(/\s+/).length }
  let splits = 0
  // tách “Nhãn: giá trị”
  const kv = text.match(/^([^:：]{2,30})[:：]\s*(.*)$/)
  let prefix = ''
  let body = text
  if (kv) { const k = SPEC_KEYS[kv[1].trim().toLowerCase()]; if (k) { prefix = k + ': '; body = kv[2] } }
  const bits = body.split(/(\s*[,;/&–—]\s*|\s+-\s+|\s+và\s+|\s+hoặc\s+)/)
  const out = bits.map((b, i) => {
    if (i % 2 === 1) { const t = b.trim(); return t === 'và' ? ' and ' : t === 'hoặc' ? ' or ' : t === '&' ? ' & ' : t === '/' ? ' / ' : t === '-' || t === '–' || t === '—' ? ' – ' : t + ' ' }
    const r = clause(b, unknown); splits += r.splits; return r.en
  }).join('').replace(/\s+/g, ' ').replace(/\s+([,;])/g, '$1').trim()
  const words = text.split(/\s+/).length
  const en = prefix + (/^[A-ZĐ]/.test(text) || prefix ? cap(out) : out)
  return { en, ok: unknown.length === 0 && splits <= 1 && words <= 14, unknown, splits, words }
}

/** Dịch nhiều dòng (mỗi dòng độc lập, giữ xuống dòng) */
export function translateViText(src: string): Tr {
  const lines = src.split('\n').map(l => l.trim()).filter(Boolean)
  const rs = lines.map(translateVi)
  return { en: rs.map(r => r.en).join('\n'), ok: rs.every(r => r.ok) && lines.length <= 4, unknown: [...new Set(rs.flatMap(r => r.unknown))] }
}

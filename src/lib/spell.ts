// Kiểm tra chính tả + dấu câu cho tiếng Việt và tiếng Anh – chạy hoàn toàn trên trình duyệt, không dùng AI.
//  • Dấu câu / khoảng trắng / viết hoa đầu câu: sửa bằng luật.
//  • Tiếng Việt: kiểm âm tiết theo luật ghép vần (viSyllable), chuẩn hoá vị trí dấu thanh, sửa lỗi gõ sai khi chắc chắn.
//  • Tiếng Anh: từ điển Hunspell en_US (nspell) nạp lười từ /dict, sửa khi chỉ có một gợi ý cách 1 chữ.
import { checkVi, suggestVi } from './viSyllable'

export type FixKind = 'unicode' | 'space' | 'punct' | 'case' | 'tone' | 'spell' | 'dup'
export type Fix = { from: string; to: string; kind: FixKind }
export type Flag = { word: string; suggestions: string[] }
export type SpellResult = { text: string; fixes: Fix[]; flags: Flag[] }
export type SpellLang = 'vi' | 'en' | null
export type SpellOpts = { cap?: boolean }

// ---------- Từ điển tiếng Anh (nạp lười) ----------
let en: { correct: (w: string) => boolean; suggest: (w: string) => string[]; add: (w: string) => void } | null = null
let enLoading: Promise<void> | null = null
const DOMAIN = `décor decor inox melamine laminate mdf mfc hdf hpl pu led gypsum travertine terrazzo quartz quartzite veneer skirting moulding molding parquet vinyl lvt lvp spc pvc
  wallcovering wallpaper upholstery upholstered cassette luminaire downlight spotlight pendant sconce chandelier backlit rattan wicker bouclé boucle chenille
  porcelain marble granite onyx sintered ceramic mosaic grout epoxy microcement lacquer duco nano matt polyurethane acrylic fluted slat slats cladding
  millwork joinery ffe ff&e fixtures finishes finish boh foh ada hvac mep lobby wc ensuite minibar kitchenette pantry daybed ottoman credenza sideboard
  headboard nightstand armchair banquette bolster cushion drapery sheer blackout curtain valance tieback anodized anodised brushed powdercoated galvanised
  sanitary lavatory basin faucet shower bidet cistern urinal vanity countertop backsplash splashback tempered laminated frosted opaque translucent
  hinge handle pull knob latch deadbolt cabinet wardrobe closet drawer shelving shelf bracket cornice coving architrave plinth threshold
  vietnam vietnamese hanoi danang indonesia malaysia thailand italy italian china chinese korea korean japan japanese germany german spain spanish`.split(/\s+/)
export function loadEnglish(): Promise<void> {
  if (en) return Promise.resolve()
  return (enLoading ??= (async () => {
    try {
      const base = new URL('dict/', document.baseURI).href
      const [aff, dic, mod] = await Promise.all([fetch(base + 'en.aff').then(r => r.text()), fetch(base + 'en.dic').then(r => r.text()), import('nspell')])
      const sp = (mod.default ?? mod)(aff, dic)
      for (const w of DOMAIN) sp.add(w)
      en = sp
    } catch { enLoading = null }
  })())
}
export const englishReady = () => !!en
export const _setEnglishForTest = (sp: typeof en) => { en = sp }

// ---------- Từ điển riêng + từ của dự án ----------
const UK = 'dmvl-dict'
let userWords = new Set<string>()
try { userWords = new Set(JSON.parse(localStorage.getItem(UK) ?? '[]')) } catch { /* */ }
let projWords = new Set<string>()
export const addUserWord = (w: string) => { userWords.add(w.toLowerCase()); try { localStorage.setItem(UK, JSON.stringify([...userWords])) } catch { /* */ } }
export const setProjectWords = (words: string[]) => { projWords = new Set(words.map(w => w.toLowerCase())) }
const known = (w: string) => userWords.has(w.toLowerCase()) || projWords.has(w.toLowerCase())

// ---------- Dấu câu & khoảng trắng ----------
const L = '\\p{L}'
function tidyLine(s: string, lang: SpellLang, opts: SpellOpts, fixes: Fix[]) {
  const urls: string[] = []
  // giữ nguyên địa chỉ web / email
  let t = s.replace(/(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)/g, m => { urls.push(m); return `\u0001${urls.length - 1}\u0001` })
  t = t.replace(/[\u00a0\u2000-\u200a\t]/g, ' ').replace(/[\u200b\ufeff]/g, '')
  t = t.replace(/ {2,}/g, ' ').trim()
  t = t.replace(/ +([,;:!?)\]])/g, '$1')
  t = t.replace(/ +\.(?=\s|$)/g, '.')
  t = t.replace(/([(\[]) +/g, '$1')
  t = t.replace(new RegExp(`([,;!?])(?=[${L}(])`, 'gu'), '$1 ')
  t = t.replace(new RegExp(`(?<=[${L}]{2}):(?=[${L}\\d])`, 'gu'), ': ')
  t = t.replace(new RegExp(`(?<=\\p{Ll}{2})\\.(?=\\p{Lu})`, 'gu'), '. ')
  t = t.replace(new RegExp(`(?<=[${L}\\d])\\((?=[${L}])`, 'gu'), ' (')
  t = t.replace(new RegExp(`\\)(?=[${L}\\d])`, 'gu'), ') ')
  t = t.replace(/([,;:!?])\1+/g, '$1').replace(/(?<!\.)\.\.(?!\.)/g, '.').replace(/,\./g, '.')
  if (lang === 'en') t = t.replace(/\b(\p{L}{2,})(\s+)\1\b/giu, (m, w) => (/^(had|that|very|so|bye|no)$/i.test(w) ? m : w))
  if (opts.cap) {
    t = t.replace(/^((?:[-•*·–]\s*)?)(\p{Ll})/u, (_, a, c) => a + c.toUpperCase())
    t = t.replace(/(?<=(?:^|\s)\p{L}{4,})([.!?])\s+(\p{Ll})(?!\.)/gu, (_, p, c) => p + ' ' + c.toUpperCase())
  }
  const out = t.replace(/\u0001(\d+)\u0001/g, (_, i) => urls[+i])
  if (out !== s) { const sq = (x: string) => x.replace(/\s+/g, ''); fixes.push({ from: s, to: out, kind: sq(s) === sq(out) ? 'space' : sq(s).toLowerCase() === sq(out).toLowerCase() ? 'case' : 'punct' }) }
  return out
}

// ---------- Từ ----------
const WORD = /[\p{L}\p{M}]+(?:'[\p{L}]+)?/gu
const VI_CH = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
export const hasViChars = (s: string) => VI_CH.test(s)
const isUpperWord = (w: string) => w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()
const lev1 = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false
  if (a === b) return true
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  const [s, l] = a.length < b.length ? [a, b] : [b, a]
  return s.slice(i) === l.slice(i + 1)
}
const matchCase = (src: string, rep: string) => (src[0] !== src[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep)

function spellWords(text: string, lang: SpellLang, fixes: Fix[], flags: Flag[]) {
  if (!lang) return text
  let out = '', last = 0
  const urlSpans = [...text.matchAll(/(https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+)/g)].map(u => [u.index!, u.index! + u[0].length])
  for (const m of text.matchAll(WORD)) {
    const w = m[0], i = m.index!, inUrl = urlSpans.some(([a, b]) => i >= a && i < b), prev = text[i - 1] ?? '', next = text[i + w.length] ?? ''
    out += text.slice(last, i); last = i + w.length
    let rep = w
    const skip = inUrl || w.length < 2 || isUpperWord(w) || /[\d_/@#.]/.test(prev) || /[\d_/@#]/.test(next) || (next === '.' && /\p{L}/u.test(text[i + w.length + 1] ?? '')) || known(w)
    if (!skip) {
      const lineStart = /^\s*(?:[-•*·–]\s*)?$/.test(text.slice(0, i).split('\n').pop() ?? '') || /[.!?]\s+$/.test(text.slice(0, i))
      const proper = w[0] !== w[0].toLowerCase() && !lineStart && w.slice(1) === w.slice(1).toLowerCase()   // Tên riêng/hãng giữa câu
      if (lang === 'vi') {
        const r = checkVi(w)
        if (r.ok) { if (r.fixed !== w) { fixes.push({ from: w, to: r.fixed, kind: 'tone' }); rep = r.fixed } }
        else if (!proper && !(en && (en.correct(w) || en.correct(w.toLowerCase())))) {
          const s = suggestVi(w)
          if (r.hasVi && s.sure) { fixes.push({ from: w, to: s.sure, kind: 'spell' }); rep = s.sure }
          else if (r.hasVi || (en && w.length >= 4)) flags.push({ word: w, suggestions: s.list.slice(0, 5) })
        }
      } else if (en && !w.includes("'") && w.length >= 3 && !proper) {
        if (!en.correct(w) && !en.correct(w.toLowerCase())) {
          const sg = en.suggest(w).slice(0, 5), near = sg.filter(x => lev1(w.toLowerCase(), x.toLowerCase()))
          if (near.length === 1 && w.length >= 5 && !VI_CH.test(w)) { rep = matchCase(w, near[0]); fixes.push({ from: w, to: rep, kind: 'spell' }) }
          else flags.push({ word: w, suggestions: sg })
        }
      }
    }
    out += rep
  }
  return out + text.slice(last)
}

/** Sửa một đoạn text: dấu câu/khoảng trắng + chính tả. Đồng bộ (dùng từ điển Anh nếu đã nạp). */
export function fixText(text: string, lang: SpellLang, opts: SpellOpts = {}): SpellResult {
  const fixes: Fix[] = [], flags: Flag[] = []
  const nfc = text.normalize('NFC')
  if (nfc !== text) fixes.push({ from: text, to: nfc, kind: 'unicode' })
  let lines = nfc.split('\n').map(l => tidyLine(l, lang, opts, fixes))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  let t = lines.join('\n')
  t = spellWords(t, lang, fixes, flags)
  const seen = new Set<string>()
  return { text: t, fixes, flags: flags.filter(f => !seen.has(f.word.toLowerCase()) && seen.add(f.word.toLowerCase())) }
}
export const detectLang = (s: string): SpellLang => (hasViChars(s) ? 'vi' : null)

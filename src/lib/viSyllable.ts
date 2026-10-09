// Tiếng Việt: kiểm tra âm tiết theo luật ghép vần (phụ âm đầu + vần + phụ âm cuối + dấu thanh),
// chuẩn hoá vị trí dấu thanh (kiểu mới: hòa, thủy, quý) và gợi ý sửa lỗi gõ sai. Hoàn toàn bằng luật, không dùng AI.

const TONE_MARK: Record<string, number> = { '̀': 1, '́': 2, '̃': 3, '̉': 4, '̣': 5 }
const TONE_CHAR = ['', '̀', '́', '̃', '̉', '̣']

type Ch = { b: string; tone: number; upper: boolean }
function decomp(ch: string): Ch {
  const lower = ch.toLowerCase(), upper = ch !== lower
  let tone = 0, base = ''
  for (const c of lower.normalize('NFD')) { const t = TONE_MARK[c]; if (t) tone = t; else base += c }
  return { b: base.normalize('NFC'), tone, upper }
}
const compose = (c: Ch, tone: number) => { const s = (c.b + TONE_CHAR[tone]).normalize('NFC'); return c.upper ? s.toUpperCase() : s }

const VOWELS = 'aăâeêioôơuưy'
const ONSETS = ['ngh', 'ch', 'gh', 'gi', 'kh', 'ng', 'nh', 'ph', 'qu', 'th', 'tr', 'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x']
const CODAS = ['ch', 'ng', 'nh', 'c', 'm', 'n', 'p', 't']
const STOP = new Set(['c', 'ch', 'p', 't'])

/** vần (nhân) → các phụ âm cuối cho phép; open = được đứng không có phụ âm cuối */
const NUC: Record<string, { codas: string[]; open: boolean }> = (() => {
  const o: Record<string, { codas: string; open: boolean }> = {
    a: { codas: 'c ch m n ng nh p t', open: true }, ă: { codas: 'c m n ng p t', open: false }, â: { codas: 'c m n ng p t', open: false },
    e: { codas: 'c m n ng p t', open: true }, ê: { codas: 'ch m n nh p t', open: true }, i: { codas: 'ch m n nh p t', open: true },
    o: { codas: 'c m n ng p t', open: true }, ô: { codas: 'c m n ng p t', open: true }, ơ: { codas: 'm n p t', open: true },
    u: { codas: 'c m n ng p t', open: true }, ư: { codas: 'c m n ng t', open: true }, y: { codas: '', open: true },
    iê: { codas: 'c m n ng p t', open: false }, yê: { codas: 'm n t ng', open: false }, uô: { codas: 'c m n ng t', open: false }, ươ: { codas: 'c m n ng p t', open: false },
    oa: { codas: 'c ch n ng nh p t', open: true }, oă: { codas: 'c m n ng t', open: false }, oe: { codas: 'c m n ng t', open: true }, oo: { codas: 'c ng', open: false },
    uâ: { codas: 'n ng t', open: false }, uê: { codas: 'ch nh', open: true }, uy: { codas: 'ch nh n t p', open: true }, uyê: { codas: 'n t', open: false },
  }
  for (const k of 'ai ao au ay âu ây eo êu iu oi ôi ơi ui ưi ưu ia ua ưa uơ iêu yêu oai oao oay oeo uây uôi uya uyu ươi ươu'.split(' ')) o[k] = { codas: '', open: true }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { codas: v.codas ? v.codas.split(' ') : [], open: v.open }]))
})()

const FRONT = 'eêiy'
function onsetOk(onset: string, nuc: string) {
  const f = nuc[0]
  if (onset === 'k' || onset === 'gh' || onset === 'ngh') return FRONT.includes(f)
  if (onset === 'c' || onset === 'ng' || (onset === 'g' && f !== 'i')) return !FRONT.includes(f)
  if (onset === 'qu') return f !== 'u'
  return true
}
const toneOk = (coda: string, tone: number) => !STOP.has(coda) || tone === 2 || tone === 5

export type Parsed = { onset: number; nuc: number; len: number }   // độ dài (số chữ) của phụ âm đầu và vần
/** Phân tích dãy chữ cái (đã bỏ dấu thanh) thành onset/nuc/coda; trả null nếu không phải âm tiết hợp lệ */
function parseLetters(L: string[], tone: number): Parsed | null {
  const s = L.join('')
  if (!s || [...s].some(c => !'abcdeghiklmnopqrstuvxyăâđêôơư'.includes(c))) return null
  for (const onset of [...ONSETS, '']) {
    if (!s.startsWith(onset)) continue
    const rest = s.slice(onset.length)
    for (const coda of [...CODAS, '']) {
      if (coda && !rest.endsWith(coda)) continue
      const nuc = rest.slice(0, rest.length - coda.length)
      const spec = NUC[nuc]
      if (!spec) continue
      if (coda ? !spec.codas.includes(coda) : !spec.open) continue
      if (!onsetOk(onset, nuc) || !toneOk(coda, tone)) continue
      return { onset: onset.length, nuc: nuc.length, len: s.length }
    }
  }
  return null
}

/** Vị trí đặt dấu thanh trong vần (kiểu mới): nguyên âm có dấu mũ/móc/trăng; ươ → ơ; còn lại theo vần mở/đóng */
function toneAt(nuc: string[], closed: boolean) {
  if (nuc.length === 1) return 0
  const mod = nuc.map(c => 'ăâêôơư'.includes(c))
  if (mod.some(Boolean)) { const o = nuc.indexOf('ơ'); return o >= 0 ? o : mod.lastIndexOf(true) }
  if (nuc.length === 3) return 1
  return closed ? 1 : 0
}

export type ViResult = { ok: boolean; fixed: string; hasVi: boolean }
const hasMark = (c: Ch, orig: string) => c.b !== orig.toLowerCase() || c.tone > 0
/** Kiểm một từ tiếng Việt: ok = đúng luật âm tiết; fixed = cách viết chuẩn (đã đặt lại dấu thanh) */
export function checkVi(word: string): ViResult {
  const chars = Array.from(word.normalize('NFC')), cs = chars.map(decomp)
  const hasVi = chars.some((c, i) => hasMark(cs[i], c))
  const tones = cs.filter(c => c.tone > 0)
  if (tones.length > 1) return { ok: false, fixed: word, hasVi }
  const tone = tones[0]?.tone ?? 0
  const p = parseLetters(cs.map(c => c.b), tone)
  if (!p) return { ok: false, fixed: word, hasVi }
  if (!tone) return { ok: true, fixed: word.normalize('NFC'), hasVi }
  const nucChars = cs.slice(p.onset, p.onset + p.nuc).map(c => c.b)
  const idx = p.onset + toneAt(nucChars, p.onset + p.nuc < cs.length)
  const out = cs.map((c, i) => compose(c, i === idx ? tone : 0)).join('')
  return { ok: true, fixed: out, hasVi }
}

const ALPHA = [...'abcdeghiklmnopqrstuvxyăâđêôơư']
const PLAIN: Record<string, string> = { ă: 'a', â: 'a', ê: 'e', ô: 'o', ơ: 'o', ư: 'u', đ: 'd' }
const plain = (c: string) => PLAIN[c] ?? c
/** Gợi ý sửa từ gõ sai cách 1 chữ (đảo, thêm, bớt, thay, đổi dấu mũ/móc), xếp theo độ tin cậy.
 *  `sure` chỉ có khi đúng một gợi ý thuộc nhóm "gần như chắc chắn" (đảo 2 chữ, gõ đôi 1 chữ, sai dấu mũ/móc) – dùng để tự sửa. */
export function suggestVi(word: string): { list: string[]; sure: string | null } {
  const chars = Array.from(word.normalize('NFC')), cs = chars.map(decomp)
  const tone = cs.find(c => c.tone > 0)?.tone ?? 0
  if (cs.filter(c => c.tone > 0).length > 1 || cs.length < 2 || cs.length > 8) return { list: [], sure: null }
  const base = cs.map(c => c.b), tiers: Set<string>[] = [new Set(), new Set(), new Set(), new Set(), new Set()]
  const upperAll = word.length > 1 && word === word.toUpperCase(), upper1 = cs[0].upper, orig = word.normalize('NFC')
  const tryL = (L: string[], tier: number, t = tone) => {
    const p = parseLetters(L, t); if (!p) return
    const nuc = L.slice(p.onset, p.onset + p.nuc), idx = p.onset + toneAt(nuc, p.onset + p.nuc < L.length)
    let s = L.map((b, i) => (t && i === idx ? (b + TONE_CHAR[t]).normalize('NFC') : b)).join('')
    s = upperAll ? s.toUpperCase() : upper1 ? s[0].toUpperCase() + s.slice(1) : s
    if (s !== orig) tiers[tier].add(s)
  }
  for (let i = 0; i < base.length; i++) { const L = [...base.slice(0, i), ...base.slice(i + 1)]; tryL(L, base[i] === base[i + 1] || base[i] === base[i - 1] ? 0 : 3) }
  for (let i = 0; i < base.length - 1; i++) { const t = base.slice(); [t[i], t[i + 1]] = [t[i + 1], t[i]]; tryL(t, 0) }
  for (let i = 0; i < base.length; i++) for (const a of ALPHA) if (a !== base[i]) { const t = base.slice(); t[i] = a; tryL(t, plain(a) === plain(base[i]) ? 0 : 2) }
  if (!tone) for (let t = 1; t <= 5; t++) tryL(base, 1, t)
  for (let i = 0; i <= base.length; i++) for (const a of ALPHA) tryL([...base.slice(0, i), a, ...base.slice(i)], 4)
  const list = tiers.flatMap(t => [...t]).slice(0, 6)
  return { list, sure: tiers[0].size === 1 ? [...tiers[0]][0] : null }
}

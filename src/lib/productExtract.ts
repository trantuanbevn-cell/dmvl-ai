import { translateSpec } from './specTranslate'
// Đọc thông tin kỹ thuật từ trang sản phẩm của nhà sản xuất – KHÔNG dùng AI:
// dữ liệu có cấu trúc (JSON-LD schema.org/Product, meta og:) + bảng thông số (table, dl, danh sách "Tên: giá trị").
import type { Entry } from './types'

export type Extracted = {
  brand?: string; product_name?: string; product_code?: string; origin?: string; material?: string; image?: string
  specs: [string, string][]; lang: 'vn' | 'en'; found: string[]
}
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()
const nk = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const KEY = {
  origin: /^(xuat xu|nuoc san xuat|san xuat tai|noi san xuat|made in|country of origin|origin|country)\b/,
  brand: /^(thuong hieu|hang san xuat|hang|nha san xuat|nhan hieu|brand|manufacturer|producer)\b/,
  code: /^(ma san pham|ma hang|ma sp|ma so|ma hieu|ma vat lieu|model|sku|mpn|part (no|number)|item (no|code)|product code|article( no| number)?|ref(erence)?|code|ma)\b/,
  material: /^(chat lieu|vat lieu|material|thanh phan|composition|be mat|finish|surface)\b/,
}
const JUNK = /^(gia|price|so luong|quantity|mua|dat hang|lien he|hotline|email|share|chia se|tinh trang|availability|danh muc|category|tags?|the|luot xem|views?|ma giam gia|vat|thue|phi|van chuyen|shipping)\b/

function absUrl(u: string | undefined, base: string) { if (!u) return undefined; try { return new URL(u, base).toString() } catch { return undefined } }

function jsonLdProducts(doc: Document): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n) return
    if (Array.isArray(n)) return n.forEach(walk)
    if (typeof n !== 'object') return
    const t = ([] as string[]).concat(n['@type'] ?? []).map(String)
    if (t.some(x => /^Product(Group)?$/i.test(x))) out.push(n)
    if (n['@graph']) walk(n['@graph'])
    if (n.mainEntity) walk(n.mainEntity)
    if (n.itemListElement) walk(n.itemListElement)
  }
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { walk(JSON.parse(s.textContent ?? '')) } catch { /* json lỗi → bỏ qua */ } })
  return out
}
const txt = (v: any): string => (v == null ? '' : typeof v === 'object' ? clean(v.name ?? v.value ?? v['@id'] ?? '') : clean(v))

/** Cặp "tên – giá trị" từ bảng thông số trong trang */
function specPairs(doc: Document): [string, string][] {
  const pairs: [string, string][] = [], seen = new Set<string>()
  const add = (k: string, v: string) => {
    k = clean(k).replace(/[:：]\s*$/, ''); v = clean(v)
    if (!k || !v || k.length > 48 || v.length > 400 || k === v) return
    const key = nk(k); if (!key || JUNK.test(key)) return
    const id = key + '|' + nk(v); if (seen.has(id)) return; seen.add(id); pairs.push([k, v])
  }
  doc.querySelectorAll('script,style,noscript,nav,footer,header,form,select,button').forEach(n => n.remove())
  doc.querySelectorAll('tr').forEach(tr => { const c = [...tr.children].filter(x => /^(TD|TH)$/.test(x.tagName)); if (c.length === 2) add(c[0].textContent ?? '', c[1].textContent ?? '') })
  doc.querySelectorAll('dl').forEach(dl => { const dt = [...dl.querySelectorAll('dt')], dd = [...dl.querySelectorAll('dd')]; dt.forEach((t, i) => dd[i] && add(t.textContent ?? '', dd[i].textContent ?? '')) })
  // danh sách / đoạn dạng "Tên: giá trị" (gạch đầu dòng trong tab Thông số)
  doc.querySelectorAll('li,p').forEach(el => {
    if (el.querySelector('li,p,table')) return
    const t = clean(el.textContent); const m = /^([^:：]{2,42})[:：]\s*(.{1,300})$/.exec(t)
    if (m) add(m[1], m[2])
  })
  return pairs.slice(0, 80)
}

export function extractProduct(html: string, pageUrl: string): Extracted {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const found: string[] = []
  const meta = (n: string) => clean(doc.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.getAttribute('content'))
  const prods = jsonLdProducts(doc)
  const p = prods[0]
  const out: Extracted = { specs: [], lang: 'vn', found }
  if (p) {
    found.push('JSON-LD')
    out.product_name = txt(p.name) || undefined
    out.brand = txt(p.brand) || txt(p.manufacturer) || undefined
    out.product_code = txt(p.mpn) || txt(p.sku) || txt(p.model) || txt(p.productID) || undefined
    out.origin = txt(p.countryOfOrigin) || txt(p.countryOfAssembly) || undefined
    out.material = txt(p.material) || undefined
    const im = Array.isArray(p.image) ? p.image[0] : p.image
    out.image = absUrl(typeof im === 'object' ? im?.url : im, pageUrl)
    for (const [k, label] of [['color', 'Màu sắc'], ['width', 'Rộng'], ['height', 'Cao'], ['depth', 'Sâu'], ['weight', 'Khối lượng'], ['size', 'Kích thước']] as const) { const v = txt(p[k]); if (v) out.specs.push([label, v]) }
    for (const ap of ([] as any[]).concat(p.additionalProperty ?? [])) { const k = txt(ap?.name), v = txt(ap?.value); if (k && v) out.specs.push([k, v]) }
  }
  out.product_name ||= meta('og:title') || clean(doc.querySelector('h1')?.textContent) || clean(doc.title) || undefined
  out.image ||= absUrl(meta('og:image'), pageUrl)
  out.brand ||= meta('product:brand') || meta('og:site_name') || undefined
  const pairs = specPairs(doc)
  if (pairs.length) found.push('bảng thông số')
  for (const [k, v] of pairs) {
    const key = nk(k)
    if (KEY.origin.test(key)) { out.origin ||= v; continue }
    if (KEY.brand.test(key)) { out.brand = out.brand && p ? out.brand : v; continue }
    if (KEY.code.test(key)) { out.product_code ||= v; continue }
    if (KEY.material.test(key) && !out.material) { out.material = v }
    out.specs.push([k, v])
  }
  // gộp trùng + mô tả ngắn nếu không có bảng thông số
  const seen = new Set<string>(); out.specs = out.specs.filter(([k, v]) => { const id = nk(k) + '|' + nk(v); if (seen.has(id)) return false; seen.add(id); return true }).slice(0, 40)
  if (!out.specs.length) { const d = meta('og:description') || meta('description'); if (d) { out.specs.push(['Mô tả', d.slice(0, 300)]); found.push('mô tả') } }
  if (!out.brand) { try { const h = new URL(pageUrl).hostname.replace(/^www\./, '').split('.')[0]; out.brand = h.charAt(0).toUpperCase() + h.slice(1) } catch { /* */ } }
  if (out.product_name && out.brand && out.product_name.length > 90) out.product_name = out.product_name.slice(0, 90)
  const sample = [out.product_name, ...out.specs.map(s => s.join(' '))].join(' ')
  out.lang = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(sample) ? 'vn' : 'en'
  return out
}

export const specText = (ex: Extracted) => ex.specs.map(([k, v]) => `${k}: ${v}`).join('\n')

export type FieldChange = { key: keyof Entry; label: string; old: string; value: string }
/** Các ô sẽ được điền từ kết quả đọc (mặc định chỉ điền ô đang trống) */
export function planFill(e: Entry, ex: Extracted, overwrite = false): FieldChange[] {
  const ch: FieldChange[] = []
  const put = (key: keyof Entry, label: string, value?: string | null) => {
    const v = clean(value); if (!v) return
    const old = String((e[key] as any) ?? '')
    if (old.trim() && !overwrite) return
    if (clean(old) === v) return
    ch.push({ key, label, old, value: key === 'desc_vn' || key === 'desc_en' ? String(value).trim() : v })
  }
  put('brand', 'Hãng', ex.brand)
  put('product_name', 'Tên sản phẩm', ex.product_name)
  put('product_code', 'Mã sản phẩm', ex.product_code)
  put('origin', 'Xuất xứ', ex.origin)
  put(ex.lang === 'vn' ? 'material_vn' : 'material_en', ex.lang === 'vn' ? 'Vật liệu' : 'Material', ex.material)
  const st = specText(ex)
  put(ex.lang === 'vn' ? 'desc_vn' : 'desc_en', ex.lang === 'vn' ? 'Thông số kỹ thuật' : 'Specification', st)
  // Thông số tiếng Việt vừa điền → dịch luôn sang tiếng Anh theo từng dòng (từ điển) để hai ngôn ngữ luôn khớp nhau; không đè bản EN tự soạn nếu không dịch hết
  if (ex.lang === 'vn' && ch.some(c => c.key === 'desc_vn')) {
    const t = translateSpec(st)
    if (t.ok && t.en) ch.push({ key: 'desc_en', label: 'Thông số (EN)', old: String(e.desc_en ?? ''), value: t.en })
  }
  put('product_image_url', 'Ảnh mẫu', ex.image)
  return ch
}

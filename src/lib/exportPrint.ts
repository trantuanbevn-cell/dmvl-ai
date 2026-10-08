import { CATEGORIES } from './codes'
import { groupBySection, sectionTitle, bandTitle, exportSymbols, symbolOf, tx, planSheets, type ExportOpts } from './sections'
import { signedUrls } from './supabase'
import { viewCanvas, regionCanvas } from './crop'
import { locationsOf, locationLines } from './locations'
import { filterEntries, ExportData } from './exportExcel'
import { entryCells, pair, hostOf, type Seg } from './biText'
import { STATUS_VN, STATUS_EN } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>')

/** Mở trang in (A3 ngang) – người dùng chọn "Lưu dưới dạng PDF" */
export async function printSchedule(d: ExportData, o: ExportOpts) {
  const L = o.lang, vn = L !== 'en', includePending = o.includePending
  const h = (a: string, b: string) => (L === 'vn' ? a : L === 'en' ? b : `${a} / ${b}`)
  const both = L === 'both'
  const html1 = (ls: Seg[]) => ls.map(l => `<div class="${both ? l.k : 'n'}">${esc(l.t)}</div>`).join('')   // song ngữ: VN đậm trên, EN nghiêng dưới
  const hd = (a: string, b: string) => (both ? `<div class="vn">${esc(a)}</div><div class="en">${esc(b)}</div>` : esc(L === 'en' ? b : a))
  const w = window.open('', '_blank')
  if (!w) throw new Error('Trình duyệt chặn cửa sổ mới – hãy cho phép popup.')
  w.document.write('<p style="font-family:sans-serif">Đang dựng trang in…</p>')
  const list = filterEntries(d.entries, includePending)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const urls = await signedUrls([...new Set([...d.pages.map(p => p.image_path), ...d.occ.map(x => x.view?.img), ...d.entries.map(x => x.mat_view?.img)].filter(Boolean) as string[])])
  const H = [hd('STT', 'No.'), hd('KÍ HIỆU BẢN VẼ', 'DRAWING CODE'), hd('KÍ HIỆU VL', 'MATERIAL CODE'), hd('Hạng mục', 'Item'), hd('Vị trí', 'Location'), hd('Hình ảnh phối cảnh', 'Render image'), hd('Thông số kỹ thuật', 'Specification'), hd('Xuất xứ/ Thương hiệu', 'Origin / Brand'), hd('Hình ảnh vật liệu', 'Material image'), hd('Ghi chú', 'Remarks')]
  const sym = exportSymbols(list, o.renumber)
  const catL = (k: string) => { const c = CATEGORIES.find(x => x.key === k); return c ? tx(c.vn, c.en, L) : k }
  let rows = '', lastBand = ''
  const sheets = planSheets(groupBySection(list), o)
  for (const [si, sh] of sheets.entries()) {
    if (sheets.length > 1) { rows += `<tr class="sh${si ? ' brk' : ''}"><td colspan="${H.length}">${esc(sh.name)}</td></tr>`; lastBand = '' }
  for (const { section, items } of sh.groups) {
    if (section.band !== lastBand) { lastBand = section.band; rows += `<tr class="b"><td colspan="${H.length}">${html1(pair(bandTitle(section.band, 'vn'), bandTitle(section.band, 'en'), L))}</td></tr>` }
    rows += `<tr class="g"><td colspan="${H.length}">${html1(pair(sectionTitle(section, 'vn').replace('\n', ' / '), sectionTitle(section, 'en').replace('\n', ' / '), L))}</td></tr>`
    let stt = 0
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const best = occ.filter(o => o.bbox && (o.page_id || o.view?.img)).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      let img = ''
      if (best) { const p = best.page_id ? pageById.get(best.page_id) : undefined; if (p || best.view?.img) { try { img = `<img src="${(await viewCanvas(p ? urls[p.image_path] : undefined, best.bbox!, best.view, best.view?.img ? urls[best.view.img] : undefined, 900, true)).toDataURL('image/jpeg', 0.92)}">` } catch { /* */ } } }
      let matUrl = ''
      const mvSrc = e.mat_view?.img ? urls[e.mat_view.img] : e.product_image_url
      if (mvSrc && (e.mat_view?.img || e.mat_view?.region)) { try { matUrl = (await regionCanvas(mvSrc, e.mat_view?.region, 300)).toDataURL('image/png') } catch { /* */ } }
      const map = matUrl ? `<img src="${matUrl}">` : e.product_image_url ? `<img src="${esc(e.product_image_url)}">` : e.color_hex ? `<div class="sw" style="background:${esc(e.color_hex)}"></div><small>${esc(e.color_hex)}</small>` : ''
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const cl = entryCells(e, L, [...new Set(occ.map(o => o.category ?? e.category).filter(Boolean) as string[])], locs)
      rows += `<tr class="${e.source === 'inferred' ? 'inf' : ''}"><td>${stt}</td><td class="code">${esc(symbolOf(e, L, sym.legacy, sym.en))}</td><td class="code">${esc(e.product_code ?? '')}</td><td>${html1(cl.cat)}</td><td>${html1(cl.loc)}</td><td class="im">${img}</td>
        <td>${html1(cl.spec)}</td>
        <td>${html1(cl.brand)}</td><td class="im">${map}${e.product_url ? `<div class="lk"><a href="${esc(e.product_url)}">🔗 ${esc(hostOf(e.product_url))}</a></div>` : ''}</td>
        <td>${html1(cl.note)}</td></tr>`
    }
  }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DMVL – ${esc(d.project.name)}</title><style>
  @page { size: A3 landscape; margin: 10mm }
  body { font-family: Arial, sans-serif; font-size: 9px; color:#222 }
  h1 { font-size: 16px; color:#6B3A1F; margin:0 } h1 .en { font-size: 13px } .sub { color:#555; margin:2px 0 8px }
  table { width:100%; border-collapse:collapse; table-layout:fixed } th { background:#6B3A1F; color:#fff; padding:4px; font-size:9px }
  td { border:1px solid #c9b9a8; padding:3px; vertical-align:top; word-wrap:break-word } thead { display:table-header-group }
  tr { page-break-inside:avoid } tr.sh td { background:#222; color:#fff; font-size:12px; font-weight:bold } tr.brk { page-break-before: always }
  tr.b td { background:#6B3A1F; color:#fff; font-weight:bold; font-size:11px } tr.g td { background:#d9d9d9; font-weight:bold; font-size:10px }
  tr.inf td { background:#FFF9E5 } td.code { font-weight:bold; color:#6B3A1F; text-align:left } td.im img { max-width:100%; max-height:150px; display:block; margin-bottom:3px }
  .vn { font-weight:bold } .en { font-style:italic; margin-bottom:2px } .vn + .vn, .n + .n { margin-top:1px } td div { line-height:1.3 } th .vn, th .en { font-weight:bold } .lk { margin-top:3px; word-break:break-all } .sw { width:60px; height:44px; border:1px solid #aaa } small { color:#666 } .w { color:#c00 } a { color:#1F4E9A; font-size:8px }
  </style></head><body><h1>${hd('BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN', 'FINISHES & FF&E MATERIAL SCHEDULE')}</h1>
  <div class="sub">${h('Dự án', 'Project')}: ${esc(d.project.name)}${d.project.location ? ' · ' + esc(d.project.location) : ''} · ${new Date().toLocaleDateString(vn ? 'vi-VN' : 'en-GB')}</div>
  <table><colgroup><col style="width:2.2%"><col style="width:5.5%"><col style="width:6.5%"><col style="width:7.5%"><col style="width:14%"><col style="width:14%"><col style="width:26%"><col style="width:10.5%"><col style="width:8.5%"><col style="width:5.3%"></colgroup>
  <thead><tr>${H.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`
  w.document.open(); w.document.write(html); w.document.close()
}

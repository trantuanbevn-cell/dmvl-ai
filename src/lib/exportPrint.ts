import { CATEGORIES } from './codes'
import { vlLines, groupBySection, sectionTitle, bandTitle, exportSymbols, symbolOf, tx, planSheets, PREFIXES, prefixLabel, type ExportOpts } from './sections'
import { signedUrls } from './supabase'
import { matMontage, extraPaths } from './matImages'
import { viewCanvas, regionCanvas } from './crop'
import { locationsOf, locationLines } from './locations'
import { filterEntries, ExportData, exportBaseName } from './exportExcel'
import { finishLines } from './finishCheck'
import { allRoomsCount, entryCells, pair, hostOf, type Seg } from './biText'
import { STATUS_VN, STATUS_EN } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>')

/** Mở trang in (A3 ngang) – người dùng chọn "Lưu dưới dạng PDF" */
export async function printSchedule(d: ExportData, o: ExportOpts) {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Trình duyệt chặn cửa sổ mới – hãy cho phép popup.')
  w.document.write('<p style="font-family:sans-serif">Đang dựng trang in…</p>')
  const html = await buildScheduleHtml(d, o, true)
  w.document.open(); w.document.write(html); w.document.close()
}

/** Dựng HTML bảng danh mục – dùng cho in/PDF (print=true) và xem trước trong phần mềm (print=false) */
export async function buildScheduleHtml(d: ExportData, o: ExportOpts, print: boolean): Promise<string> {
  const L = o.lang, vn = L !== 'en', includePending = o.includePending
  const h = (a: string, b: string) => (L === 'vn' ? a : L === 'en' ? b : `${a} / ${b}`)
  const both = L === 'both'
  const html1 = (ls: Seg[]) => ls.map(l => l.runs ? `<div>${l.runs.map(r => `<span class="${r.k}">${esc(r.t)}</span>`).join('')}</div>` : `<div class="${both ? l.k : 'n'}">${esc(l.t)}</div>`).join('')   // song ngữ: VN đậm trên, EN nghiêng dưới
  const hd = (a: string, b: string) => (both ? `<div class="vn">${esc(a)}</div><div class="en">${esc(b)}</div>` : esc(L === 'en' ? b : a))
  const list = filterEntries(d.entries, includePending)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const urls = await signedUrls([...new Set([...d.pages.map(p => p.image_path), ...d.occ.map(x => x.view?.img), ...d.entries.map(x => x.mat_view?.img), ...d.entries.flatMap(x => extraPaths(x))].filter(Boolean) as string[])])
  const H = [hd('STT', 'No.'), hd('KÍ HIỆU BẢN VẼ', 'DRAWING CODE'), hd('KÍ HIỆU VL', 'MATERIAL CODE'), hd('Hạng mục', 'Item'), hd('Vị trí', 'Location'), hd('Hình ảnh phối cảnh', 'Render image'), hd('Thông số kỹ thuật', 'Technical specification'), hd('Xuất xứ/ Thương hiệu', 'Origin / Brand'), hd('Hình ảnh vật liệu', 'Material image'), hd('Ghi chú', 'Remarks'),
    ...(o.quote ? [hd('Số lượng', 'Quantity'), hd('ĐVT', 'Unit'), hd('Đơn giá (VNĐ)', 'Unit price (VND)'), hd('Thành tiền (VNĐ)', 'Amount (VND)')] : [])]
  const bandRow = `<tr>${[[6, 'NỘI DUNG', 'CONTENT', '#B22A2A'], [4, 'VẬT LIỆU ĐỊNH HƯỚNG', 'DESIGNER-SPECIFIED MATERIAL', '#B22A2A'], ...(o.quote ? [[4, 'BÁO GIÁ', 'PRICING', '#2E6B3A']] : [])].map(([n, a, b, c]) => `<th colspan="${n}" style="background:${c};text-align:center">${hd(a as string, b as string)}</th>`).join('')}</tr>`
  const sym = exportSymbols(list, o.renumber)
  const catL = (k: string) => { const c = CATEGORIES.find(x => x.key === k); return c ? tx(c.vn, c.en, L) : k }
  // ảnh từng dòng dựng SONG SONG (6 luồng) trước khi ghép bảng – trước đây dựng tuần tự nên 100 mã chạy rất lâu
  const prep = async (e: typeof list[number]) => {
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const best = occ.filter(o => o.bbox && (o.page_id || o.view?.img)).sort((a, b) => (b.note ? 1 : 0) - (a.note ? 1 : 0) || (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      let img = ''
      if (best) { const p = best.page_id ? pageById.get(best.page_id) : undefined; if (p || best.view?.img) { try { img = `<img src="${(await viewCanvas(p ? urls[p.image_path] : undefined, best.bbox!, best.view, best.view?.img ? urls[best.view.img] : undefined, 900, true)).toDataURL('image/jpeg', 0.92)}">` + (best.note ? `<small style="color:#c00;display:block">${esc(best.note)}</small>` : '') } catch { /* */ } } }
      let matUrl = ''
      try { matUrl = (await matMontage(e, urls)) ?? '' } catch { /* */ }
      const mvSrc = e.mat_view?.img ? urls[e.mat_view.img] : e.product_image_url
      if (!matUrl && mvSrc && (e.mat_view?.img || e.mat_view?.region)) { try { matUrl = (await regionCanvas(mvSrc, e.mat_view?.region, 300)).toDataURL('image/png') } catch { /* */ } }
      const map = matUrl ? `<img src="${matUrl}">` : e.product_image_url ? `<img src="${esc(e.product_image_url)}">` : ''
    return { occ, img, map }
  }
  const pre = new Map<string, { occ: typeof d.occ; img: string; map: string }>()
  { const q = [...list]; await Promise.all(Array.from({ length: 6 }, async () => { for (let e = q.shift(); e; e = q.shift()) { try { pre.set(e.id, await prep(e)) } catch { /* dòng lỗi ảnh vẫn xuất chữ */ } } })) }
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
      const { occ, img, map } = pre.get(e.id) ?? { occ: d.occ.filter(o => o.entry_id === e.id), img: '', map: '' }
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const cl = entryCells(e, L, [...new Set(occ.map(o => o.category ?? e.category).filter(Boolean) as string[])], locs, finishLines(e, d.entries, y => symbolOf(y, L, sym.legacy, sym.en)), allRoomsCount(locs, d.rooms))
      rows += `<tr class="${!print && e.source === 'inferred' ? 'inf' : ''}"><td>${stt}</td><td class="code">${esc(symbolOf(e, L, sym.legacy, sym.en))}</td><td class="code">${esc(vlLines(e.product_code, symbolOf(e, L, sym.legacy, sym.en)).join('\n')).replace(/\n/g, '<br>')}</td><td>${html1(cl.cat)}</td><td>${cl.loc2.length ? `<div style="display:flex;gap:8px"><div style="flex:1">${html1(cl.loc)}</div><div style="flex:1">${html1(cl.loc2)}</div></div>` : html1(cl.loc)}</td><td class="im">${img || `<small style="color:#7F6000;font-style:italic">${esc(h('(không thể hiện trong phối cảnh)', '(not shown in render)'))}</small>`}</td>
        <td>${html1(cl.spec)}</td>
        <td>${html1(cl.brand)}</td><td class="im">${map}${e.product_url ? e.product_url.split(/\s+/).filter(Boolean).map(u => `<div class="lk"><a href="${esc(u)}">🔗 ${esc(hostOf(u))}</a></div>`).join('') : ''}</td>
        <td>${html1(cl.note)}</td>${o.quote ? `<td>${esc(e.qty ?? '')}</td><td>${esc(e.unit ?? '')}</td><td></td><td></td>` : ''}</tr>`
    }
  }
    if (o.quote) rows += `<tr><td colspan="${H.length - 1}" style="text-align:right;font-weight:bold">${esc(h('TỔNG CỘNG (chưa VAT)', 'TOTAL (excl. VAT)'))}</td><td style="font-weight:bold">0</td></tr>`   // giống dòng tổng của sheet Excel
  }
  // Các sheet phụ của file Excel (Theo phòng / Chú giải) – cũng hiện ở bản xem trước & PDF để ba bản giống hệt nhau
  let extra = ''
  const th2 = (t: string) => `<th>${t}</th>`
  if (o.roomSheet) {
    const entryById = new Map(list.map(e => [e.id, e]))
    const body = d.rooms.map(rm => `<tr><td>${esc(tx(rm.name_vn, rm.name_en, L).replace('\n', ' / '))}</td>${CATEGORIES.map(c => `<td>${esc([...new Set(d.occ.filter(x => x.room_id === rm.id && (x.category ?? entryById.get(x.entry_id)?.category) === c.key).map(x => { const e = entryById.get(x.entry_id); return e ? symbolOf(e, L, sym.legacy, sym.en) : '' }).filter(Boolean))].join(' · '))}</td>`).join('')}</tr>`).join('')
    extra += `<h2 class="brk">${esc(L === 'en' ? 'Room finish' : 'Theo phòng')}</h2><table><thead><tr>${th2(esc(h('Phòng', 'Room')))}${CATEGORIES.map(c => th2(esc(tx(c.vn, c.en, L).replace('\n', ' / ')))).join('')}</tr></thead><tbody>${body}</tbody></table>`
  }
  if (o.legend) {
    const used = PREFIXES.filter(p => list.some(e => p.groups.includes(e.group_code)))
    extra += `<h2 class="brk">${esc(L === 'en' ? 'Legend' : 'Chú giải ký hiệu')}</h2><table><thead><tr>${th2(esc(h('KÍ HIỆU', 'CODE')))}${th2(esc(h('Tên tiếng Anh', 'English name')))}${th2(esc(h('Tên tiếng Việt', 'Vietnamese name')))}${th2(esc(h('Bao gồm', 'Includes')))}</tr></thead><tbody>${used.map(p => `<tr><td class="code">${esc(prefixLabel(p.prefix))}</td><td>${esc(p.en)}</td><td>${esc(p.vn)}</td><td>${esc(L === 'en' ? p.includes_en : L === 'vn' ? p.includes_vn : `${p.includes_vn}\n${p.includes_en}`)}</td></tr>`).join('')}</tbody></table><p class="sub"><i>${esc(h('Ghi chú: ký hiệu = viết tắt tiếng Anh của họ vật liệu; loại con (gỗ tự nhiên, gỗ công nghiệp…) ghi ở cột Hạng mục/Thông số.', 'Note: code = English abbreviation of the material family; sub-types (solid wood, engineered wood…) are described in the Item / Specification columns.'))}</i></p>`
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(exportBaseName(d.project))}</title><style>
  @page { size: A3 landscape; margin: 10mm }
  body { font-family: Arial, sans-serif; font-size: 9px; color:#222 }
  h1 { font-size: 16px; color:#6B3A1F; margin:0 } h1 .en { font-size: 13px } .sub { color:#555; margin:2px 0 8px }
  table { width:100%; border-collapse:collapse; table-layout:fixed } th { background:#6B3A1F; color:#fff; padding:4px; font-size:9px }
  td { border:1px solid #c9b9a8; padding:3px; vertical-align:top; word-wrap:break-word } thead { display:table-header-group }
  tr { page-break-inside:avoid } tr.sh td { background:#222; color:#fff; font-size:12px; font-weight:bold } tr.brk { page-break-before: always } h2.brk { page-break-before: always; font-size:13px; color:#6B3A1F }
  tr.b td { background:#6B3A1F; color:#fff; font-weight:bold; font-size:11px } tr.g td { background:#d9d9d9; font-weight:bold; font-size:10px }
  tr.inf td { background:#FFF9E5 } td.code { font-weight:bold; color:#6B3A1F; text-align:left } td.im img { max-width:100%; max-height:150px; display:block; margin-bottom:3px }
  .vn { font-weight:bold } .en { font-style:italic; margin-bottom:2px } .vn + .vn, .n + .n { margin-top:1px } td div { line-height:1.3 } th .vn, th .en { font-weight:bold } .lk { margin-top:3px; word-break:break-all } .sw { width:60px; height:44px; border:1px solid #aaa } small { color:#666 } .w { color:#c00 } a { color:#1F4E9A; font-size:8px }
  </style></head><body><h1>${hd('BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN', 'FINISHES & FF&E MATERIAL SCHEDULE')}</h1>
  <div class="sub"><b>${both ? `${esc('DỰ ÁN: ' + d.project.name)}<br><i>${esc('PROJECT: ' + d.project.name)}</i>` : esc((L === 'en' ? 'PROJECT: ' : 'DỰ ÁN: ') + d.project.name)}</b><br>${both ? `${esc('ĐỊA ĐIỂM: ' + (d.project.location ?? ''))}<br><i>${esc('LOCATION: ' + (d.project.location ?? ''))}</i>` : esc((L === 'en' ? 'LOCATION: ' : 'ĐỊA ĐIỂM: ') + (d.project.location ?? ''))}</div>
  <table><colgroup><col style="width:2.2%"><col style="width:5.5%"><col style="width:6.5%"><col style="width:7.5%"><col style="width:14%"><col style="width:14%"><col style="width:26%"><col style="width:10.5%"><col style="width:8.5%"><col style="width:5.3%">${o.quote ? '<col style="width:4%"><col style="width:3%"><col style="width:5%"><col style="width:5%">' : ''}</colgroup>
  <thead>${bandRow}<tr>${H.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  ${extra}
  ${print ? '<script>window.onload=()=>setTimeout(()=>window.print(),400)</script>' : ''}</body></html>`
  return html
}

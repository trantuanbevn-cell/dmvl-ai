import { CATEGORIES } from './codes'
import { groupBySection, sectionTitle, bandTitle, legacyCodes, symbolOf, tx, type Lang } from './sections'
import { signedUrls } from './supabase'
import { contextCanvas } from './crop'
import { locationsOf, locationLines } from './locations'
import { filterEntries, ExportData } from './exportExcel'
import { STATUS_VN, STATUS_EN } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>')

/** Mở trang in (A3 ngang) – người dùng chọn "Lưu dưới dạng PDF" */
export async function printSchedule(d: ExportData, lang: Lang, includePending: boolean) {
  const L = lang, vn = lang !== 'en'
  const h = (a: string, b: string) => (L === 'vn' ? a : L === 'en' ? b : `${a} / ${b}`)
  const nl = (t: string) => esc(t)
  const w = window.open('', '_blank')
  if (!w) throw new Error('Trình duyệt chặn cửa sổ mới – hãy cho phép popup.')
  w.document.write('<p style="font-family:sans-serif">Đang dựng trang in…</p>')
  const list = filterEntries(d.entries, includePending)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const urls = await signedUrls([...new Set(d.pages.map(p => p.image_path))])
  const H = [h('STT', 'No.'), h('Ký hiệu', 'Code'), h('Mục', 'Application'), h('Vị trí', 'Location'), h('Thống kê', 'Qty'), h('Hình phối cảnh', 'Render'), h('Mẫu', 'Sample'), h('Thông số kỹ thuật', 'Specification'), h('Xuất xứ / Thương hiệu', 'Origin / Brand'), h('Ghi chú', 'Remarks')]
  const legacy = legacyCodes(d.entries)
  const catL = (k: string) => { const c = CATEGORIES.find(x => x.key === k); return c ? tx(c.vn, c.en, L) : k }
  let rows = '', lastBand = ''
  for (const { section, items } of groupBySection(list)) {
    if (section.band !== lastBand) { lastBand = section.band; rows += `<tr class="b"><td colspan="${H.length}">${esc(bandTitle(section.band, L))}</td></tr>` }
    rows += `<tr class="g"><td colspan="${H.length}">${esc(sectionTitle(section, L))}</td></tr>`
    let stt = 0
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const best = occ.filter(o => o.bbox && o.page_id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      let img = ''
      if (best) { const p = pageById.get(best.page_id!); if (p) { try { img = `<img src="${(await contextCanvas(urls[p.image_path], best.bbox!, 520)).toDataURL('image/jpeg', 0.85)}">` } catch { /* */ } } }
      const map = e.product_image_url ? `<img src="${esc(e.product_image_url)}">` : e.color_hex ? `<div class="sw" style="background:${esc(e.color_hex)}"></div><small>${esc(e.color_hex)}</small>` : ''
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const rooms = locs.length ? locs.map(l => `${esc(l.room.code)} – ${esc(tx(l.room.name_vn, l.room.name_en, L).replace('\n', ' / '))}${l.pages.length ? ` (${vn ? 'tr.' : 'p.'}${l.pages.join(', ')})` : ''}`).join('<br>') : '—'
      const cats = [...new Set(occ.map(o => o.category ?? e.category).filter(Boolean) as string[])].map(catL).join(' / ')
      const spec = [tx(e.name_vn, e.name_en, L) && `<b>${esc(tx(e.name_vn, e.name_en, L))}</b>`, esc(tx(e.desc_vn || e.material_vn, e.desc_en || e.material_en, L)),
        e.composition ? `<small>${h('Cấu tạo', 'Composition')}: ${esc(e.composition)}</small>` : '', e.perf_vn ? `<small>${h('Yêu cầu', 'Requirement')}: ${esc(tx(e.perf_vn, e.perf_en, L))}</small>` : '', e.standards ? `<small>${h('Tiêu chuẩn', 'Standards')}: ${esc(e.standards)}</small>` : ''].filter(Boolean).join('<br>')
      rows += `<tr class="${e.source === 'inferred' ? 'inf' : ''}"><td>${stt}</td><td class="code">${esc(symbolOf(e, L, legacy))}</td><td>${esc(cats)}</td><td>${rooms}</td>
        <td>${esc(e.qty ?? '')} ${esc(e.unit ?? '')}${e.qty_flag !== 'ok' ? ' <b class="w">⚠</b>' : ''}</td><td class="im">${img}</td><td class="im">${map}</td>
        <td>${spec}</td>
        <td>${esc([e.brand, e.product_code, e.origin].filter(Boolean).join(' · '))}${e.product_url ? `<br><a href="${esc(e.product_url)}">${esc(e.product_url)}</a>` : ''}</td>
        <td>${esc(tx(e.note_vn, e.note_en, L))}${e.status !== 'approved' ? `<br><i>${esc((vn ? STATUS_VN : STATUS_EN)[e.status])}</i>` : ''}</td></tr>`
    }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DMVL – ${esc(d.project.name)}</title><style>
  @page { size: A3 landscape; margin: 10mm }
  body { font-family: Arial, sans-serif; font-size: 9px; color:#222 }
  h1 { font-size: 16px; color:#6B3A1F; margin:0 } .sub { color:#555; margin:2px 0 8px }
  table { width:100%; border-collapse:collapse; table-layout:fixed } th { background:#6B3A1F; color:#fff; padding:4px; font-size:9px }
  td { border:1px solid #c9b9a8; padding:3px; vertical-align:top; word-wrap:break-word } thead { display:table-header-group }
  tr { page-break-inside:avoid } tr.b td { background:#6B3A1F; color:#fff; font-weight:bold; font-size:11px } tr.g td { background:#d9d9d9; font-weight:bold; font-size:10px }
  tr.inf td { background:#FFF9E5 } td.code { font-weight:bold; color:#6B3A1F; text-align:center } td.im img { max-width:100%; max-height:130px; display:block }
  .sw { width:60px; height:44px; border:1px solid #aaa } small { color:#666 } .w { color:#c00 } a { color:#1F4E9A; font-size:8px }
  </style></head><body><h1>${h('BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN', 'FINISHES & FF&E MATERIAL SCHEDULE')}</h1>
  <div class="sub">${h('Dự án', 'Project')}: ${esc(d.project.name)}${d.project.location ? ' · ' + esc(d.project.location) : ''} · ${new Date().toLocaleDateString(vn ? 'vi-VN' : 'en-GB')}</div>
  <table><colgroup><col style="width:2.5%"><col style="width:5%"><col style="width:6%"><col style="width:11%"><col style="width:4.5%"><col style="width:14%"><col style="width:6%"><col style="width:24%"><col style="width:15%"><col style="width:12%"></colgroup>
  <thead><tr>${H.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`
  w.document.open(); w.document.write(html); w.document.close()
}

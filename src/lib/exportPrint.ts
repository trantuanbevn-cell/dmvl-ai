import { GROUPS } from './codes'
import { signedUrls } from './supabase'
import { cropCanvas } from './crop'
import { filterEntries, ExportData } from './exportExcel'
import { STATUS_VN, STATUS_EN } from './types'

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>')

/** Mở trang in (A3 ngang) – người dùng chọn "Lưu dưới dạng PDF" */
export async function printSchedule(d: ExportData, lang: 'vn' | 'en', includePending: boolean) {
  const vn = lang === 'vn'
  const w = window.open('', '_blank')
  if (!w) throw new Error('Trình duyệt chặn cửa sổ mới – hãy cho phép popup.')
  w.document.write('<p style="font-family:sans-serif">Đang dựng trang in…</p>')
  const list = filterEntries(d.entries, includePending)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const roomById = new Map(d.rooms.map(r => [r.id, r]))
  const urls = await signedUrls([...new Set(d.pages.map(p => p.image_path))])
  const H = vn
    ? ['STT', 'Ký hiệu', 'Ảnh phối cảnh', 'Map', 'Tên hạng mục', 'Phòng / vị trí', 'Mô tả & thông số', 'Tính chất yêu cầu', 'Hãng · Mã · Link', 'SL', 'Ghi chú']
    : ['No.', 'Code', 'Render', 'Sample', 'Item', 'Room / location', 'Description & specification', 'Performance', 'Manufacturer · Code · Link', 'Qty', 'Remarks']
  let rows = '', stt = 0
  for (const g of GROUPS) {
    const items = list.filter(e => e.group_code === g.code).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    if (!items.length) continue
    rows += `<tr class="g"><td colspan="${H.length}">${g.code} · ${esc((vn ? g.vn : g.en).toUpperCase())} <span>(${esc(g.csi)})</span></td></tr>`
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const best = occ.filter(o => o.bbox && o.page_id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      let img = ''
      if (best) { const p = pageById.get(best.page_id!); if (p) { try { img = `<img src="${(await cropCanvas(urls[p.image_path], best.bbox!, 320)).toDataURL('image/jpeg', 0.85)}">` } catch { /* */ } } }
      const map = e.product_image_url ? `<img src="${esc(e.product_image_url)}">` : e.color_hex ? `<div class="sw" style="background:${esc(e.color_hex)}"></div><small>${esc(e.color_hex)}</small>` : ''
      const rooms = [...new Set(occ.map(o => o.room_id).filter(Boolean))].map(id => { const r = roomById.get(id!); return r ? `${r.code} ${vn ? r.name_vn : r.name_en || r.name_vn}` : '' }).join('<br>')
      rows += `<tr class="${e.source === 'inferred' ? 'inf' : ''}"><td>${stt}</td><td class="code">${esc(e.code)}</td><td class="im">${img}</td><td class="im">${map}</td>
        <td><b>${esc(vn ? e.name_vn : e.name_en || e.name_vn)}</b><br><small>${esc(vn ? e.part_vn : e.part_en || e.part_vn)}</small></td><td>${rooms}</td>
        <td>${esc(vn ? e.desc_vn || e.material_vn : e.desc_en || e.material_en)}${e.composition ? `<br><small>${vn ? 'Cấu tạo' : 'Composition'}: ${esc(e.composition)}</small>` : ''}</td>
        <td>${esc(vn ? e.perf_vn : e.perf_en || e.perf_vn)}${e.standards ? `<br><small>${esc(e.standards)}</small>` : ''}</td>
        <td>${esc(e.brand)} ${e.product_code ? '· ' + esc(e.product_code) : ''}${e.product_url ? `<br><a href="${esc(e.product_url)}">${esc(e.product_url)}</a>` : ''}</td>
        <td>${esc(e.qty)} ${esc(e.unit)}${e.qty_flag !== 'ok' ? ' <b class="w">⚠</b>' : ''}</td>
        <td>${esc(vn ? e.note_vn : e.note_en || e.note_vn)}${e.status !== 'approved' ? `<br><i>${esc((vn ? STATUS_VN : STATUS_EN)[e.status])}</i>` : ''}</td></tr>`
    }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DMVL – ${esc(d.project.name)}</title><style>
  @page { size: A3 landscape; margin: 10mm }
  body { font-family: Arial, sans-serif; font-size: 9px; color:#222 }
  h1 { font-size: 16px; color:#6B3A1F; margin:0 } .sub { color:#555; margin:2px 0 8px }
  table { width:100%; border-collapse:collapse; table-layout:fixed } th { background:#6B3A1F; color:#fff; padding:4px; font-size:9px }
  td { border:1px solid #c9b9a8; padding:3px; vertical-align:top; word-wrap:break-word } thead { display:table-header-group }
  tr { page-break-inside:avoid } tr.g td { background:#C57542; color:#fff; font-weight:bold; font-size:10px } tr.g span { font-weight:normal }
  tr.inf td { background:#FFF9E5 } td.code { font-weight:bold; color:#6B3A1F; text-align:center } td.im img { max-width:100%; max-height:90px; display:block }
  .sw { width:60px; height:44px; border:1px solid #aaa } small { color:#666 } .w { color:#c00 } a { color:#1F4E9A; font-size:8px }
  </style></head><body><h1>${vn ? 'BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN & ĐỒ NỘI THẤT' : 'FINISHES & FF&E MATERIAL SCHEDULE'}</h1>
  <div class="sub">${vn ? 'Dự án' : 'Project'}: ${esc(d.project.name)}${d.project.location ? ' · ' + esc(d.project.location) : ''} · ${new Date().toLocaleDateString(vn ? 'vi-VN' : 'en-GB')}</div>
  <table><colgroup><col style="width:2.5%"><col style="width:4%"><col style="width:10%"><col style="width:6%"><col style="width:11%"><col style="width:9%"><col style="width:20%"><col style="width:14%"><col style="width:11%"><col style="width:4%"><col style="width:8.5%"></colgroup>
  <thead><tr>${H.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)</script></body></html>`
  w.document.open(); w.document.write(html); w.document.close()
}

import ExcelJS from 'exceljs'
import { groupOf, CATEGORIES } from './codes'
import { groupBySection, sectionTitle, bandTitle, legacyCodes, symbolOf, tx, type Lang } from './sections'
import { signedUrls } from './supabase'
import { contextCanvas, swatchBase64, loadImage } from './crop'
import { locationsOf, locationLines } from './locations'
import type { Project, Room, Page, Entry, Occurrence } from './types'
import { STATUS_VN, STATUS_EN, SOURCE_VN, SOURCE_EN } from './types'

export type ExportData = { project: Project; rooms: Room[]; pages: Page[]; entries: Entry[]; occ: Occurrence[] }
const BROWN = 'FF6B3A1F', SAND = 'FFD9C8B4', ORANGE = 'FFC57542'
const thin = { style: 'thin' as const, color: { argb: 'FFB8A898' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

export function filterEntries(entries: Entry[], includePending: boolean) {
  return entries.filter(e => e.status === 'approved' || (includePending && (e.status === 'pending' || e.status === 'review')))
}

async function productImage(url: string): Promise<string | null> {
  try {
    const im = await loadImage(url)
    const c = document.createElement('canvas'); const r = Math.min(1, 240 / Math.max(im.naturalWidth, im.naturalHeight))
    c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r)
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1]
  } catch { return null }
}

export async function exportExcel(d: ExportData, lang: Lang, includePending: boolean) {
  const L = lang, vn = lang !== 'en'
  const h = (a: string, b: string) => (L === 'vn' ? a : L === 'en' ? b : `${a}\n${b}`)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DMVL AI'
  const ws = wb.addWorksheet(L === 'en' ? 'Schedule' : 'DMVL', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 as any } })
  // Bố cục theo mẫu DMVL của công ty: STT | Ký hiệu bản vẽ | Mã VL | Mục | Vị trí | Thống kê | Hình phối cảnh | Vật liệu định hướng… | khối nhà thầu | đánh giá
  const cols = [
    h('STT', 'No.'), h('KÍ HIỆU BẢN VẼ', 'DRAWING CODE'), h('Mã VL', 'Material code'), h('Mục', 'Application'), h('Vị trí', 'Location'), h('Thống kê', 'Qty'),
    h('Hình ảnh phối cảnh', 'Render image'), h('Mẫu vật liệu định hướng', 'Reference sample'), h('Thông số kỹ thuật', 'Technical specification'), h('Xuất xứ / Thương hiệu', 'Origin / Brand'), h('Link tham khảo', 'Reference link'), h('Ghi chú', 'Remarks'),
    h('Mã VL', 'Material code'), h('Hình ảnh', 'Image'), h('Thông số kỹ thuật', 'Specification'), h('Xuất xứ / Thương hiệu', 'Origin / Brand'), h('Bảo hành', 'Warranty'), h('Ghi chú / Giải trình làm rõ của Nhà thầu', 'Remarks / Contractor clarification'),
    h('Đánh giá của P.KHKT', 'Technical dept. review'), h('Đánh giá của K.QHTK', 'Design dept. review'),
    h('Nguồn', 'Source'), h('Trạng thái', 'Status'), h('Cờ số lượng', 'Qty flag'),
  ]
  const widths = [5, 12, 15, 13, 28, 9, 34, 16, 46, 22, 26, 26, 14, 14, 26, 16, 10, 22, 14, 14, 9, 11, 14]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  ws.mergeCells(1, 1, 1, 12)
  ws.getCell(1, 1).value = h('BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN', 'FINISHES & FF&E MATERIAL SCHEDULE')
  ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: BROWN } }
  ws.mergeCells(2, 1, 2, 12)
  ws.getCell(2, 1).value = `${h('DỰ ÁN', 'PROJECT')}: ${d.project.name}`
  ws.getCell(2, 1).font = { name: 'Arial', size: 10, bold: true }
  ws.mergeCells(3, 1, 3, 12)
  ws.getCell(3, 1).value = `${h('ĐỊA ĐIỂM', 'LOCATION')}: ${d.project.location ?? ''}`
  ws.getCell(3, 1).font = { name: 'Arial', size: 10, italic: true }
  const bands: [number, number, string][] = [[1, 7, h('NỘI DUNG', 'CONTENT')], [8, 12, h('VẬT LIỆU ĐỊNH HƯỚNG', 'DESIGNER-SPECIFIED MATERIAL')], [13, 18, h('THÔNG SỐ HỢP ĐỒNG NHÀ THẦU ĐỀ XUẤT', 'CONTRACTOR SUBMITTAL')], [19, 20, h('ĐÁNH GIÁ', 'REVIEW')], [21, 23, h('NỘI BỘ (không in)', 'INTERNAL (do not print)')]]
  for (const [a, b, t] of bands) {
    ws.mergeCells(4, a, 4, b); const c = ws.getCell(4, a); c.value = t
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a === 21 ? 'FF7F7F7F' : 'FFB22A2A' } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border
  }
  const hr = ws.getRow(5)
  cols.forEach((t, i) => {
    const c = hr.getCell(i + 1); c.value = t
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i >= 20 ? 'FF7F7F7F' : 'FFB22A2A' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
  })
  hr.height = 34
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }]

  const list = filterEntries(d.entries, includePending)
  const legacy = legacyCodes(d.entries)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const urls = await signedUrls([...new Set(d.occ.filter(o => o.page_id).map(o => pageById.get(o.page_id!)?.image_path).filter(Boolean) as string[])])
  const catLabel = (k: string) => { const c = CATEGORIES.find(x => x.key === k); return c ? tx(c.vn, c.en, L) : k }

  let r = 6, lastBand = ''
  for (const { section, items } of groupBySection(list)) {
    if (section.band !== lastBand) {
      lastBand = section.band
      ws.mergeCells(r, 1, r, 12)
      const bc = ws.getCell(r, 1); bc.value = bandTitle(section.band, L === 'both' ? 'both' : L)
      bc.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }
      ws.getRow(r).height = 20; r++
    }
    ws.mergeCells(r, 1, r, 12)
    const gc = ws.getCell(r, 1); gc.value = sectionTitle(section, L).replace('\n', ' / ')
    gc.font = { name: 'Arial', bold: true, size: 10 }; gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    ws.getRow(r).height = 18; r++
    let stt = 0
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const roomNames = locs.length
        ? locs.map(l => `${l.room.code} – ${tx(l.room.name_vn, l.room.name_en, L).replace('\n', ' / ')}${l.pages.length ? ` (${vn ? 'tr.' : 'p.'}${l.pages.join(', ')})` : ''}`).join('\n')
        : h('(chưa gán phòng)', '(no room assigned)')
      const cats = [...new Set(occ.map(o => o.category ?? e.category).filter(Boolean) as string[])]
      const sym = symbolOf(e, L, legacy)
      const spec = [tx(e.name_vn, e.name_en, L), tx(e.desc_vn || e.material_vn, e.desc_en || e.material_en, L),
        e.part_vn ? `${h('Bộ phận', 'Part')}: ${tx(e.part_vn, e.part_en, L)}` : '', e.composition ? `${h('Cấu tạo', 'Composition')}: ${e.composition}` : '',
        e.perf_vn ? `${h('Yêu cầu', 'Requirement')}: ${tx(e.perf_vn, e.perf_en, L)}` : '', e.standards ? `${h('Tiêu chuẩn', 'Standards')}: ${e.standards}` : ''].filter(Boolean).join('\n')
      const qtyTxt = e.qty != null ? `${e.qty}${e.unit ? ' ' + e.unit : ''}` : ''
      const remarks = [tx(e.note_vn, e.note_en, L), e.qty_flag !== 'ok' && e.qty_note ? `⚠ ${e.qty_note}` : '', e.status !== 'approved' ? `[${(L === 'en' ? STATUS_EN : STATUS_VN)[e.status]}]` : ''].filter(Boolean).join('\n')
      const brand = [e.brand ? (e.product_name ? `${e.brand} – ${e.product_name}` : e.brand) : '', e.origin].filter(Boolean).join('\n')
      const vals = [stt, sym, e.product_code || sym, cats.map(catLabel).join(' / '), roomNames, qtyTxt, '', '', spec, brand, e.product_url, remarks,
        '', '', '', '', '', '', '', '', (L === 'en' ? SOURCE_EN : SOURCE_VN)[e.source], (L === 'en' ? STATUS_EN : STATUS_VN)[e.status], e.qty_flag === 'ok' ? 'OK' : '⚠']
      const row = ws.getRow(r)
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1); c.value = (v ?? '') as any
        c.font = { name: 'Arial', size: 9, bold: i === 1, color: { argb: i === 1 ? BROWN : 'FF000000' } }
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: i < 3 || i === 5 ? 'center' : 'left' }; c.border = border
      })
      for (let i = 13; i <= 20; i++) row.getCell(i).border = border
      if (e.product_url) { row.getCell(11).value = { text: e.product_url, hyperlink: e.product_url }; row.getCell(11).font = { name: 'Arial', size: 8, color: { argb: 'FF1F4E9A' }, underline: true } }
      if (e.source === 'inferred') for (let i = 1; i <= 12; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E5' } }
      row.height = Math.max(120, 13 * (locs.length + 1), 12 * Math.ceil(spec.length / 48) + 12)
      const best = occ.filter(o => o.bbox && o.page_id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      if (best) {
        const p = pageById.get(best.page_id!)
        const u = p ? urls[p.image_path] : undefined
        if (u) {
          try {
            const c = await contextCanvas(u, best.bbox!, 520)
            const id = wb.addImage({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], extension: 'jpeg' })
            const scale = Math.min(236 / c.width, 150 / c.height)
            ws.addImage(id, { tl: { col: 6.05, row: r - 1 + 0.05 }, ext: { width: c.width * scale, height: c.height * scale } })
          } catch { /* bỏ qua ảnh lỗi */ }
        }
      } else {
        row.getCell(7).value = h('(không thể hiện trong phối cảnh)', '(not shown in render)')
        row.getCell(7).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF7F6000' } }
      }
      let mapB64: string | null = e.product_image_url ? await productImage(e.product_image_url) : null
      if (!mapB64 && e.color_hex) mapB64 = swatchBase64(e.color_hex)
      if (mapB64) {
        const id = wb.addImage({ base64: mapB64, extension: 'png' })
        ws.addImage(id, { tl: { col: 7.08, row: r - 1 + 0.08 }, ext: { width: 92, height: 72 } })
        if (!e.product_image_url && e.color_hex) { row.getCell(8).value = `\n\n\n\n\n${e.color_hex}`; row.getCell(8).font = { name: 'Arial', size: 7, color: { argb: 'FF666666' } } }
      }
      r++
    }
  }
  ws.pageSetup.printTitlesRow = '4:5'

  // Sheet 2: bảng hoàn thiện theo phòng
  const rs = wb.addWorksheet(L === 'en' ? 'Room finish' : 'Theo phòng')
  const cats = CATEGORIES
  rs.getRow(1).values = [h('Phòng', 'Room'), ...cats.map(c => tx(c.vn, c.en, L))]
  rs.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } })
  rs.getColumn(1).width = 30; cats.forEach((_, i) => (rs.getColumn(i + 2).width = 16))
  const entryById = new Map(list.map(e => [e.id, e]))
  d.rooms.forEach((rm, i) => {
    const row = rs.getRow(i + 2)
    row.getCell(1).value = `${rm.code} – ${tx(rm.name_vn, rm.name_en, L).replace('\n', ' / ')}`
    cats.forEach((c, j) => {
      const codes = [...new Set(d.occ.filter(o => o.room_id === rm.id && (o.category ?? entryById.get(o.entry_id)?.category) === c.key).map(o => { const e = entryById.get(o.entry_id); return e ? symbolOf(e, L, legacy) : '' }).filter(Boolean))]
      row.getCell(j + 2).value = codes.join(' · ')
    })
    row.eachCell(c => { c.alignment = { wrapText: true, vertical: 'top' }; c.border = border; c.font = { name: 'Arial', size: 9 } })
    row.height = 48
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `DMVL_${d.project.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${L === 'both' ? 'VN-EN' : L.toUpperCase()}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
export { groupOf }

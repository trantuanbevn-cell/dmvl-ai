import ExcelJS from 'exceljs'
import { GROUPS, groupOf, CATEGORIES } from './codes'
import { signedUrls } from './supabase'
import { cropCanvas, swatchBase64, loadImage } from './crop'
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

export async function exportExcel(d: ExportData, lang: 'vn' | 'en', includePending: boolean) {
  const vn = lang === 'vn'
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DMVL AI'
  const ws = wb.addWorksheet(vn ? 'DMVL' : 'Schedule', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 as any } })
  const cols = vn
    ? ['STT', 'Ký hiệu', 'Ảnh crop phối cảnh', 'Map vật liệu', 'Tên hạng mục / vật liệu', 'Bộ phận áp dụng', 'Phòng / khu vực', 'Mô tả & thông số kỹ thuật', 'Tính chất yêu cầu theo không gian', 'Tiêu chuẩn tham chiếu', 'Hãng', 'Mã sản phẩm', 'Link hãng', 'Xuất xứ', 'SL', 'ĐVT', 'Cờ SL', 'Nguồn', 'Trạng thái', 'Ghi chú TVTK', 'NT: Mã đề xuất', 'NT: Ảnh mẫu', 'NT: Thông số', 'NT: Xuất xứ', 'NT: Bảo hành', 'NT: Giải trình', 'Đánh giá TVTK', 'Đánh giá CĐT']
    : ['No.', 'Code', 'Render crop', 'Material sample', 'Item / material', 'Application', 'Room / area', 'Description & specification', 'Performance requirements', 'Standards', 'Manufacturer', 'Product code', 'Link', 'Origin', 'Qty', 'Unit', 'Qty flag', 'Source', 'Status', 'Designer remarks', 'Contractor: code', 'Contractor: sample', 'Contractor: spec', 'Contractor: origin', 'Warranty', 'Contractor: clarification', 'Designer review', 'Client review']
  const widths = [5, 9, 26, 15, 22, 18, 20, 42, 32, 18, 16, 16, 22, 10, 7, 7, 14, 9, 12, 30, 12, 12, 14, 10, 9, 16, 12, 12]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))

  ws.mergeCells(1, 1, 1, cols.length)
  ws.getCell(1, 1).value = vn ? 'BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN & ĐỒ NỘI THẤT' : 'FINISHES & FF&E MATERIAL SCHEDULE'
  ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: BROWN } }
  ws.mergeCells(2, 1, 2, cols.length)
  ws.getCell(2, 1).value = `${vn ? 'DỰ ÁN' : 'PROJECT'}: ${d.project.name}${d.project.location ? ' · ' + (vn ? 'ĐỊA ĐIỂM' : 'LOCATION') + ': ' + d.project.location : ''}`
  ws.getCell(2, 1).font = { name: 'Arial', size: 10, italic: true }
  const bands: [number, number, string][] = [[1, 20, vn ? 'THÔNG TIN TƯ VẤN THIẾT KẾ' : 'DESIGNER SPECIFICATION'], [21, 26, vn ? 'NHÀ THẦU ĐỀ XUẤT' : 'CONTRACTOR SUBMITTAL'], [27, 28, vn ? 'ĐÁNH GIÁ' : 'REVIEW']]
  for (const [a, b, t] of bands) {
    ws.mergeCells(4, a, 4, b); const c = ws.getCell(4, a); c.value = t
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: BROWN } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAND } }; c.alignment = { horizontal: 'center' }
  }
  const hr = ws.getRow(5)
  cols.forEach((t, i) => {
    const c = hr.getCell(i + 1); c.value = t
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
  })
  hr.height = 36
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }]

  const list = filterEntries(d.entries, includePending)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const roomById = new Map(d.rooms.map(r => [r.id, r]))
  const urls = await signedUrls([...new Set(d.occ.filter(o => o.page_id).map(o => pageById.get(o.page_id!)?.image_path).filter(Boolean) as string[])])

  let r = 6, stt = 0
  for (const g of GROUPS) {
    const items = list.filter(e => e.group_code === g.code).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    if (!items.length) continue
    ws.mergeCells(r, 1, r, cols.length)
    const gc = ws.getCell(r, 1); gc.value = `${g.code} · ${(vn ? g.vn : g.en).toUpperCase()}   (${g.csi})`
    gc.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
    ws.getRow(r).height = 18; r++
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o => o.entry_id === e.id)
      const roomNames = [...new Set(occ.map(o => o.room_id).filter(Boolean))].map(id => { const rm = roomById.get(id!); return rm ? `${rm.code} – ${vn ? rm.name_vn : rm.name_en || rm.name_vn}` : '' }).join('\n')
      const flag = e.qty_flag === 'ok' ? `✓ ${e.qty_note ?? ''}` : `⚠ ${e.qty_note ?? ''}`
      const vals = [stt, e.code, '', '', vn ? e.name_vn : e.name_en || e.name_vn, vn ? e.part_vn : e.part_en || e.part_vn, roomNames,
        [vn ? e.desc_vn || e.material_vn : e.desc_en || e.material_en || e.desc_vn, e.composition ? (vn ? 'Cấu tạo: ' : 'Composition: ') + e.composition : ''].filter(Boolean).join('\n'),
        vn ? e.perf_vn : e.perf_en || e.perf_vn, e.standards, e.brand, [e.product_code, e.product_name].filter(Boolean).join(' – '), e.product_url, e.origin,
        e.qty, e.unit, flag, (vn ? SOURCE_VN : SOURCE_EN)[e.source], (vn ? STATUS_VN : STATUS_EN)[e.status], vn ? e.note_vn : e.note_en || e.note_vn]
      const row = ws.getRow(r)
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1); c.value = (v ?? '') as any
        c.font = { name: 'Arial', size: 9, bold: i === 1, color: { argb: i === 1 ? BROWN : 'FF000000' } }
        c.alignment = { vertical: 'top', wrapText: true, horizontal: i < 2 ? 'center' : 'left' }; c.border = border
      })
      for (let i = 21; i <= cols.length; i++) row.getCell(i).border = border
      if (e.product_url) { row.getCell(13).value = { text: e.product_url, hyperlink: e.product_url }; row.getCell(13).font = { name: 'Arial', size: 8, color: { argb: 'FF1F4E9A' }, underline: true } }
      if (e.source === 'inferred') for (let i = 5; i <= 20; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E5' } }
      row.getCell(17).font = { name: 'Arial', size: 9, bold: true, color: { argb: e.qty_flag === 'ok' ? 'FF2E7D32' : 'FFC00000' } }
      row.height = 92
      // ảnh crop
      const best = occ.filter(o => o.bbox && o.page_id).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
      if (best) {
        const p = pageById.get(best.page_id!)
        const u = p ? urls[p.image_path] : undefined
        if (u) {
          try {
            const c = await cropCanvas(u, best.bbox!, 360)
            const id = wb.addImage({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], extension: 'jpeg' })
            const scale = Math.min(180 / c.width, 116 / c.height)
            ws.addImage(id, { tl: { col: 2.05, row: r - 1 + 0.05 }, ext: { width: c.width * scale, height: c.height * scale } })
          } catch { /* bỏ qua ảnh lỗi */ }
        }
      } else {
        row.getCell(3).value = vn ? '(không thể hiện trong phối cảnh)' : '(not shown in render)'
        row.getCell(3).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF7F6000' } }
      }
      // map vật liệu: ảnh sản phẩm nếu tải được, nếu không thì ô màu
      let mapB64: string | null = e.product_image_url ? await productImage(e.product_image_url) : null
      if (!mapB64 && e.color_hex) mapB64 = swatchBase64(e.color_hex)
      if (mapB64) {
        const id = wb.addImage({ base64: mapB64, extension: 'png' })
        ws.addImage(id, { tl: { col: 3.08, row: r - 1 + 0.08 }, ext: { width: 92, height: 72 } })
        if (!e.product_image_url && e.color_hex) { row.getCell(4).value = `\n\n\n\n\n${e.color_hex}`; row.getCell(4).font = { name: 'Arial', size: 7, color: { argb: 'FF666666' } } }
      }
      r++
    }
  }
  ws.pageSetup.printTitlesRow = '4:5'

  // Sheet 2: bảng hoàn thiện theo phòng
  const rs = wb.addWorksheet(vn ? 'Theo phòng' : 'Room finish')
  const cats = CATEGORIES
  rs.getRow(1).values = [vn ? 'Phòng' : 'Room', ...cats.map(c => (vn ? c.vn : c.en))]
  rs.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } })
  rs.getColumn(1).width = 30; cats.forEach((_, i) => (rs.getColumn(i + 2).width = 16))
  const entryById = new Map(list.map(e => [e.id, e]))
  d.rooms.forEach((rm, i) => {
    const row = rs.getRow(i + 2)
    row.getCell(1).value = `${rm.code} – ${vn ? rm.name_vn : rm.name_en || rm.name_vn}`
    cats.forEach((c, j) => {
      const codes = [...new Set(d.occ.filter(o => o.room_id === rm.id && (o.category ?? entryById.get(o.entry_id)?.category) === c.key).map(o => entryById.get(o.entry_id)?.code).filter(Boolean))]
      row.getCell(j + 2).value = codes.join(' · ')
    })
    row.eachCell(c => { c.alignment = { wrapText: true, vertical: 'top' }; c.border = border; c.font = { name: 'Arial', size: 9 } })
    row.height = 48
  })

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `DMVL_${d.project.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${vn ? 'VN' : 'EN'}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
export { groupOf }

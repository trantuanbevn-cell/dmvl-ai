import ExcelJS from 'exceljs'
import { groupOf, CATEGORIES } from './codes'
import { GROUPS } from './codes'
import { intlPrefix, groupBySection, sectionTitle, bandTitle, exportSymbols, symbolOf, tx, planSheets, type Lang, type ExportOpts, type Section } from './sections'
import { signedUrls } from './supabase'
import { viewCanvas, regionCanvas, swatchBase64, loadImage } from './crop'
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

type Col = { key: string; head: string; w: number; band: 'content' | 'ref' | 'ctr' | 'rev' | 'quote' | 'int' }
type Grp = { section: Section; items: Entry[] }
type Ctx = { wb: ExcelJS.Workbook; d: ExportData; o: ExportOpts; sym: ReturnType<typeof exportSymbols>; urls: Record<string, string>; pageById: Map<string, Page>; h: (a: string, b: string) => string }

const BANDCOL: Record<Col['band'], string> = { content: 'FFB22A2A', ref: 'FFB22A2A', ctr: 'FFB22A2A', rev: 'FFB22A2A', quote: 'FF2E6B3A', int: 'FF7F7F7F' }

function columns(o: ExportOpts, h: Ctx['h']): Col[] {
  const c: Col[] = [
    { key: 'stt', head: h('STT', 'No.'), w: 5, band: 'content' }, { key: 'sym', head: h('KÍ HIỆU BẢN VẼ', 'DRAWING CODE'), w: 13, band: 'content' }, { key: 'mavl', head: h('KÍ HIỆU VL', 'MATERIAL CODE'), w: 15, band: 'content' },
    { key: 'cat', head: h('Hạng mục', 'Item'), w: 13, band: 'content' }, { key: 'loc', head: h('Vị trí', 'Location'), w: 28, band: 'content' },
    { key: 'render', head: h('Hình ảnh phối cảnh', 'Render image'), w: 34, band: 'content' },
    { key: 'spec', head: h('Thông số kỹ thuật', 'Technical specification'), w: 46, band: 'ref' },
    { key: 'brand', head: h('Xuất xứ/ Thương hiệu', 'Origin / Brand'), w: 22, band: 'ref' }, { key: 'sample', head: h('Hình ảnh vật liệu', 'Material image'), w: 16, band: 'ref' },
    { key: 'link', head: h('Ghi chú', 'Remarks'), w: 26, band: 'ref' }, { key: 'note', head: h('Ghi chú', 'Remarks'), w: 26, band: 'ref' },
    { key: 'c_code', head: h('Mã VL', 'Material code'), w: 14, band: 'ctr' }, { key: 'c_img', head: h('Hình ảnh', 'Image'), w: 14, band: 'ctr' }, { key: 'c_spec', head: h('Thông số kỹ thuật', 'Specification'), w: 26, band: 'ctr' },
    { key: 'c_brand', head: h('Xuất xứ / Thương hiệu', 'Origin / Brand'), w: 16, band: 'ctr' }, { key: 'c_war', head: h('Bảo hành', 'Warranty'), w: 10, band: 'ctr' }, { key: 'c_note', head: h('Ghi chú / Giải trình làm rõ của Nhà thầu', 'Remarks / Contractor clarification'), w: 22, band: 'ctr' },
    { key: 'rev1', head: h('Đánh giá của P.KHKT', 'Technical dept. review'), w: 14, band: 'rev' }, { key: 'rev2', head: h('Đánh giá của K.QHTK', 'Design dept. review'), w: 14, band: 'rev' },
  ]
  if (o.quote) c.push(
    { key: 'q_qty', head: h('Số lượng', 'Quantity'), w: 10, band: 'quote' }, { key: 'q_unit', head: h('ĐVT', 'Unit'), w: 8, band: 'quote' },
    { key: 'q_price', head: h('Đơn giá (VNĐ)', 'Unit price (VND)'), w: 16, band: 'quote' }, { key: 'q_total', head: h('Thành tiền (VNĐ)', 'Amount (VND)'), w: 18, band: 'quote' })
  c.push({ key: 'i_src', head: h('Nguồn', 'Source'), w: 9, band: 'int' }, { key: 'i_st', head: h('Trạng thái', 'Status'), w: 11, band: 'int' }, { key: 'i_flag', head: h('Cờ số lượng', 'Qty flag'), w: 14, band: 'int' })
  return c
}

async function fillSheet(ws: ExcelJS.Worksheet, groups: Grp[], x: Ctx, title: string) {
  const { wb, d, o, sym, urls, pageById, h } = x, L = o.lang, vn = L !== 'en'
  const cols = columns(o, h), ci = (k: string) => cols.findIndex(c => c.key === k) + 1
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.w))
  const wide = ci('note')
  ws.mergeCells(1, 1, 1, wide); ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true, color: { argb: BROWN } }
  ws.mergeCells(2, 1, 2, wide); ws.getCell(2, 1).value = `${h('DỰ ÁN', 'PROJECT')}: ${d.project.name}`; ws.getCell(2, 1).font = { name: 'Arial', size: 10, bold: true }
  ws.mergeCells(3, 1, 3, wide); ws.getCell(3, 1).value = `${h('ĐỊA ĐIỂM', 'LOCATION')}: ${d.project.location ?? ''}`; ws.getCell(3, 1).font = { name: 'Arial', size: 10, italic: true }
  const bandHead: Record<Col['band'], string> = { content: h('NỘI DUNG', 'CONTENT'), ref: h('VẬT LIỆU ĐỊNH HƯỚNG', 'DESIGNER-SPECIFIED MATERIAL'), ctr: h('THÔNG SỐ HỢP ĐỒNG NHÀ THẦU ĐỀ XUẤT', 'CONTRACTOR SUBMITTAL'), rev: h('ĐÁNH GIÁ', 'REVIEW'), quote: h('BÁO GIÁ', 'PRICING'), int: h('NỘI BỘ (không in)', 'INTERNAL (do not print)') }
  for (const b of ['content', 'ref', 'ctr', 'rev', 'quote', 'int'] as const) {
    const idx = cols.map((c, i) => (c.band === b ? i + 1 : 0)).filter(Boolean); if (!idx.length) continue
    const a = idx[0], z = idx[idx.length - 1]
    if (z > a) ws.mergeCells(4, a, 4, z)
    const c = ws.getCell(4, a); c.value = bandHead[b]
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDCOL[b] } }; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = border
  }
  const hr = ws.getRow(5)
  cols.forEach((col, i) => {
    const c = hr.getCell(i + 1); c.value = col.head
    c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDCOL[col.band] } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
  })
  hr.height = 34
  if (ci('note') === ci('link') + 1) ws.mergeCells(5, ci('link'), 5, ci('note')) // “Ghi chú” trải trên 2 ô: link + nội dung, như file mẫu
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }]
  const catLabel = (k: string) => { const c = CATEGORIES.find(z => z.key === k); return c ? tx(c.vn, c.en, L) : k }

  let r = 6, lastBand = '', firstData = 0, lastData = 0
  for (const { section, items } of groups) {
    if (section.band !== lastBand) {
      lastBand = section.band
      ws.mergeCells(r, 1, r, wide)
      const bc = ws.getCell(r, 1); bc.value = bandTitle(section.band, L)
      bc.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }
      ws.getRow(r).height = 20; r++
    }
    ws.mergeCells(r, 1, r, wide)
    const gc = ws.getCell(r, 1); gc.value = sectionTitle(section, L).replace('\n', ' / ')
    gc.font = { name: 'Arial', bold: true, size: 10 }; gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    ws.getRow(r).height = 18; r++
    let stt = 0
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o2 => o2.entry_id === e.id)
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const roomNames = locs.length
        ? locs.map(l => tx(l.room.name_vn, l.room.name_en, L).replace('\n', ' / ')).join('\n')
        : h('(chưa gán phòng)', '(no room assigned)')
      const cats = [...new Set(occ.map(o2 => o2.category ?? e.category).filter(Boolean) as string[])]
      const sy = symbolOf(e, L, sym.legacy, sym.en)
      const spec = [tx(e.name_vn, e.name_en, L), tx(e.desc_vn || e.material_vn, e.desc_en || e.material_en, L),
        e.part_vn ? `${h('Bộ phận', 'Part')}: ${tx(e.part_vn, e.part_en, L)}` : '', e.composition ? `${h('Cấu tạo', 'Composition')}: ${e.composition}` : ''].filter(Boolean).join('\n')
      const remarks = [tx(e.note_vn, e.note_en, L), e.status !== 'approved' ? `[${(L === 'en' ? STATUS_EN : STATUS_VN)[e.status]}]` : ''].filter(Boolean).join('\n')
      const brand = [e.brand ? (e.product_name ? `${e.brand} – ${e.product_name}` : e.brand) : '', e.origin].filter(Boolean).join('\n')
      const v: Record<string, any> = { stt, sym: sy, mavl: e.product_code || sy, cat: cats.map(catLabel).join(' / '), loc: roomNames, qty: e.qty != null ? `${e.qty}${e.unit ? ' ' + e.unit : ''}` : '', spec, brand, link: e.product_url, note: remarks,
        q_qty: e.qty, q_unit: e.unit, i_src: (L === 'en' ? SOURCE_EN : SOURCE_VN)[e.source], i_st: (L === 'en' ? STATUS_EN : STATUS_VN)[e.status], i_flag: e.qty_flag === 'ok' ? 'OK' : '⚠' }
      const row = ws.getRow(r)
      cols.forEach((col, i) => {
        const c = row.getCell(i + 1); c.value = (v[col.key] ?? '') as any
        c.font = { name: 'Arial', size: 9, bold: col.key === 'sym', color: { argb: col.key === 'sym' ? BROWN : 'FF000000' } }
        c.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' }; c.border = border
      })
      if (o.quote) {
        const q = ci('q_qty'), p = ci('q_price'), t = ci('q_total')
        const col = (n: number) => ws.getColumn(n).letter
        row.getCell(t).value = { formula: `IF(AND(ISNUMBER(${col(q)}${r}),ISNUMBER(${col(p)}${r})),${col(q)}${r}*${col(p)}${r},"")` } as any
        row.getCell(p).numFmt = '#,##0'; row.getCell(t).numFmt = '#,##0'
        row.getCell(p).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF4EA' } }
        if (!firstData) firstData = r; lastData = r
      }
      if (e.product_url) { row.getCell(ci('link')).value = { text: e.product_url, hyperlink: e.product_url }; row.getCell(ci('link')).font = { name: 'Arial', size: 8, color: { argb: 'FF1F4E9A' }, underline: true } }
      if (e.source === 'inferred') for (let i = 1; i <= wide; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E5' } }
      row.height = Math.max(120, 13 * (locs.length + 1), 12 * Math.ceil(spec.length / 48) + 12)
      const best = occ.filter(o2 => o2.bbox && o2.page_id).sort((a2, b2) => (b2.confidence ?? 0) - (a2.confidence ?? 0))[0]
      const rc = ci('render'), sc = ci('sample')
      if (best) {
        const pg = pageById.get(best.page_id!)
        const u = pg ? urls[pg.image_path] : undefined
        if (u) {
          try {
            const c = await viewCanvas(u, best.bbox!, best.view, best.view?.img ? urls[best.view.img] : undefined, 520)
            const id = wb.addImage({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], extension: 'jpeg' })
            const scale = Math.min(236 / c.width, 150 / c.height)
            ws.addImage(id, { tl: { col: rc - 1 + 0.05, row: r - 1 + 0.05 }, ext: { width: c.width * scale, height: c.height * scale } })
          } catch { /* bỏ qua ảnh lỗi */ }
        }
      } else {
        row.getCell(rc).value = h('(không thể hiện trong phối cảnh)', '(not shown in render)')
        row.getCell(rc).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF7F6000' } }
      }
      let mapB64: string | null = null
      const mvSrc = e.mat_view?.img ? urls[e.mat_view.img] : e.product_image_url
      if (mvSrc && (e.mat_view?.img || e.mat_view?.region)) { try { mapB64 = (await regionCanvas(mvSrc, e.mat_view?.region, 300)).toDataURL('image/png').split(',')[1] } catch { /* ảnh ngoài bị chặn → dùng ảnh gốc */ } }
      if (!mapB64) mapB64 = e.product_image_url ? await productImage(e.product_image_url) : null
      if (!mapB64 && e.color_hex) mapB64 = swatchBase64(e.color_hex)
      if (mapB64) {
        const id = wb.addImage({ base64: mapB64, extension: 'png' })
        ws.addImage(id, { tl: { col: sc - 1 + 0.08, row: r - 1 + 0.08 }, ext: { width: 92, height: 72 } })
        if (!e.product_image_url && e.color_hex) { row.getCell(sc).value = `\n\n\n\n\n${e.color_hex}`; row.getCell(sc).font = { name: 'Arial', size: 7, color: { argb: 'FF666666' } } }
      }
      r++
    }
  }
  if (o.quote && firstData) {
    const t = ci('q_total'), col = ws.getColumn(t).letter
    ws.mergeCells(r, 1, r, t - 1)
    const lab = ws.getCell(r, 1); lab.value = h('TỔNG CỘNG (chưa VAT)', 'TOTAL (excl. VAT)'); lab.font = { name: 'Arial', bold: true, size: 10 }; lab.alignment = { horizontal: 'right' }
    const tc = ws.getCell(r, t); tc.value = { formula: `SUM(${col}${firstData}:${col}${lastData})` } as any; tc.numFmt = '#,##0'; tc.font = { name: 'Arial', bold: true, size: 10 }; tc.border = border
  }
  ws.pageSetup.printTitlesRow = '4:5'
}

export async function exportExcel(d: ExportData, o: ExportOpts) {
  const L = o.lang
  const h = (a: string, b: string) => (L === 'vn' ? a : L === 'en' ? b : `${a}\n${b}`)
  const wb = new ExcelJS.Workbook(); wb.creator = 'DMVL AI'
  // 1) Gom TOÀN BỘ phòng: mỗi mã chỉ một dòng, vị trí liệt kê đủ các phòng; ký hiệu đồng bộ trong cả file
  const list = filterEntries(d.entries, o.includePending)
  const sym = exportSymbols(list, o.renumber)
  const pageById = new Map(d.pages.map(p => [p.id, p]))
  const urls = await signedUrls([...new Set([...d.occ.filter(x => x.page_id).map(x => pageById.get(x.page_id!)?.image_path), ...d.occ.map(x => x.view?.img), ...d.entries.map(x => x.mat_view?.img)].filter(Boolean) as string[])])
  const ctx: Ctx = { wb, d, o, sym, urls, pageById, h }
  const sheets = planSheets(groupBySection(list), o)
  const title = h('BẢNG DANH MỤC VẬT LIỆU HOÀN THIỆN', 'FINISHES & FF&E MATERIAL SCHEDULE')
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 8 as any } })
    await fillSheet(ws, sh.groups, ctx, sheets.length > 1 && sh.groups.length === 1 ? `${title} – ${sectionTitle(sh.groups[0].section, L).replace('\n', ' / ')}` : title)
  }
  // 2) Bảng hoàn thiện theo phòng (đối chiếu ngược từ tổng hợp về từng phòng)
  if (o.roomSheet) {
    const rs = wb.addWorksheet(L === 'en' ? 'Room finish' : 'Theo phòng')
    const cats = CATEGORIES
    rs.getRow(1).values = [h('Phòng', 'Room'), ...cats.map(c => tx(c.vn, c.en, L))]
    rs.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } })
    rs.getColumn(1).width = 30; cats.forEach((_, i) => (rs.getColumn(i + 2).width = 16))
    const entryById = new Map(list.map(e => [e.id, e]))
    d.rooms.forEach((rm, i) => {
      const row = rs.getRow(i + 2)
      row.getCell(1).value = tx(rm.name_vn, rm.name_en, L).replace('\n', ' / ')
      cats.forEach((c, j) => {
        const codes = [...new Set(d.occ.filter(x => x.room_id === rm.id && (x.category ?? entryById.get(x.entry_id)?.category) === c.key).map(x => { const e = entryById.get(x.entry_id); return e ? symbolOf(e, L, sym.legacy, sym.en) : '' }).filter(Boolean))]
        row.getCell(j + 2).value = codes.join(' · ')
      })
      row.eachCell(c => { c.alignment = { wrapText: true, vertical: 'top' }; c.border = border; c.font = { name: 'Arial', size: 9 } })
      row.height = 48
    })
  }
  // 3) Chú giải ký hiệu (chuẩn viết tắt tiếng Anh) – chỉ các nhóm có trong file
  {
    const used = GROUPS.filter(g => list.some(e => e.group_code === g.code))
    const ls = wb.addWorksheet(L === 'en' ? 'Legend' : 'Chú giải ký hiệu')
    ls.getRow(1).values = [h('KÍ HIỆU', 'CODE'), h('Tên tiếng Anh', 'English name'), h('Tên tiếng Việt', 'Vietnamese name')]
    ls.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } })
    ls.getColumn(1).width = 12; ls.getColumn(2).width = 50; ls.getColumn(3).width = 50
    used.forEach((g, i) => { const r = ls.getRow(i + 2); r.values = [intlPrefix(g.code), g.en, g.vn]; r.eachCell(c => { c.font = { name: 'Arial', size: 9 }; c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }; c.border = border }); r.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: BROWN } } })
  }
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `DMVL_${d.project.name.replace(/[^\p{L}\p{N}]+/gu, '_')}_${L === 'both' ? 'VN-EN' : L.toUpperCase()}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
export { groupOf }

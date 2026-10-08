import ExcelJS from 'exceljs'
import { groupOf, CATEGORIES } from './codes'
import { GROUPS } from './codes'
import { PREFIXES, groupBySection, sectionTitle, bandTitle, exportSymbols, symbolOf, tx, planSheets, type Lang, type ExportOpts, type Section } from './sections'
import { signedUrls } from './supabase'
import { matMontage, extraPaths } from './matImages'
import { viewCanvas, regionCanvas, swatchBase64, loadImage } from './crop'
import { locationsOf, locationLines } from './locations'
import { entryCells, setLines, splitBoth, wrapCount, fitWidth, hostOf, pair, type Seg, type EntryCells } from './biText'
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
    { key: 'stt', head: h('STT', 'No.'), w: 5, band: 'content' }, { key: 'sym', head: h('KÍ HIỆU BẢN VẼ', 'DRAWING CODE'), w: 16, band: 'content' }, { key: 'mavl', head: h('KÍ HIỆU VL', 'MATERIAL CODE'), w: 17, band: 'content' },
    { key: 'cat', head: h('Hạng mục', 'Item'), w: 13, band: 'content' }, { key: 'loc', head: h('Vị trí', 'Location'), w: 28, band: 'content' },
    { key: 'render', head: h('Hình ảnh phối cảnh', 'Render image'), w: 44, band: 'content' },
    { key: 'spec', head: h('Thông số kỹ thuật', 'Technical specification'), w: 46, band: 'ref' },
    { key: 'brand', head: h('Xuất xứ/ Thương hiệu', 'Origin / Brand'), w: 22, band: 'ref' }, { key: 'sample', head: h('Hình ảnh vật liệu', 'Material image'), w: 26, band: 'ref' },
    { key: 'note', head: h('Ghi chú', 'Remarks'), w: 26, band: 'ref' },
  ]
  if (o.quote) c.push(
    { key: 'q_qty', head: h('Số lượng', 'Quantity'), w: 10, band: 'quote' }, { key: 'q_unit', head: h('ĐVT', 'Unit'), w: 8, band: 'quote' },
    { key: 'q_price', head: h('Đơn giá (VNĐ)', 'Unit price (VND)'), w: 16, band: 'quote' }, { key: 'q_total', head: h('Thành tiền (VNĐ)', 'Amount (VND)'), w: 18, band: 'quote' })
  return c
}

async function fillSheet(ws: ExcelJS.Worksheet, groups: Grp[], x: Ctx, title: string) {
  const { wb, d, o, sym, urls, pageById, h } = x, L = o.lang, vn = L !== 'en'
  const both = L === 'both'
  const cols = columns(o, h), ci = (k: string) => cols.findIndex(c => c.key === k) + 1
  // Dàn chữ từng mã trước để chọn bề rộng cột vừa đủ: mỗi dòng VN / EN gọn trong một dòng
  const cells = new Map<string, EntryCells>()
  for (const g of groups) for (const e of g.items) {
    const o2 = d.occ.filter(z => z.entry_id === e.id)
    cells.set(e.id, entryCells(e, L, [...new Set(o2.map(z => z.category ?? e.category).filter(Boolean) as string[])], locationsOf(e.id, d.occ, d.rooms, d.pages)))
  }
  const LIM: Record<string, [number, number]> = { cat: [13, 26], loc: [30, 46], spec: [48, 80], brand: [22, 40], note: [26, 44] }
  for (const k of Object.keys(LIM)) { const c = cols.find(z => z.key === k); if (c) c.w = fitWidth([...cells.values()].map(v => (v as any)[k] as Seg[]), LIM[k][0], LIM[k][1]) }
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.w))
  const wide = ci('note')
  const T = (cell: any, lines: Seg[], size: number, color: string, bold = false) => setLines(cell, lines, size, color, both, bold)
  ws.mergeCells(1, 1, 1, wide); T(ws.getCell(1, 1), splitBoth(title, both), 14, BROWN, true); ws.getCell(1, 1).alignment = { wrapText: true, vertical: 'middle' }
  ws.mergeCells(2, 1, 2, wide); T(ws.getCell(2, 1), L === 'vn' ? [{ t: `DỰ ÁN: ${d.project.name}`, k: 'n' }] : L === 'en' ? [{ t: `PROJECT: ${d.project.name}`, k: 'n' }] : [{ t: `DỰ ÁN: ${d.project.name}`, k: 'vn' }, { t: `PROJECT: ${d.project.name}`, k: 'en' }], 10, 'FF000000', true)
  ws.mergeCells(3, 1, 3, wide); T(ws.getCell(3, 1), L === 'vn' ? [{ t: `ĐỊA ĐIỂM: ${d.project.location ?? ''}`, k: 'n' }] : L === 'en' ? [{ t: `LOCATION: ${d.project.location ?? ''}`, k: 'n' }] : [{ t: `ĐỊA ĐIỂM: ${d.project.location ?? ''}`, k: 'vn' }, { t: `LOCATION: ${d.project.location ?? ''}`, k: 'en' }], 10, 'FF000000')
  for (const n of [1, 2, 3]) { ws.getCell(n, 1).alignment = { wrapText: true, vertical: 'middle' }; ws.getRow(n).height = both ? (n === 1 ? 46 : 30) : n === 1 ? 24 : 16 }
  const bandHead: Record<Col['band'], string> = { content: h('NỘI DUNG', 'CONTENT'), ref: h('VẬT LIỆU ĐỊNH HƯỚNG', 'DESIGNER-SPECIFIED MATERIAL'), ctr: h('THÔNG SỐ HỢP ĐỒNG NHÀ THẦU ĐỀ XUẤT', 'CONTRACTOR SUBMITTAL'), rev: h('ĐÁNH GIÁ', 'REVIEW'), quote: h('BÁO GIÁ', 'PRICING'), int: h('NỘI BỘ (không in)', 'INTERNAL (do not print)') }
  for (const b of ['content', 'ref', 'ctr', 'rev', 'quote', 'int'] as const) {
    const idx = cols.map((c, i) => (c.band === b ? i + 1 : 0)).filter(Boolean); if (!idx.length) continue
    const a = idx[0], z = idx[idx.length - 1]
    if (z > a) ws.mergeCells(4, a, 4, z)
    const c = ws.getCell(4, a); T(c, splitBoth(bandHead[b], both), 9, 'FFFFFFFF', true)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDCOL[b] } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
  }
  ws.getRow(4).height = both ? 30 : 18
  const hr = ws.getRow(5)
  cols.forEach((col, i) => {
    const c = hr.getCell(i + 1); T(c, splitBoth(col.head, both), 9, 'FFFFFFFF', true)
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDCOL[col.band] } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = border
  })
  hr.height = both ? 56 : 34
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }]
  const catLabel = (k: string) => { const c = CATEGORIES.find(z => z.key === k); return c ? tx(c.vn, c.en, L) : k }

  let r = 6, lastBand = '', firstData = 0, lastData = 0
  for (const { section, items } of groups) {
    if (section.band !== lastBand) {
      lastBand = section.band
      ws.mergeCells(r, 1, r, wide)
      const bc = ws.getCell(r, 1); T(bc, pair(bandTitle(section.band, 'vn'), bandTitle(section.band, 'en'), L), 10, 'FFFFFFFF', true); bc.alignment = { vertical: 'middle', wrapText: true }; bc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }
      ws.getRow(r).height = both ? 34 : 20; r++
    }
    ws.mergeCells(r, 1, r, wide)
    const gc = ws.getCell(r, 1); T(gc, pair(sectionTitle(section, 'vn').replace('\n', ' / '), sectionTitle(section, 'en').replace('\n', ' / '), L), 10, 'FF000000', true); gc.alignment = { vertical: 'middle', wrapText: true }; gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    ws.getRow(r).height = both ? 32 : 18; r++
    let stt = 0
    for (const e of items) {
      stt++
      const occ = d.occ.filter(o2 => o2.entry_id === e.id)
      const locs = locationsOf(e.id, d.occ, d.rooms, d.pages)
      const cl = cells.get(e.id)!
      const sy = symbolOf(e, L, sym.legacy, sym.en)
      const v: Record<string, any> = { stt, sym: sy, mavl: e.product_code || sy, qty: e.qty != null ? `${e.qty}${e.unit ? ' ' + e.unit : ''}` : '',
        q_qty: e.qty, q_unit: e.unit, i_src: (L === 'en' ? SOURCE_EN : SOURCE_VN)[e.source], i_st: (L === 'en' ? STATUS_EN : STATUS_VN)[e.status], i_flag: e.qty_flag === 'ok' ? 'OK' : '⚠' }
      const row = ws.getRow(r)
      cols.forEach((col, i) => {
        const c = row.getCell(i + 1)
        if (col.key in cl) T(c, (cl as any)[col.key] as Seg[], 9, 'FF000000')
        else { c.value = (v[col.key] ?? '') as any; c.font = { name: 'Arial', size: 9, bold: col.key === 'sym', color: { argb: col.key === 'sym' ? BROWN : 'FF000000' } } }
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
      if (e.product_url) { const lc = row.getCell(ci('sample')); lc.value = { text: '🔗 ' + hostOf(e.product_url), hyperlink: e.product_url }; lc.font = { name: 'Arial', size: 8, color: { argb: 'FF1F4E9A' }, underline: true }; lc.alignment = { vertical: 'bottom', horizontal: 'left', wrapText: false, shrinkToFit: true } }  // link sản phẩm nằm ngay dưới hình vật liệu
      if (e.source === 'inferred') for (let i = 1; i <= wide; i++) row.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E5' } }
      const wOf = (k: string) => cols[ci(k) - 1].w
      row.height = Math.max(150, ...(['cat', 'loc', 'spec', 'brand', 'note'] as const).map(k => wrapCount(cl[k], wOf(k)) * 12.5 + 8))
      const best = occ.filter(o2 => o2.bbox && (o2.page_id || o2.view?.img)).sort((a2, b2) => (b2.confidence ?? 0) - (a2.confidence ?? 0))[0]
      const rc = ci('render'), sc = ci('sample')
      if (best) {
        const pg = best.page_id ? pageById.get(best.page_id) : undefined
        const u = pg ? urls[pg.image_path] : best.view?.img ? urls[best.view.img] : undefined
        if (u) {
          try {
            const c = await viewCanvas(u, best.bbox!, best.view, best.view?.img ? urls[best.view.img] : undefined, 900, true)
            const id = wb.addImage({ base64: c.toDataURL('image/jpeg', 0.93).split(',')[1], extension: 'jpeg' })
            const scale = Math.min(300 / c.width, 190 / c.height)
            ws.addImage(id, { tl: { col: rc - 1 + 0.05, row: r - 1 + 0.05 }, ext: { width: c.width * scale, height: c.height * scale } })
          } catch { /* bỏ qua ảnh lỗi */ }
        }
      } else {
        row.getCell(rc).value = h('(không thể hiện trong phối cảnh)', '(not shown in render)')
        row.getCell(rc).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF7F6000' } }
      }
      let mapB64: string | null = null
      try { const mm = await matMontage(e, urls); if (mm) mapB64 = mm.split(',')[1] } catch { /* */ }
      const mvSrc = e.mat_view?.img ? urls[e.mat_view.img] : e.product_image_url
      if (!mapB64 && mvSrc && (e.mat_view?.img || e.mat_view?.region)) { try { mapB64 = (await regionCanvas(mvSrc, e.mat_view?.region, 300)).toDataURL('image/png').split(',')[1] } catch { /* ảnh ngoài bị chặn → dùng ảnh gốc */ } }
      if (!mapB64) mapB64 = e.product_image_url ? await productImage(e.product_image_url) : null
      if (!mapB64 && e.color_hex) mapB64 = swatchBase64(e.color_hex)
      if (mapB64) {
        const id = wb.addImage({ base64: mapB64, extension: 'png' })
        ws.addImage(id, { tl: { col: sc - 1 + 0.08, row: r - 1 + 0.08 }, ext: { width: 120, height: 92 } })
        if (!e.product_image_url && e.color_hex && !e.product_url) { row.getCell(sc).value = `\n\n\n\n\n${e.color_hex}`; row.getCell(sc).font = { name: 'Arial', size: 7, color: { argb: 'FF666666' } } }
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
  const urls = await signedUrls([...new Set([...d.occ.filter(x => x.page_id).map(x => pageById.get(x.page_id!)?.image_path), ...d.occ.map(x => x.view?.img), ...d.entries.map(x => x.mat_view?.img), ...d.entries.flatMap(x => extraPaths(x))].filter(Boolean) as string[])])
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
    const used = PREFIXES.filter(p => list.some(e => p.groups.includes(e.group_code)))
    const ls = wb.addWorksheet(L === 'en' ? 'Legend' : 'Chú giải ký hiệu')
    ls.getRow(1).values = [h('KÍ HIỆU', 'CODE'), h('Tên tiếng Anh', 'English name'), h('Tên tiếng Việt', 'Vietnamese name'), h('Bao gồm', 'Includes')]
    ls.getRow(1).eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } })
    ls.getColumn(1).width = 12; ls.getColumn(2).width = 32; ls.getColumn(3).width = 32; ls.getColumn(4).width = 70
    used.forEach((p, i) => { const r = ls.getRow(i + 2); r.values = [p.prefix, p.en, p.vn, L === 'en' ? p.includes_en : L === 'vn' ? p.includes_vn : `${p.includes_vn}\n${p.includes_en}`]; r.eachCell(c => { c.font = { name: 'Arial', size: 9 }; c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }; c.border = border }); r.getCell(1).font = { name: 'Arial', size: 9, bold: true, color: { argb: BROWN } } })
    const note = ls.getRow(used.length + 3); note.getCell(1).value = h('Ghi chú: ký hiệu = viết tắt tiếng Anh của họ vật liệu; loại con (gỗ tự nhiên, gỗ công nghiệp…) ghi ở cột Hạng mục/Thông số.', 'Note: code = English abbreviation of the material family; sub-types (solid wood, engineered wood…) are described in the Item / Specification columns.'); note.getCell(1).font = { name: 'Arial', size: 9, italic: true }
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
